import type {
  DeploymentStatus,
  EnrichDeploymentInput,
  Environment,
  RecordChangeInput,
  RecordDeploymentInput,
} from '@traceback/shared';
import {
  enrichDeploymentSchema,
  recordChangeSchema,
  recordDeploymentSchema,
} from '@traceback/shared';

/** What a GitHub delivery means for our domain, or why we ignored it. */
export type GithubDomainAction =
  | { kind: 'change'; input: RecordChangeInput }
  | { kind: 'deployment'; input: RecordDeploymentInput }
  | { kind: 'deployment_status'; externalId: string; input: EnrichDeploymentInput }
  | { kind: 'ignored'; reason: string };

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asEmail = (value: unknown): string | undefined => {
  const candidate = asString(value);
  return candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : undefined;
};

const ignored = (reason: string): GithubDomainAction => ({ kind: 'ignored', reason });

/** `refs/heads/main` -> `main`; leaves anything else untouched. */
export function stripRef(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

/**
 * GitHub environments are free-form strings; our schema is a fixed enum. Fold the
 * common naming conventions onto the enum and default to `development`, which is
 * the least alarming wrong answer for an unrecognised environment.
 */
export function mapGithubEnvironment(value: unknown): Environment {
  const raw = (asString(value) ?? '').toLowerCase();
  if (raw.includes('prod')) return 'production';
  if (raw.includes('stag')) return 'staging';
  if (raw.includes('prev') || raw.startsWith('pr-') || raw.includes('review')) return 'preview';
  if (raw.includes('test') || raw.includes('qa')) return 'test';
  return 'development';
}

const DEPLOYMENT_STATE_MAP: Record<string, DeploymentStatus> = {
  success: 'success',
  failure: 'failed',
  error: 'failed',
  in_progress: 'in_progress',
  queued: 'queued',
  pending: 'queued',
  inactive: 'cancelled',
};

const TERMINAL_STATES = new Set(['success', 'failure', 'error', 'inactive']);

function fromPush(payload: Record<string, unknown>): GithubDomainAction {
  const service = asString(asRecord(payload.repository)?.name);
  const head = asRecord(payload.head_commit);
  if (!head) return ignored('push without head_commit');

  const sha = asString(head.id);
  if (!sha) return ignored('push without a head commit sha');

  const files = [head.added, head.modified, head.removed]
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .filter((file): file is string => typeof file === 'string');

  const message = asString(head.message);
  const author = asRecord(head.author);

  const parsed = recordChangeSchema.safeParse({
    type: 'commit',
    sha,
    title: message?.split('\n')[0]?.slice(0, 500) || sha.slice(0, 7),
    message,
    authorEmail: asEmail(author?.email),
    authorName: asString(author?.name),
    branch: stripRef(asString(payload.ref)),
    url: asString(head.url),
    filesChanged: files,
    services: service ? [service] : [],
    occurredAt: asString(head.timestamp),
  });

  return parsed.success ? { kind: 'change', input: parsed.data } : ignored('invalid push payload');
}

function fromPullRequest(payload: Record<string, unknown>): GithubDomainAction {
  const pr = asRecord(payload.pull_request);
  const service = asString(asRecord(payload.repository)?.name);
  if (!pr) return ignored('pull_request without payload');

  const merged = pr.merged === true;
  const head = asRecord(pr.head);
  const sha = asString(pr.merge_commit_sha) ?? asString(head?.sha);
  if (!sha) return ignored('pull_request without a commit sha');

  const title = asString(pr.title) ?? sha.slice(0, 7);
  const parsed = recordChangeSchema.safeParse({
    type: merged ? 'merge' : 'pull_request',
    sha,
    title: title.slice(0, 500),
    message: asString(pr.body) ?? title,
    authorName: asString(asRecord(pr.user)?.login),
    branch: asString(head?.ref),
    url: asString(pr.html_url),
    filesChanged: [],
    services: service ? [service] : [],
    occurredAt: asString(pr.updated_at) ?? asString(pr.created_at),
  });

  return parsed.success
    ? { kind: 'change', input: parsed.data }
    : ignored('invalid pull_request payload');
}

function fromDeployment(payload: Record<string, unknown>): GithubDomainAction {
  const deployment = asRecord(payload.deployment);
  const service = asString(asRecord(payload.repository)?.name);
  if (!deployment || !service) return ignored('deployment without repository');

  const externalId = deployment.id !== undefined ? String(deployment.id) : undefined;

  const parsed = recordDeploymentSchema.safeParse({
    service,
    environment: mapGithubEnvironment(deployment.environment),
    status: 'queued',
    commitSha: asString(deployment.sha),
    branch: asString(deployment.ref),
    authorName: asString(asRecord(deployment.creator)?.login),
    url: asString(deployment.url),
    externalId,
    startedAt: asString(deployment.created_at),
    occurredAt: asString(deployment.created_at),
  });

  return parsed.success
    ? { kind: 'deployment', input: parsed.data }
    : ignored('invalid deployment payload');
}

function fromDeploymentStatus(payload: Record<string, unknown>): GithubDomainAction {
  const deployment = asRecord(payload.deployment);
  const status = asRecord(payload.deployment_status);
  if (!deployment || !status) return ignored('deployment_status without payload');

  const externalId = deployment.id !== undefined ? String(deployment.id) : undefined;
  const state = asString(status.state);
  const mapped = state ? DEPLOYMENT_STATE_MAP[state] : undefined;
  if (!externalId || !mapped) return ignored(`unmappable deployment_status ${state ?? 'unknown'}`);

  const createdAt = asString(status.created_at);
  const parsed = enrichDeploymentSchema.safeParse({
    status: mapped,
    finishedAt: state && TERMINAL_STATES.has(state) ? createdAt : undefined,
    occurredAt: createdAt,
  });

  return parsed.success
    ? { kind: 'deployment_status', externalId, input: parsed.data }
    : ignored('invalid deployment_status payload');
}

/**
 * Translate a GitHub delivery into a domain action. Pure: it validates its own
 * output through the same Zod schemas the REST API uses, so a malformed payload
 * degrades to `ignored` instead of writing something the rest of the system would
 * reject. Unknown events are acknowledged, never errors.
 */
export function interpretGithubDelivery(
  event: string,
  payload: Record<string, unknown>,
): GithubDomainAction {
  switch (event) {
    case 'push':
      return fromPush(payload);
    case 'pull_request':
      return fromPullRequest(payload);
    case 'deployment':
      return fromDeployment(payload);
    case 'deployment_status':
      return fromDeploymentStatus(payload);
    case 'ping':
      return ignored('ping');
    default:
      return ignored(`unhandled event: ${event}`);
  }
}

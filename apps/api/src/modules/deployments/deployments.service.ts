import type {
  Deployment,
  DeploymentCompleteness,
  DeploymentStatus,
  EnrichDeploymentInput,
  RecordDeploymentInput,
} from '@traceback/shared';
import type { Database } from '../../db/client';
import type { DeploymentRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { encodeCursor, decodeCursor } from '../../lib/cursor';
import type { AuditContext } from '../audit/audit.service';
import { writeAudit } from '../audit/audit.service';
import type { EventsService } from '../events/events.service';
import { createDeploymentsRepository, type DeploymentsRepository } from './deployments.repository';

const TERMINAL_STATUSES: ReadonlySet<DeploymentStatus> = new Set([
  'success',
  'failed',
  'rolled_back',
  'cancelled',
]);

/**
 * Deployment records arrive in pieces, so instead of pretending they are always
 * complete we *measure* completeness and surface it. Four independent facts, each
 * worth a quarter of the score.
 */
export function computeCompleteness(row: DeploymentRow): DeploymentCompleteness {
  const hasCommit = Boolean(row.commitSha);
  const hasAuthor = Boolean(row.authorEmail);
  const hasFinishedAt = Boolean(row.finishedAt);
  const isTerminal = TERMINAL_STATUSES.has(row.status);

  const flags = [hasCommit, hasAuthor, hasFinishedAt, isTerminal];
  return {
    hasCommit,
    hasAuthor,
    hasFinishedAt,
    isTerminal,
    score: flags.filter(Boolean).length / flags.length,
  };
}

export function toDeploymentDto(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    projectId: row.projectId,
    service: row.service,
    environment: row.environment,
    status: row.status,
    version: row.version,
    commitSha: row.commitSha,
    commitMessage: row.commitMessage,
    branch: row.branch,
    authorEmail: row.authorEmail,
    authorName: row.authorName,
    url: row.url,
    externalId: row.externalId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    rowVersion: row.rowVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A deployment DTO with its computed completeness flags flattened alongside it. */
export interface DeploymentWithCompleteness extends Deployment {
  completeness: DeploymentCompleteness;
}

export interface RecordDeploymentResult extends DeploymentWithCompleteness {
  replayed: boolean;
}

export interface DeploymentListResult {
  items: DeploymentWithCompleteness[];
  nextCursor: string | null;
}

export interface DeploymentsService {
  record(
    projectId: string,
    input: RecordDeploymentInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<RecordDeploymentResult>;
  enrich(
    projectId: string,
    deploymentId: string,
    input: EnrichDeploymentInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<DeploymentWithCompleteness>;
  list(
    projectId: string,
    filters: {
      environment?: RecordDeploymentInput['environment'] | undefined;
      status?: DeploymentStatus | undefined;
      service?: string | undefined;
      limit: number;
      cursor?: string | undefined;
    },
  ): Promise<DeploymentListResult>;
  get(projectId: string, deploymentId: string): Promise<DeploymentWithCompleteness>;
}

const parseDate = (value: string | undefined): Date | null => (value ? new Date(value) : null);

export function createDeploymentsService(db: Database, events: EventsService): DeploymentsService {
  const repo: DeploymentsRepository = createDeploymentsRepository(db);

  const withCompleteness = (row: DeploymentRow): DeploymentWithCompleteness => ({
    ...toDeploymentDto(row),
    completeness: computeCompleteness(row),
  });

  return {
    async record(projectId, input, actorId, context) {
      // Idempotency is anchored in the event store: the key that identifies this
      // submission is the same key that identifies its event.
      if (input.idempotencyKey) {
        const existing = await events.find(projectId, input.idempotencyKey);
        if (existing && existing.entityType === 'deployment') {
          const row = await repo.findById(projectId, existing.entityId);
          if (row) {
            return { ...withCompleteness(row), replayed: true };
          }
        }
      }

      const startedAt = parseDate(input.startedAt);
      const finishedAt = parseDate(input.finishedAt);
      const receivedAt = new Date();
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : (startedAt ?? receivedAt);

      const row = await db.transaction(async (tx) => {
        const txRepo = createDeploymentsRepository(tx);
        const inserted = await txRepo.insert({
          projectId,
          service: input.service,
          environment: input.environment,
          status: input.status,
          version: input.version ?? null,
          commitSha: input.commitSha ?? null,
          commitMessage: input.commitMessage ?? null,
          branch: input.branch ?? null,
          authorEmail: input.authorEmail ?? null,
          authorName: input.authorName ?? null,
          url: input.url ?? null,
          externalId: input.externalId ?? null,
          startedAt,
          finishedAt,
        });

        await events.append(
          {
            projectId,
            type: 'deployment.recorded',
            entityType: 'deployment',
            entityId: inserted.id,
            actorId,
            occurredAt,
            idempotencyKey: input.idempotencyKey,
            payload: {
              service: inserted.service,
              environment: inserted.environment,
              status: inserted.status,
              version: inserted.version,
              commitSha: inserted.commitSha,
            },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'create',
          entityType: 'deployment',
          entityId: inserted.id,
          after: toDeploymentDto(inserted) as unknown as Record<string, unknown>,
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return inserted;
      });

      return { ...withCompleteness(row), replayed: false };
    },

    async enrich(projectId, deploymentId, input, actorId, context) {
      const updated = await db.transaction(async (tx) => {
        const txRepo = createDeploymentsRepository(tx);
        const existing = await txRepo.findById(projectId, deploymentId);
        if (!existing) throw AppError.notFound('Deployment', deploymentId);

        const expected = input.rowVersion ?? existing.rowVersion;
        if (expected !== existing.rowVersion) {
          throw AppError.versionConflict('Deployment was modified by someone else', {
            expectedRowVersion: expected,
            currentRowVersion: existing.rowVersion,
            current: withCompleteness(existing),
          });
        }

        const row = await txRepo.update(
          projectId,
          deploymentId,
          {
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.version === undefined ? {} : { version: input.version }),
            ...(input.commitSha === undefined ? {} : { commitSha: input.commitSha }),
            ...(input.commitMessage === undefined ? {} : { commitMessage: input.commitMessage }),
            ...(input.branch === undefined ? {} : { branch: input.branch }),
            ...(input.authorEmail === undefined ? {} : { authorEmail: input.authorEmail }),
            ...(input.authorName === undefined ? {} : { authorName: input.authorName }),
            ...(input.url === undefined ? {} : { url: input.url }),
            ...(input.finishedAt === undefined
              ? {}
              : { finishedAt: parseDate(input.finishedAt ?? undefined) }),
            updatedAt: new Date(),
          },
          expected,
        );

        if (!row) {
          throw AppError.versionConflict('Deployment was modified by someone else', {
            expectedRowVersion: expected,
          });
        }

        await events.append(
          {
            projectId,
            type: 'deployment.enriched',
            entityType: 'deployment',
            entityId: deploymentId,
            actorId,
            occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
            idempotencyKey: input.idempotencyKey,
            payload: {
              status: row.status,
              version: row.version,
              commitSha: row.commitSha,
              completeness: computeCompleteness(row).score,
            },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'update',
          entityType: 'deployment',
          entityId: deploymentId,
          before: toDeploymentDto(existing) as unknown as Record<string, unknown>,
          after: toDeploymentDto(row) as unknown as Record<string, unknown>,
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return row;
      });

      return withCompleteness(updated);
    },

    async list(projectId, filters) {
      const cursorParts = filters.cursor ? decodeCursor(filters.cursor) : [];
      const rows = await repo.list(projectId, {
        environment: filters.environment,
        status: filters.status,
        service: filters.service,
        limit: filters.limit,
        cursorCreatedAt: cursorParts[0],
        cursorId: cursorParts[1],
      });

      const hasMore = rows.length > filters.limit;
      const page = hasMore ? rows.slice(0, filters.limit) : rows;
      const last = page[page.length - 1];

      return {
        items: page.map(withCompleteness),
        nextCursor: hasMore && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
      };
    },

    async get(projectId, deploymentId) {
      const row = await repo.findById(projectId, deploymentId);
      if (!row) throw AppError.notFound('Deployment', deploymentId);
      return withCompleteness(row);
    },
  };
}

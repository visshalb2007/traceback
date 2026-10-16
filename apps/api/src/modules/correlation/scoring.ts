import {
  CORRELATION_ALGORITHM_VERSION,
  type CorrelationCandidate,
  type CorrelationResult,
  type DeploymentStatus,
} from '@traceback/shared';

/**
 * The correlation engine is deliberately pure: it takes an incident, a candidate
 * (deployment or change) and a little history, and returns a 0–1 score plus the
 * human-readable reasons that produced it. No database, no clock, no randomness —
 * which is what makes it unit-testable and its output explainable to a human who
 * is deciding whether to trust a suggestion.
 *
 * The score is a weighted average of independent signals. Weights are normalised
 * over the signals that actually apply, so a change (which has no deployment
 * status) is scored on the same 0–1 scale as a deployment instead of being capped
 * by a signal it could never satisfy.
 */
export const CORRELATION_WEIGHTS = {
  /** Exponential decay: the closer in time to the incident, the more suspect. */
  timing: 0.3,
  /** The candidate touched the same service/component the incident names. */
  serviceOverlap: 0.22,
  /** Same environment (production incidents are rarely staging deploys). */
  environment: 0.12,
  /** File paths touched by the candidate overlap the incident's components. */
  fileOverlap: 0.14,
  /** A failed or rolled-back deployment is far more suspicious than a success. */
  deploymentStatus: 0.1,
  /** This author has been implicated in the same problem before. */
  authorHistory: 0.07,
  /** This service has been implicated in the same fingerprint before. */
  fingerprintHistory: 0.05,
} as const;

export const DEFAULT_HALF_LIFE_HOURS = 6;
/** History saturates at this many prior confirmations. */
const HISTORY_SATURATION = 3;

export interface IncidentFacts {
  id: string;
  service: string | null;
  environment: string | null;
  affectedComponents: string[];
  fingerprint: string;
  startedAt: Date;
}

export interface CandidateFacts {
  entityType: 'deployment' | 'change';
  entityId: string;
  happenedAt: Date;
  service: string | null;
  environment: string | null;
  status: DeploymentStatus | null;
  authorEmail: string | null;
  /** File paths touched (a deployment aggregates the files of its changes). */
  files: string[];
  /** Services/components touched. */
  services: string[];
}

export interface CorrelationContext {
  halfLifeHours?: number;
  /** Prior confirmed links for this fingerprint that involved the same author. */
  authorHistory?: number;
  /** Prior confirmed links for this fingerprint on the same service. */
  fingerprintHistory?: number;
  reasonThreshold?: number;
}

interface Signal {
  key: string;
  weight: number;
  score: number;
  reason: string | null;
  /** Reasons are normally gated by score; a categorical mismatch is always worth explaining. */
  alwaysExplain?: boolean;
}

const normalise = (value: string): string => value.trim().toLowerCase();

/** Jaccard similarity of two string sets, case-insensitive. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a.map(normalise).filter(Boolean));
  const setB = new Set(b.map(normalise).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const value of setA) if (setB.has(value)) intersection += 1;

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** `0.5 ** (Δt / halfLife)` — 1 at the incident, halving every half-life. */
export function timeDecayScore(happenedAt: Date, incidentAt: Date, halfLifeHours: number): number {
  const deltaHours = Math.abs(incidentAt.getTime() - happenedAt.getTime()) / 3_600_000;
  return 0.5 ** (deltaHours / halfLifeHours);
}

/** Only paths (they contain a separator or a dot) count as file overlap. */
const looksLikePath = (value: string): boolean =>
  value.includes('/') || value.includes('\\') || /\.[a-z0-9]+$/i.test(value);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const saturate = (count: number): number => clamp01(count / HISTORY_SATURATION);

const DEPLOYMENT_STATUS_SCORE: Record<DeploymentStatus, number> = {
  failed: 1,
  rolled_back: 0.9,
  cancelled: 0.5,
  in_progress: 0.4,
  queued: 0.3,
  unknown: 0.3,
  success: 0.25,
};

function collectSignals(
  incident: IncidentFacts,
  candidate: CandidateFacts,
  context: CorrelationContext,
): Signal[] {
  const halfLife = context.halfLifeHours ?? DEFAULT_HALF_LIFE_HOURS;
  const signals: Signal[] = [];

  const timing = timeDecayScore(candidate.happenedAt, incident.startedAt, halfLife);
  signals.push({
    key: 'timing',
    weight: CORRELATION_WEIGHTS.timing,
    score: timing,
    reason: `Happened ${hoursBetween(candidate.happenedAt, incident.startedAt)} from the incident`,
  });

  const incidentTargets = [
    ...(incident.service ? [incident.service] : []),
    ...incident.affectedComponents,
  ];
  const candidateTargets = [
    ...(candidate.service ? [candidate.service] : []),
    ...candidate.services,
  ];
  const serviceOverlap = jaccard(incidentTargets, candidateTargets);
  signals.push({
    key: 'serviceOverlap',
    weight: CORRELATION_WEIGHTS.serviceOverlap,
    score: serviceOverlap,
    reason:
      serviceOverlap > 0
        ? `Touches the same service/component as the incident (${Math.round(serviceOverlap * 100)}% overlap)`
        : null,
  });

  if (candidate.environment || incident.environment) {
    const same = Boolean(
      candidate.environment &&
      incident.environment &&
      candidate.environment === incident.environment,
    );
    const bothKnown = Boolean(candidate.environment && incident.environment);
    signals.push({
      key: 'environment',
      weight: CORRELATION_WEIGHTS.environment,
      score: bothKnown ? (same ? 1 : 0) : 0.5,
      reason: same
        ? `Deployed to the same environment (${candidate.environment})`
        : bothKnown
          ? `Different environment (${candidate.environment} vs ${incident.environment})`
          : null,
      alwaysExplain: bothKnown,
    });
  }

  const incidentFiles = incident.affectedComponents.filter(looksLikePath);
  if (incidentFiles.length > 0 && candidate.files.length > 0) {
    const fileOverlap = jaccard(incidentFiles, candidate.files);
    signals.push({
      key: 'fileOverlap',
      weight: CORRELATION_WEIGHTS.fileOverlap,
      score: fileOverlap,
      reason:
        fileOverlap > 0
          ? `Changed ${Math.round(fileOverlap * 100)}% of the files named by the incident`
          : null,
    });
  }

  if (candidate.entityType === 'deployment' && candidate.status) {
    const statusScore = DEPLOYMENT_STATUS_SCORE[candidate.status];
    signals.push({
      key: 'deploymentStatus',
      weight: CORRELATION_WEIGHTS.deploymentStatus,
      score: statusScore,
      reason:
        candidate.status === 'failed' || candidate.status === 'rolled_back'
          ? `Deployment ${candidate.status}`
          : null,
    });
  }

  if (context.authorHistory && context.authorHistory > 0) {
    signals.push({
      key: 'authorHistory',
      weight: CORRELATION_WEIGHTS.authorHistory,
      score: saturate(context.authorHistory),
      reason: `This author was linked to ${context.authorHistory} earlier incident(s) with the same fingerprint`,
    });
  }

  if (context.fingerprintHistory && context.fingerprintHistory > 0) {
    signals.push({
      key: 'fingerprintHistory',
      weight: CORRELATION_WEIGHTS.fingerprintHistory,
      score: saturate(context.fingerprintHistory),
      reason: `This service has been implicated in ${context.fingerprintHistory} earlier incident(s) with the same fingerprint`,
    });
  }

  return signals;
}

function hoursBetween(from: Date, to: Date): string {
  const hours = Math.abs(to.getTime() - from.getTime()) / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export interface ScoredCandidate extends CorrelationCandidate {
  /** Raw per-signal values, kept so a suggestion can be explained after the fact. */
  signalsDetail: Record<string, number>;
}

/**
 * Score one candidate. Returns a `CorrelationCandidate` (the wire shape) with the
 * score rounded to four decimals, ordered reasons and the raw signal values.
 */
export function scoreCandidate(
  incident: IncidentFacts,
  candidate: CandidateFacts,
  context: CorrelationContext = {},
): ScoredCandidate {
  const signals = collectSignals(incident, candidate, context);
  const reasonThreshold = context.reasonThreshold ?? 0.2;

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const weighted = signals.reduce((sum, signal) => sum + signal.weight * signal.score, 0);
  const score = totalWeight === 0 ? 0 : weighted / totalWeight;

  const reasons = signals
    .filter(
      (signal) =>
        signal.reason !== null && (signal.alwaysExplain || signal.score >= reasonThreshold),
    )
    .map((signal) => signal.reason as string);

  const signalsDetail: Record<string, number> = {};
  for (const signal of signals) signalsDetail[signal.key] = Number(signal.score.toFixed(4));

  return {
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    score: Number(score.toFixed(4)),
    reasons,
    signals: signalsDetail,
    signalsDetail,
  };
}

/** Score every candidate, drop the noise, and rank best-first. */
export function rankCandidates(
  incident: IncidentFacts,
  candidates: CandidateFacts[],
  context: CorrelationContext & { minScore?: number; limit?: number } = {},
): ScoredCandidate[] {
  const minScore = context.minScore ?? 0.25;
  const limit = context.limit ?? 5;

  return candidates
    .map((candidate) => scoreCandidate(incident, candidate, context))
    .filter((scored) => scored.score >= minScore)
    .sort((a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId))
    .slice(0, limit);
}

/** Wraps ranked candidates in the versioned result envelope clients receive. */
export function buildCorrelationResult(
  incidentId: string,
  candidates: CorrelationCandidate[],
  generatedAt: Date = new Date(),
): CorrelationResult {
  return {
    algorithmVersion: CORRELATION_ALGORITHM_VERSION,
    incidentId,
    candidates: candidates.map(({ entityType, entityId, score, reasons, signals }) => ({
      entityType,
      entityId,
      score,
      reasons,
      signals,
    })),
    generatedAt: generatedAt.toISOString(),
  };
}

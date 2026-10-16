import { describe, expect, it } from 'vitest';
import { CORRELATION_ALGORITHM_VERSION } from '@traceback/shared';
import {
  DEFAULT_HALF_LIFE_HOURS,
  buildCorrelationResult,
  jaccard,
  rankCandidates,
  scoreCandidate,
  timeDecayScore,
  type CandidateFacts,
  type IncidentFacts,
} from '../scoring';

const ID = {
  incident: '11111111-1111-4111-8111-111111111111',
  deployment: '22222222-2222-4222-8222-222222222222',
  change: '33333333-3333-4333-8333-333333333333',
  other: '44444444-4444-4444-8444-444444444444',
};

const at = (iso: string): Date => new Date(iso);

const first = <T>(items: readonly T[]): T => {
  const [head] = items;
  if (head === undefined) throw new Error('expected a non-empty array');
  return head;
};

const second = <T>(items: readonly T[]): T => first(items.slice(1));

const incident = (overrides: Partial<IncidentFacts> = {}): IncidentFacts => ({
  id: ID.incident,
  service: 'checkout-api',
  environment: 'production',
  affectedComponents: ['src/checkout.ts', 'src/payments.ts'],
  fingerprint: 'fingerprint-abc',
  startedAt: at('2026-01-01T12:00:00Z'),
  ...overrides,
});

const deployment = (overrides: Partial<CandidateFacts> = {}): CandidateFacts => ({
  entityType: 'deployment',
  entityId: ID.deployment,
  happenedAt: at('2026-01-01T12:00:00Z'),
  service: 'checkout-api',
  environment: 'production',
  status: 'failed',
  authorEmail: 'dev@example.com',
  files: ['src/checkout.ts', 'src/payments.ts'],
  services: [],
  ...overrides,
});

const change = (overrides: Partial<CandidateFacts> = {}): CandidateFacts => ({
  entityType: 'change',
  entityId: ID.change,
  happenedAt: at('2026-01-01T12:00:00Z'),
  service: 'checkout-api',
  environment: 'production',
  status: null,
  authorEmail: 'dev@example.com',
  files: ['src/checkout.ts', 'src/payments.ts'],
  services: [],
  ...overrides,
});

describe('jaccard', () => {
  it('is 1 for identical sets', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('is 0 for disjoint or empty sets', () => {
    expect(jaccard(['a'], ['b'])).toBe(0);
    expect(jaccard([], ['a'])).toBe(0);
  });

  it('measures partial overlap as intersection over union', () => {
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5, 5);
  });

  it('folds case and whitespace and ignores blanks', () => {
    expect(jaccard([' Checkout ', 'API'], ['checkout', 'api'])).toBe(1);
    expect(jaccard(['a', '  '], ['a'])).toBe(1);
  });
});

describe('timeDecayScore', () => {
  it('is 1 when the candidate lands exactly on the incident', () => {
    const t = at('2026-01-01T12:00:00Z');
    expect(timeDecayScore(t, t, DEFAULT_HALF_LIFE_HOURS)).toBe(1);
  });

  it('halves once per half-life, in both directions', () => {
    const incidentAt = at('2026-01-01T12:00:00Z');
    const before = at('2026-01-01T06:00:00Z');
    const after = at('2026-01-01T18:00:00Z');
    expect(timeDecayScore(before, incidentAt, 6)).toBeCloseTo(0.5, 5);
    expect(timeDecayScore(after, incidentAt, 6)).toBeCloseTo(0.5, 5);
    expect(timeDecayScore(at('2026-01-01T00:00:00Z'), incidentAt, 6)).toBeCloseTo(0.25, 5);
  });
});

describe('scoreCandidate', () => {
  it('scores a strong match highly and explains every signal', () => {
    const scored = scoreCandidate(incident(), deployment());

    expect(scored.score).toBeCloseTo(0.8333, 4);
    expect(scored.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('from the incident'),
        expect.stringContaining('same service/component'),
        expect.stringContaining('same environment'),
        expect.stringContaining('files named by the incident'),
        'Deployment failed',
      ]),
    );
    expect(scored.signalsDetail).toMatchObject({
      timing: 1,
      environment: 1,
      fileOverlap: 1,
      deploymentStatus: 1,
    });
  });

  it('penalises a distant candidate through the timing signal', () => {
    const distant = deployment({ happenedAt: at('2025-12-31T12:00:00Z') });
    const scored = scoreCandidate(incident(), distant);

    expect(scored.signalsDetail.timing).toBeCloseTo(0.0625, 4);
    // A near-zero timing score drops below the reason threshold and is not surfaced.
    expect(scored.reasons).not.toEqual(
      expect.arrayContaining([expect.stringContaining('from the incident')]),
    );
    expect(scored.score).toBeLessThan(scoreCandidate(incident(), deployment()).score);
  });

  it('scores a change on the same scale instead of capping it for a missing status', () => {
    const asChange = scoreCandidate(incident(), change());
    const asFailedDeploy = scoreCandidate(incident(), deployment({ status: 'failed' }));
    const asSuccessfulDeploy = scoreCandidate(incident(), deployment({ status: 'success' }));

    // A change has no status signal at all, so its weight is normalised away rather
    // than counted as a zero. It lands between an obviously-bad and an obviously-fine deploy.
    expect(asChange.score).toBeGreaterThan(0.5);
    expect(asChange.score).toBeLessThan(asFailedDeploy.score);
    expect(asChange.score).toBeGreaterThan(asSuccessfulDeploy.score);
    expect(asChange.signalsDetail.deploymentStatus).toBeUndefined();
  });

  it('folds in author and fingerprint history with saturation', () => {
    // A middling candidate: history can only raise a score that is not already saturated.
    const middling = deployment({ happenedAt: at('2026-01-02T00:00:00Z') });
    const withHistory = scoreCandidate(incident(), middling, {
      authorHistory: 5,
      fingerprintHistory: 1,
    });
    const without = scoreCandidate(incident(), middling);

    expect(withHistory.score).toBeGreaterThan(without.score);
    expect(withHistory.signalsDetail.authorHistory).toBe(1);
    expect(withHistory.signalsDetail.fingerprintHistory).toBeCloseTo(1 / 3, 4);
    expect(withHistory.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('same fingerprint')]),
    );
  });

  it('treats a different environment as a negative signal', () => {
    const scored = scoreCandidate(incident(), deployment({ environment: 'staging' }));
    expect(scored.signalsDetail.environment).toBe(0);
    expect(scored.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Different environment')]),
    );
  });
});

describe('rankCandidates', () => {
  it('orders best-first, drops noise and honours the limit', () => {
    const strong = deployment({ entityId: ID.deployment });
    const weak = change({
      entityId: ID.other,
      service: 'unrelated',
      files: [],
      environment: 'staging',
    });
    const medium = deployment({ entityId: ID.change, status: 'success' });

    const ranked = rankCandidates(incident(), [weak, strong, medium], { minScore: 0.5, limit: 2 });

    expect(ranked.map((candidate) => candidate.entityId)).toEqual([ID.deployment, ID.change]);
    expect(first(ranked).score).toBeGreaterThanOrEqual(second(ranked).score);
  });

  it('returns nothing when every candidate is below the floor', () => {
    const weak = deployment({
      service: 'unrelated',
      environment: 'staging',
      files: [],
      status: 'success',
      happenedAt: at('2025-12-01T00:00:00Z'),
    });
    expect(rankCandidates(incident(), [weak], { minScore: 0.5 })).toEqual([]);
  });
});

describe('buildCorrelationResult', () => {
  it('stamps the algorithm version and drops internal detail', () => {
    const scored = [scoreCandidate(incident(), deployment())];
    const result = buildCorrelationResult(ID.incident, scored, at('2026-01-01T12:05:00Z'));

    expect(result.algorithmVersion).toBe(CORRELATION_ALGORITHM_VERSION);
    expect(result.incidentId).toBe(ID.incident);
    expect(result.generatedAt).toBe('2026-01-01T12:05:00.000Z');
    expect(first(result.candidates)).toEqual({
      entityType: 'deployment',
      entityId: ID.deployment,
      score: first(scored).score,
      reasons: first(scored).reasons,
      signals: first(scored).signals,
    });
    expect(first(result.candidates)).not.toHaveProperty('signalsDetail');
  });
});

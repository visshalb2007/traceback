import { describe, expect, it } from 'vitest';
import { CORRELATION_ALGORITHM_VERSION } from '@traceback/shared';
import type { ChangeRow, DeploymentRow, IncidentLinkRow, IncidentRow } from '../../../db/schema';
import {
  changeToCandidate,
  deploymentToCandidate,
  planSuggestionWrite,
  toIncidentFacts,
  toIncidentLinkDto,
  toStoredCorrelationResult,
} from '../correlation.service';

const NOW = new Date('2026-03-01T09:00:00.000Z');

const first = <T>(items: readonly T[]): T => {
  const [head] = items;
  if (head === undefined) throw new Error('expected a non-empty array');
  return head;
};

const incidentRow = (overrides: Partial<IncidentRow> = {}): IncidentRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  title: 'Checkout 500s',
  description: null,
  severity: 'sev2',
  status: 'open',
  service: 'checkout-api',
  errorSignature: null,
  affectedComponents: ['src/checkout.ts'],
  environment: 'production',
  fingerprint: 'fp-1',
  startedAt: NOW,
  detectedAt: null,
  resolvedAt: null,
  resolvedBy: null,
  resolution: null,
  rowVersion: 1,
  createdBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const deploymentRow = (overrides: Partial<DeploymentRow> = {}): DeploymentRow => ({
  id: '33333333-3333-4333-8333-333333333333',
  projectId: '22222222-2222-4222-8222-222222222222',
  service: 'checkout-api',
  environment: 'production',
  status: 'failed',
  version: 'v1.2.3',
  commitSha: null,
  commitMessage: null,
  branch: null,
  authorEmail: 'dev@example.com',
  authorName: null,
  url: null,
  externalId: null,
  startedAt: new Date('2026-03-01T08:00:00.000Z'),
  finishedAt: new Date('2026-03-01T08:10:00.000Z'),
  rowVersion: 1,
  createdAt: new Date('2026-03-01T07:59:00.000Z'),
  updatedAt: NOW,
  ...overrides,
});

const changeRow = (overrides: Partial<ChangeRow> = {}): ChangeRow => ({
  id: '44444444-4444-4444-8444-444444444444',
  projectId: '22222222-2222-4222-8222-222222222222',
  deploymentId: null,
  type: 'commit',
  sha: 'deadbeef',
  title: 'fix checkout',
  message: null,
  authorEmail: 'dev@example.com',
  authorName: null,
  branch: null,
  url: null,
  filesChanged: ['src/checkout.ts'],
  services: ['checkout-api'],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const linkRow = (overrides: Partial<IncidentLinkRow> = {}): IncidentLinkRow => ({
  id: '55555555-5555-4555-8555-555555555555',
  incidentId: '11111111-1111-4111-8111-111111111111',
  entityType: 'deployment',
  entityId: '33333333-3333-4333-8333-333333333333',
  source: 'suggested',
  status: 'suggested',
  score: '0.8333',
  reasons: ['Deployment failed'],
  signals: { timing: 1 },
  algorithmVersion: CORRELATION_ALGORITHM_VERSION,
  note: null,
  createdBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('toIncidentFacts', () => {
  it('reduces the incident row to the fields the engine reads', () => {
    expect(toIncidentFacts(incidentRow())).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      service: 'checkout-api',
      environment: 'production',
      affectedComponents: ['src/checkout.ts'],
      fingerprint: 'fp-1',
      startedAt: NOW,
    });
  });
});

describe('deploymentToCandidate', () => {
  it('prefers the finish time and folds in the deployment changes files', () => {
    const candidate = deploymentToCandidate(deploymentRow(), ['src/checkout.ts']);
    expect(candidate.happenedAt).toEqual(new Date('2026-03-01T08:10:00.000Z'));
    expect(candidate.files).toEqual(['src/checkout.ts']);
    expect(candidate.entityType).toBe('deployment');
  });

  it('falls back through startedAt and createdAt for incomplete deployments', () => {
    const noFinish = deploymentToCandidate(deploymentRow({ finishedAt: null }));
    expect(noFinish.happenedAt).toEqual(new Date('2026-03-01T08:00:00.000Z'));

    const noTimestamps = deploymentToCandidate(
      deploymentRow({ finishedAt: null, startedAt: null }),
    );
    expect(noTimestamps.happenedAt).toEqual(new Date('2026-03-01T07:59:00.000Z'));
    expect(noTimestamps.status).toBe('failed');
  });
});

describe('changeToCandidate', () => {
  it('scores a change on its files and services with no deployment status', () => {
    const candidate = changeToCandidate(changeRow());
    expect(candidate).toMatchObject({
      entityType: 'change',
      entityId: '44444444-4444-4444-8444-444444444444',
      service: 'checkout-api',
      status: null,
      environment: null,
      files: ['src/checkout.ts'],
    });
  });

  it('handles a change that names no services', () => {
    expect(changeToCandidate(changeRow({ services: [] })).service).toBeNull();
  });
});

describe('toIncidentLinkDto', () => {
  it('parses the numeric score and ISO timestamps', () => {
    expect(toIncidentLinkDto(linkRow())).toMatchObject({
      id: '55555555-5555-4555-8555-555555555555',
      score: 0.8333,
      status: 'suggested',
      createdAt: '2026-03-01T09:00:00.000Z',
    });
  });

  it('keeps a null score for manual links', () => {
    expect(toIncidentLinkDto(linkRow({ source: 'manual', score: null })).score).toBeNull();
  });
});

describe('planSuggestionWrite', () => {
  it('inserts when there is nothing yet', () => {
    expect(planSuggestionWrite(undefined)).toBe('insert');
  });

  it('refreshes an undecided engine suggestion', () => {
    expect(planSuggestionWrite({ source: 'suggested', status: 'suggested' })).toBe('refresh');
  });

  it('never clobbers a human verdict or a manual link', () => {
    expect(planSuggestionWrite({ source: 'suggested', status: 'confirmed' })).toBe('keep');
    expect(planSuggestionWrite({ source: 'suggested', status: 'rejected' })).toBe('keep');
    expect(planSuggestionWrite({ source: 'manual', status: 'confirmed' })).toBe('keep');
  });
});

describe('toStoredCorrelationResult', () => {
  it('rebuilds the envelope from stored rows, keeping the algorithm version', () => {
    const result = toStoredCorrelationResult(
      '11111111-1111-4111-8111-111111111111',
      [linkRow()],
      NOW,
    );
    expect(result.algorithmVersion).toBe(CORRELATION_ALGORITHM_VERSION);
    expect(result.generatedAt).toBe('2026-03-01T09:00:00.000Z');
    expect(first(result.candidates)).toEqual({
      entityType: 'deployment',
      entityId: '33333333-3333-4333-8333-333333333333',
      score: 0.8333,
      reasons: ['Deployment failed'],
      signals: { timing: 1 },
    });
  });

  it('falls back to the current version and no candidates when empty', () => {
    const result = toStoredCorrelationResult('11111111-1111-4111-8111-111111111111', []);
    expect(result.algorithmVersion).toBe(CORRELATION_ALGORITHM_VERSION);
    expect(result.candidates).toEqual([]);
  });
});

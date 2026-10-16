import { describe, expect, it } from 'vitest';
import type { DeploymentRow } from '../../../db/schema';
import { computeCompleteness, toDeploymentDto } from '../deployments.service';

function row(overrides: Partial<DeploymentRow> = {}): DeploymentRow {
  const now = new Date('2026-02-01T10:00:00.000Z');
  return {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    service: 'checkout-api',
    environment: 'production',
    status: 'unknown',
    version: null,
    commitSha: null,
    commitMessage: null,
    branch: null,
    authorEmail: null,
    authorName: null,
    url: null,
    externalId: null,
    startedAt: null,
    finishedAt: null,
    rowVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('computeCompleteness', () => {
  it('scores a bare-bones record as zero', () => {
    const result = computeCompleteness(row());
    expect(result).toEqual({
      hasCommit: false,
      hasAuthor: false,
      hasFinishedAt: false,
      isTerminal: false,
      score: 0,
    });
  });

  it('awards a quarter per satisfied fact', () => {
    expect(computeCompleteness(row({ commitSha: 'abc1234' })).score).toBe(0.25);
    expect(computeCompleteness(row({ commitSha: 'abc1234', authorEmail: 'a@b.co' })).score).toBe(
      0.5,
    );
    expect(
      computeCompleteness(
        row({
          commitSha: 'abc1234',
          authorEmail: 'a@b.co',
          finishedAt: new Date(),
        }),
      ).score,
    ).toBe(0.75);
  });

  it('reaches one for a finished, attributed deployment', () => {
    const result = computeCompleteness(
      row({
        commitSha: 'abc1234',
        authorEmail: 'a@b.co',
        finishedAt: new Date(),
        status: 'success',
      }),
    );
    expect(result.score).toBe(1);
    expect(result.isTerminal).toBe(true);
  });

  it('treats failed/rolled_back/cancelled as terminal but a queued deploy as not', () => {
    expect(computeCompleteness(row({ status: 'failed' })).isTerminal).toBe(true);
    expect(computeCompleteness(row({ status: 'rolled_back' })).isTerminal).toBe(true);
    expect(computeCompleteness(row({ status: 'cancelled' })).isTerminal).toBe(true);
    expect(computeCompleteness(row({ status: 'in_progress' })).isTerminal).toBe(false);
    expect(computeCompleteness(row({ status: 'queued' })).isTerminal).toBe(false);
  });
});

describe('toDeploymentDto', () => {
  it('serialises nullable timestamps as null, not as a date string', () => {
    const dto = toDeploymentDto(row());
    expect(dto.startedAt).toBeNull();
    expect(dto.finishedAt).toBeNull();
    expect(dto.createdAt).toBe('2026-02-01T10:00:00.000Z');
  });
});

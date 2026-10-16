import { describe, expect, it } from 'vitest';
import { interpretGithubDelivery, mapGithubEnvironment, stripRef } from '../webhooks.github';

describe('stripRef', () => {
  it('unwraps branch refs', () => {
    expect(stripRef('refs/heads/main')).toBe('main');
    expect(stripRef('refs/tags/v1.0.0')).toBe('refs/tags/v1.0.0');
    expect(stripRef(undefined)).toBeUndefined();
  });
});

describe('mapGithubEnvironment', () => {
  it('folds common naming conventions onto the enum', () => {
    expect(mapGithubEnvironment('Production')).toBe('production');
    expect(mapGithubEnvironment('prod-eu')).toBe('production');
    expect(mapGithubEnvironment('Staging')).toBe('staging');
    expect(mapGithubEnvironment('pr-123')).toBe('preview');
    expect(mapGithubEnvironment('test')).toBe('test');
  });

  it('defaults unrecognised environments to development', () => {
    expect(mapGithubEnvironment('qa-sandbox-aleph')).toBe('test');
    expect(mapGithubEnvironment('mystery')).toBe('development');
    expect(mapGithubEnvironment(undefined)).toBe('development');
  });
});

describe('interpretGithubDelivery', () => {
  it('turns a push into a change with its files and service', () => {
    const action = interpretGithubDelivery('push', {
      ref: 'refs/heads/main',
      repository: { name: 'checkout-api' },
      head_commit: {
        id: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        message: 'fix: retry payments\n\nlonger body',
        author: { email: 'dev@example.com', name: 'Dev' },
        url: 'https://github.com/acme/checkout/commit/deadbeef',
        timestamp: '2026-01-01T10:00:00Z',
        added: ['src/a.ts'],
        modified: ['src/b.ts'],
        removed: ['src/c.ts'],
      },
    });

    expect(action.kind).toBe('change');
    if (action.kind !== 'change') return;
    expect(action.input).toMatchObject({
      type: 'commit',
      sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      title: 'fix: retry payments',
      branch: 'main',
      authorEmail: 'dev@example.com',
      services: ['checkout-api'],
    });
    expect(action.input.filesChanged).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('ignores a push without a head commit', () => {
    const action = interpretGithubDelivery('push', { repository: { name: 'x' } });
    expect(action).toEqual({ kind: 'ignored', reason: 'push without head_commit' });
  });

  it('turns a deployment into a queued deployment with an external id', () => {
    const action = interpretGithubDelivery('deployment', {
      repository: { name: 'checkout-api' },
      deployment: {
        id: 12345,
        sha: 'abc1234',
        ref: 'main',
        environment: 'Production',
        created_at: '2026-01-01T10:00:00Z',
        url: 'https://api.github.com/repos/acme/checkout/deployments/12345',
        creator: { login: 'octocat' },
      },
    });

    expect(action.kind).toBe('deployment');
    if (action.kind !== 'deployment') return;
    expect(action.input).toMatchObject({
      service: 'checkout-api',
      environment: 'production',
      status: 'queued',
      externalId: '12345',
      authorName: 'octocat',
    });
  });

  it('translates a deployment_status into an enrichment patch', () => {
    const action = interpretGithubDelivery('deployment_status', {
      deployment: { id: 12345 },
      deployment_status: { state: 'failure', created_at: '2026-01-01T10:05:00Z' },
    });

    expect(action).toEqual({
      kind: 'deployment_status',
      externalId: '12345',
      input: {
        status: 'failed',
        finishedAt: '2026-01-01T10:05:00Z',
        occurredAt: '2026-01-01T10:05:00Z',
      },
    });
  });

  it('maps an in-progress status without a finish time', () => {
    const action = interpretGithubDelivery('deployment_status', {
      deployment: { id: 99 },
      deployment_status: { state: 'in_progress', created_at: '2026-01-01T10:05:00Z' },
    });

    expect(action.kind).toBe('deployment_status');
    if (action.kind !== 'deployment_status') return;
    expect(action.input.status).toBe('in_progress');
    expect(action.input.finishedAt).toBeUndefined();
  });

  it('ignores an unmappable deployment status', () => {
    const action = interpretGithubDelivery('deployment_status', {
      deployment: { id: 99 },
      deployment_status: { state: 'galactic' },
    });
    expect(action.kind).toBe('ignored');
  });

  it('acknowledges a ping and unknown events without acting', () => {
    expect(interpretGithubDelivery('ping', {})).toEqual({ kind: 'ignored', reason: 'ping' });
    expect(interpretGithubDelivery('issues', {}).kind).toBe('ignored');
  });

  it('dedupes nothing but ignores a malformed pull_request', () => {
    const action = interpretGithubDelivery('pull_request', { pull_request: {} });
    expect(action.kind).toBe('ignored');
  });
});

import { describe, expect, it } from 'vitest';
import { ACTIONS, can, canManageRole, ROLE_PERMISSIONS } from '../policy';

describe('policy matrix', () => {
  it('grants every action to at least one role', () => {
    for (const action of ACTIONS) {
      const grantors = (
        Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>
      ).filter((role) => can(role, action));
      expect(grantors.length, `no role grants ${action}`).toBeGreaterThan(0);
    }
  });

  it('makes permissions monotonic: a higher rank has a superset of a lower one', () => {
    const order = ['viewer', 'member', 'maintainer', 'admin', 'owner'] as const;
    for (let i = 1; i < order.length; i += 1) {
      const lower = ROLE_PERMISSIONS[order[i - 1]!];
      const higher = ROLE_PERMISSIONS[order[i]!];
      for (const action of lower) {
        expect(higher, `${order[i]} should inherit ${action}`).toContain(action);
      }
    }
  });

  it('keeps destructive project actions owner-only', () => {
    expect(can('owner', 'project:delete')).toBe(true);
    expect(can('admin', 'project:delete')).toBe(false);
    expect(can('owner', 'member:transfer_ownership')).toBe(true);
    expect(can('admin', 'member:transfer_ownership')).toBe(false);
  });

  it('lets viewers read but never write', () => {
    expect(can('viewer', 'incident:read')).toBe(true);
    expect(can('viewer', 'incident:create')).toBe(false);
    expect(can('viewer', 'deployment:write')).toBe(false);
    expect(can('member', 'deployment:write')).toBe(false);
    expect(can('maintainer', 'deployment:write')).toBe(true);
  });

  it('restricts audit access and member management to admins and owners', () => {
    expect(can('maintainer', 'audit:read')).toBe(false);
    expect(can('admin', 'audit:read')).toBe(true);
    expect(can('member', 'member:invite')).toBe(false);
    expect(can('admin', 'member:invite')).toBe(true);
  });

  it('denies everything to an anonymous caller', () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });
});

describe('canManageRole', () => {
  it('only lets an owner manage the owner', () => {
    expect(canManageRole('owner', 'owner')).toBe(true);
    expect(canManageRole('admin', 'owner')).toBe(false);
    expect(canManageRole('owner', 'admin')).toBe(true);
  });

  it('stops peers from managing each other', () => {
    expect(canManageRole('admin', 'admin')).toBe(false);
    expect(canManageRole('maintainer', 'member')).toBe(true);
    expect(canManageRole('member', 'viewer')).toBe(true);
    expect(canManageRole('viewer', 'member')).toBe(false);
  });
});

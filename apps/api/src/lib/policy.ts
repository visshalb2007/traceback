import { PROJECT_ROLE_RANK, type ProjectRole } from '@traceback/shared';
import { AppError } from './errors';

/**
 * Single source of truth for authorization. Routes never compare roles by hand —
 * they call `authorize('incident:update')` and this matrix decides. Keeping the
 * matrix declarative makes the RBAC documentation a copy/paste exercise and stops
 * ad-hoc checks from drifting apart (see the RBAC matrix in the README).
 */
export const ACTIONS = [
  'project:read',
  'project:update',
  'project:delete',
  'project:transfer',
  'member:read',
  'member:invite',
  'member:update_role',
  'member:remove',
  'member:transfer_ownership',
  'deployment:read',
  'deployment:write',
  'change:read',
  'change:write',
  'incident:read',
  'incident:create',
  'incident:update',
  'incident:comment',
  'incident:link',
  'timeline:read',
  'correlation:read',
  'correlation:run',
  'dashboard:read',
  'audit:read',
  'webhook:manage',
  'apikey:manage',
] as const;

export type Action = (typeof ACTIONS)[number];

const VIEWER: readonly Action[] = [
  'project:read',
  'member:read',
  'deployment:read',
  'change:read',
  'incident:read',
  'timeline:read',
  'correlation:read',
  'dashboard:read',
];

const MEMBER: readonly Action[] = [
  ...VIEWER,
  'incident:create',
  'incident:comment',
  'incident:link',
];

const MAINTAINER: readonly Action[] = [
  ...MEMBER,
  'deployment:write',
  'change:write',
  'incident:update',
  'correlation:run',
];

const ADMIN: readonly Action[] = [
  ...MAINTAINER,
  'project:update',
  'member:invite',
  'member:update_role',
  'member:remove',
  'audit:read',
  'webhook:manage',
  'apikey:manage',
];

const OWNER: readonly Action[] = [
  ...ADMIN,
  'project:delete',
  'project:transfer',
  'member:transfer_ownership',
];

export const ROLE_PERMISSIONS: Record<ProjectRole, readonly Action[]> = {
  viewer: VIEWER,
  member: MEMBER,
  maintainer: MAINTAINER,
  admin: ADMIN,
  owner: OWNER,
};

const PERMISSION_SETS: Record<ProjectRole, ReadonlySet<Action>> = {
  viewer: new Set(VIEWER),
  member: new Set(MEMBER),
  maintainer: new Set(MAINTAINER),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
};

/** Pure predicate: does `role` grant `action`? No DB, no request, easy to test. */
export function can(role: ProjectRole | null | undefined, action: Action): boolean {
  if (!role) return false;
  return PERMISSION_SETS[role].has(action);
}

/** Throws the canonical 403 when the role does not grant the action. */
export function assertCan(role: ProjectRole | null | undefined, action: Action): void {
  if (!can(role, action)) {
    throw new AppError('FORBIDDEN', `Role ${role ?? 'anonymous'} cannot perform ${action}`, {
      action,
      role: role ?? null,
    });
  }
}

/** True when `actor` may act on a member holding `targetRole`. */
export function canManageRole(actorRole: ProjectRole, targetRole: ProjectRole): boolean {
  // Nobody may manage the owner, and you may not out-rank yourself.
  if (targetRole === 'owner') return actorRole === 'owner';
  return PROJECT_ROLE_RANK[actorRole] > PROJECT_ROLE_RANK[targetRole];
}

/** Only an owner can hand over ownership, and must demote themselves at the same time. */
export function canTransferOwnership(actorRole: ProjectRole): boolean {
  return actorRole === 'owner';
}

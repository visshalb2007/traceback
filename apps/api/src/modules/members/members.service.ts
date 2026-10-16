import type { InviteMemberInput, Member, ProjectRole } from '@traceback/shared';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import { canManageRole } from '../../lib/policy';
import type { AuditContext } from '../audit/audit.service';
import { writeAudit } from '../audit/audit.service';
import type { EventsService } from '../events/events.service';
import {
  createMembersRepository,
  type MembersRepository,
  type MemberWithUser,
} from './members.repository';
import { createUsersRepository } from '../users/users.repository';

function toMemberDto(row: MemberWithUser): Member {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface MembersService {
  list(projectId: string): Promise<Member[]>;
  invite(
    projectId: string,
    input: InviteMemberInput,
    actor: { userId: string; role: ProjectRole },
    context?: AuditContext,
  ): Promise<Member>;
  updateRole(
    projectId: string,
    targetUserId: string,
    role: ProjectRole,
    actor: { userId: string; role: ProjectRole },
    context?: AuditContext,
  ): Promise<Member>;
  remove(
    projectId: string,
    targetUserId: string,
    actor: { userId: string; role: ProjectRole },
    context?: AuditContext,
  ): Promise<void>;
}

export function createMembersService(db: Database, events: EventsService): MembersService {
  const members: MembersRepository = createMembersRepository(db);

  /** The last owner cannot leave or be demoted, or the project becomes unreachable. */
  async function assertNotLastOwner(
    repo: MembersRepository,
    projectId: string,
    targetRole: ProjectRole,
  ): Promise<void> {
    if (targetRole !== 'owner') return;
    const owners = await repo.countOwners(projectId);
    if (owners <= 1) {
      throw AppError.conflict('A project must always have at least one owner', {
        remainingOwners: owners,
      });
    }
  }

  async function loadMember(
    repo: MembersRepository,
    projectId: string,
    userId: string,
  ): Promise<MemberWithUser> {
    const rows = await repo.listMembers(projectId);
    const found = rows.find((row) => row.userId === userId);
    if (!found) throw AppError.notFound('Member', userId);
    return found;
  }

  return {
    async list(projectId) {
      const rows = await members.listMembers(projectId);
      return rows.map(toMemberDto);
    },

    async invite(projectId, input, actor, context) {
      if (!canManageRole(actor.role, input.role)) {
        throw AppError.forbidden(`grant the ${input.role} role`);
      }

      return db.transaction(async (tx) => {
        const txMembers = createMembersRepository(tx);
        const txUsers = createUsersRepository(tx);

        const user = await txUsers.findByEmail(input.email);
        if (!user) {
          // Email-based invitations are documented future work; today the invitee
          // must already have an account.
          throw AppError.notFound(
            `No TraceBack account exists for ${input.email}; ask them to register first`,
          );
        }

        const existing = await txMembers.findMember(projectId, user.id);
        if (existing) {
          throw AppError.conflict('That user is already a member of this project', {
            userId: user.id,
          });
        }

        const row = await txMembers.insertMember({
          projectId,
          userId: user.id,
          role: input.role,
        });

        await events.append(
          {
            projectId,
            type: 'member.added',
            entityType: 'member',
            entityId: row.id,
            actorId: actor.userId,
            payload: { userId: row.userId, role: input.role, email: user.email },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId: actor.userId,
          action: 'create',
          entityType: 'member',
          entityId: row.id,
          after: { userId: row.userId, role: input.role },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return toMemberDto({
          id: row.id,
          projectId: row.projectId,
          userId: row.userId,
          email: user.email,
          name: user.name,
          role: input.role,
          createdAt: row.createdAt,
        });
      });
    },

    async updateRole(projectId, targetUserId, role, actor, context) {
      return db.transaction(async (tx) => {
        const txMembers = createMembersRepository(tx);
        const target = await loadMember(txMembers, projectId, targetUserId);

        if (target.role === role) return toMemberDto(target);

        if (!canManageRole(actor.role, target.role) || !canManageRole(actor.role, role)) {
          throw AppError.forbidden(`change the role of a ${target.role} to ${role}`);
        }

        if (role !== 'owner') {
          await assertNotLastOwner(txMembers, projectId, target.role);
        }

        const row = await txMembers.updateRole(projectId, targetUserId, role);
        if (!row) throw AppError.notFound('Member', targetUserId);

        await events.append(
          {
            projectId,
            type: 'member.role_changed',
            entityType: 'member',
            entityId: row.id,
            actorId: actor.userId,
            payload: { userId: targetUserId, from: target.role, to: role },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId: actor.userId,
          action: 'role_change',
          entityType: 'member',
          entityId: row.id,
          before: { role: target.role },
          after: { role },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return toMemberDto({ ...target, role: row.role as ProjectRole });
      });
    },

    async remove(projectId, targetUserId, actor, context) {
      await db.transaction(async (tx) => {
        const txMembers = createMembersRepository(tx);
        const target = await loadMember(txMembers, projectId, targetUserId);

        if (target.userId === actor.userId) {
          throw AppError.conflict('You cannot remove yourself from the project');
        }

        if (!canManageRole(actor.role, target.role)) {
          throw AppError.forbidden(`remove a member with the ${target.role} role`);
        }

        await assertNotLastOwner(txMembers, projectId, target.role);

        const removed = await txMembers.deleteMember(projectId, targetUserId);
        if (!removed) throw AppError.notFound('Member', targetUserId);

        await events.append(
          {
            projectId,
            type: 'member.removed',
            entityType: 'member',
            entityId: target.id,
            actorId: actor.userId,
            payload: { userId: targetUserId, role: target.role },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId: actor.userId,
          action: 'delete',
          entityType: 'member',
          entityId: target.id,
          before: { userId: targetUserId, role: target.role },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });
      });
    },
  };
}

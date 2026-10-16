import type { InviteMemberInput, Member, ProjectRole } from '@traceback/shared';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import { canManageRole } from '../../lib/policy';
import { createMembersRepository, type MemberWithUser } from './members.repository';
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
  ): Promise<Member>;
  updateRole(
    projectId: string,
    targetUserId: string,
    role: ProjectRole,
    actor: { userId: string; role: ProjectRole },
  ): Promise<Member>;
  remove(
    projectId: string,
    targetUserId: string,
    actor: { userId: string; role: ProjectRole },
  ): Promise<void>;
}

export function createMembersService(db: Database): MembersService {
  const members = createMembersRepository(db);
  const users = createUsersRepository(db);

  async function assertNotLastOwner(projectId: string, targetRole: ProjectRole): Promise<void> {
    if (targetRole !== 'owner') return;
    const owners = await members.countOwners(projectId);
    if (owners <= 1) {
      throw AppError.conflict('A project must always have at least one owner', {
        remainingOwners: owners,
      });
    }
  }

  async function loadMember(projectId: string, userId: string): Promise<MemberWithUser> {
    const rows = await members.listMembers(projectId);
    const found = rows.find((row) => row.userId === userId);
    if (!found) throw AppError.notFound('Member', userId);
    return found;
  }

  return {
    async list(projectId) {
      const rows = await members.listMembers(projectId);
      return rows.map(toMemberDto);
    },

    async invite(projectId, input, actor) {
      if (!canManageRole(actor.role, input.role)) {
        throw AppError.forbidden(`grant the ${input.role} role`);
      }

      const user = await users.findByEmail(input.email);
      if (!user) {
        // Email-based invitations are documented future work; today the invitee
        // must already have an account.
        throw AppError.notFound(
          `No TraceBack account exists for ${input.email}; ask them to register first`,
        );
      }

      const existing = await members.findMember(projectId, user.id);
      if (existing) {
        throw AppError.conflict('That user is already a member of this project', {
          userId: user.id,
        });
      }

      const row = await members.insertMember({
        projectId,
        userId: user.id,
        role: input.role,
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
    },

    async updateRole(projectId, targetUserId, role, actor) {
      const target = await loadMember(projectId, targetUserId);

      if (target.role === role) return toMemberDto(target);

      if (!canManageRole(actor.role, target.role) || !canManageRole(actor.role, role)) {
        throw AppError.forbidden(`change the role of a ${target.role} to ${role}`);
      }

      if (role !== 'owner') {
        await assertNotLastOwner(projectId, target.role);
      }

      const row = await members.updateRole(projectId, targetUserId, role);
      if (!row) throw AppError.notFound('Member', targetUserId);

      return toMemberDto({ ...target, role: row.role as ProjectRole });
    },

    async remove(projectId, targetUserId, actor) {
      const target = await loadMember(projectId, targetUserId);

      if (target.userId === actor.userId) {
        throw AppError.conflict('You cannot remove yourself from the project');
      }

      if (!canManageRole(actor.role, target.role)) {
        throw AppError.forbidden(`remove a member with the ${target.role} role`);
      }

      await assertNotLastOwner(projectId, target.role);

      const removed = await members.deleteMember(projectId, targetUserId);
      if (!removed) throw AppError.notFound('Member', targetUserId);
    },
  };
}

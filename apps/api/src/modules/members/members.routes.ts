import { z } from 'zod';
import {
  errorResponseSchema,
  inviteMemberSchema,
  memberSchema,
  updateMemberRoleSchema,
  uuidSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { projectIdParamSchema } from '../projects/projects.routes';
import { createMembersService } from './members.service';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

const memberListSchema = z.object({ items: z.array(memberSchema) });
const memberParamsSchema = projectIdParamSchema.extend({ userId: uuidSchema });

export async function membersRoutes(app: AppServer): Promise<void> {
  const service = createMembersService(app.db);

  app.get(
    '/projects/:projectId/members',
    {
      preHandler: [app.requireAuth, app.authorize('member:read')],
      schema: {
        params: projectIdParamSchema,
        response: { 200: memberListSchema, ...commonErrors },
      },
    },
    async (request) => ({ items: await service.list(request.params.projectId) }),
  );

  app.post(
    '/projects/:projectId/members',
    {
      preHandler: [app.requireAuth, app.authorize('member:invite')],
      schema: {
        params: projectIdParamSchema,
        body: inviteMemberSchema,
        response: { 201: memberSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const member = await service.invite(request.params.projectId, request.body, {
        userId: request.auth!.userId,
        role: request.projectRole!,
      });
      void reply.status(201).header('location', `/api/v1/projects/${member.projectId}/members`);
      return member;
    },
  );

  app.patch(
    '/projects/:projectId/members/:userId',
    {
      preHandler: [app.requireAuth, app.authorize('member:update_role')],
      schema: {
        params: memberParamsSchema,
        body: updateMemberRoleSchema,
        response: { 200: memberSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.updateRole(request.params.projectId, request.params.userId, request.body.role, {
        userId: request.auth!.userId,
        role: request.projectRole!,
      }),
  );

  app.delete(
    '/projects/:projectId/members/:userId',
    {
      preHandler: [app.requireAuth, app.authorize('member:remove')],
      schema: {
        params: memberParamsSchema,
        response: { 204: z.null(), ...commonErrors },
      },
    },
    async (request, reply) => {
      await service.remove(request.params.projectId, request.params.userId, {
        userId: request.auth!.userId,
        role: request.projectRole!,
      });
      return reply.status(204).send(null);
    },
  );
}

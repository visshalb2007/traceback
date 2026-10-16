import { z } from 'zod';
import {
  createProjectSchema,
  errorResponseSchema,
  idParamSchema,
  projectSchema,
  projectWithRoleSchema,
  updateProjectSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createProjectsService } from './projects.service';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

const projectListSchema = z.object({ items: z.array(projectWithRoleSchema) });

export const projectIdParamSchema = z.object({ projectId: idParamSchema.shape.id });

export async function projectsRoutes(app: AppServer): Promise<void> {
  const service = createProjectsService(app.db);

  app.post(
    '/projects',
    {
      preHandler: app.requireAuth,
      schema: {
        body: createProjectSchema,
        response: { 201: projectWithRoleSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const project = await service.create(request.body, request.auth!.userId);
      void reply.status(201).header('location', `/api/v1/projects/${project.id}`);
      return project;
    },
  );

  app.get(
    '/projects',
    {
      preHandler: app.requireAuth,
      schema: { response: { 200: projectListSchema, ...commonErrors } },
    },
    async (request) => ({ items: await service.list(request.auth!.userId) }),
  );

  app.get(
    '/projects/:projectId',
    {
      preHandler: [app.requireAuth, app.authorize('project:read')],
      schema: {
        params: projectIdParamSchema,
        response: { 200: projectWithRoleSchema, ...commonErrors },
      },
    },
    async (request) => service.get(request.params.projectId, request.projectRole!),
  );

  app.patch(
    '/projects/:projectId',
    {
      preHandler: [app.requireAuth, app.authorize('project:update')],
      schema: {
        params: projectIdParamSchema,
        body: updateProjectSchema,
        response: { 200: projectSchema, ...commonErrors },
      },
    },
    async (request) => service.update(request.params.projectId, request.body),
  );

  app.delete(
    '/projects/:projectId',
    {
      preHandler: [app.requireAuth, app.authorize('project:delete')],
      schema: {
        params: projectIdParamSchema,
        response: { 204: z.null(), ...commonErrors },
      },
    },
    async (request, reply) => {
      await service.remove(request.params.projectId);
      return reply.status(204).send(null);
    },
  );
}

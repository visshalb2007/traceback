import fp from 'fastify-plugin';
import { AppError } from '../lib/errors';
import { assertCan, type Action } from '../lib/policy';
import { createMembersRepository } from '../modules/members/members.repository';

/**
 * Turns the policy matrix into a Fastify preHandler. The route declares *what*
 * is being done (`authorize('incident:update')`) and this guard resolves *who*
 * the caller is for the project in the URL, then applies the matrix.
 *
 * A non-member gets 404 rather than 403 so project existence is not leaked.
 */
export const rbacPlugin = fp(
  async (app) => {
    const members = createMembersRepository(app.db);
    app.decorate('membersRepository', members);

    app.decorate('authorize', (action: Action) => async (request) => {
      const userId = request.auth?.userId;
      if (!userId) {
        throw AppError.unauthorized();
      }

      const params = request.params as Record<string, string | undefined> | undefined;
      const projectId = params?.projectId ?? params?.id;
      if (!projectId) {
        throw new AppError(
          'INTERNAL_ERROR',
          'authorize() requires a :projectId (or :id) route parameter',
        );
      }

      const project = await members.findProjectById(projectId);
      if (!project || project.deletedAt) {
        throw AppError.notFound('Project', projectId);
      }

      // An API key carries its own fixed role and is bound to exactly one project.
      // A key used against a different project resolves to no role -> 404. It must
      // never fall back to the creator's membership, or a key scoped to project A
      // would silently act with the creator's role in project B.
      const role = request.apiKey
        ? request.apiKey.projectId === projectId
          ? request.apiKey.role
          : undefined
        : await members.findRole(projectId, userId);
      if (!role) {
        // Deliberately a 404: revealing "you are not a member" leaks existence.
        throw AppError.notFound('Project', projectId);
      }

      assertCan(role, action);

      request.project = project;
      request.projectRole = role;
    });
  },
  { name: 'traceback-rbac', dependencies: ['traceback-db', 'traceback-auth'] },
);

import type {
  CreateProjectInput,
  Project,
  ProjectRole,
  ProjectWithRole as ProjectWithRoleDto,
  UpdateProjectInput,
} from '@traceback/shared';
import type { Database } from '../../db/client';
import type { ProjectRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { AuditContext } from '../audit/audit.service';
import { writeAudit } from '../audit/audit.service';
import type { EventsService } from '../events/events.service';
import { createProjectsRepository, type ProjectsRepository } from './projects.repository';

export function toProjectDto(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    repositoryUrl: row.repositoryUrl,
    rowVersion: row.rowVersion,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lowercase kebab-case, collapsed separators, never empty. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    // Drop combining diacritics so "café" becomes "cafe", not "cafe-".
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'project';
}

export interface ProjectsService {
  create(
    input: CreateProjectInput,
    actorId: string,
    context?: AuditContext,
  ): Promise<ProjectWithRoleDto>;
  list(userId: string): Promise<ProjectWithRoleDto[]>;
  get(projectId: string, role: ProjectRole): Promise<ProjectWithRoleDto>;
  update(
    projectId: string,
    input: UpdateProjectInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<Project>;
  remove(projectId: string, actorId: string | null, context?: AuditContext): Promise<void>;
}

export function createProjectsService(db: Database, events: EventsService): ProjectsService {
  const repo: ProjectsRepository = createProjectsRepository(db);

  async function allocateSlug(base: string): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await repo.findBySlug(candidate);
      if (!existing) return candidate;
    }
    throw new AppError('CONFLICT', 'Could not allocate a unique project slug');
  }

  return {
    async create(input, actorId, context) {
      const base = slugify(input.slug ?? input.name);

      let slug = base;
      if (input.slug) {
        // An explicit slug is a promise: fail loudly rather than silently renaming.
        if (await repo.findBySlug(base)) {
          throw AppError.conflict(`Slug "${input.slug}" is already taken`, { field: 'slug' });
        }
      } else {
        slug = await allocateSlug(base);
      }

      const project = await db.transaction(async (tx) => {
        const txRepo = createProjectsRepository(tx);
        const created = await txRepo.create({
          name: input.name,
          slug,
          description: input.description ?? null,
          repositoryUrl: input.repositoryUrl ?? null,
          createdBy: actorId,
        });

        await events.append(
          {
            projectId: created.id,
            type: 'project.created',
            entityType: 'project',
            entityId: created.id,
            actorId,
            payload: { name: created.name, slug: created.slug },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId: created.id,
          actorId,
          action: 'create',
          entityType: 'project',
          entityId: created.id,
          after: toProjectDto(created) as unknown as Record<string, unknown>,
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return created;
      });

      return { ...toProjectDto(project), role: 'owner' };
    },

    async list(userId) {
      const rows = await repo.listForUser(userId);
      return rows.map((row) => ({ ...toProjectDto(row.project), role: row.role }));
    },

    async get(projectId, role) {
      const project = await repo.findById(projectId);
      if (!project) throw AppError.notFound('Project', projectId);
      return { ...toProjectDto(project), role };
    },

    async update(projectId, input, actorId, context) {
      const updated = await db.transaction(async (tx) => {
        const txRepo = createProjectsRepository(tx);
        const existing = await txRepo.findById(projectId);
        if (!existing) throw AppError.notFound('Project', projectId);

        const { rowVersion, ...patch } = input;
        const expected = rowVersion ?? existing.rowVersion;

        if (expected !== existing.rowVersion) {
          throw AppError.versionConflict('Project was modified by someone else', {
            expectedRowVersion: expected,
            currentRowVersion: existing.rowVersion,
            current: toProjectDto(existing),
          });
        }

        const row = await txRepo.update(
          projectId,
          {
            ...(patch.name === undefined ? {} : { name: patch.name }),
            ...(patch.description === undefined ? {} : { description: patch.description }),
            ...(patch.repositoryUrl === undefined ? {} : { repositoryUrl: patch.repositoryUrl }),
            updatedAt: new Date(),
          },
          expected,
        );

        if (!row) {
          throw AppError.versionConflict('Project was modified by someone else', {
            expectedRowVersion: expected,
          });
        }

        await events.append(
          {
            projectId,
            type: 'project.updated',
            entityType: 'project',
            entityId: projectId,
            actorId,
            payload: { changes: Object.keys(patch) },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'update',
          entityType: 'project',
          entityId: projectId,
          before: toProjectDto(existing) as unknown as Record<string, unknown>,
          after: toProjectDto(row) as unknown as Record<string, unknown>,
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return row;
      });

      return toProjectDto(updated);
    },

    async remove(projectId, actorId, context) {
      await db.transaction(async (tx) => {
        const txRepo = createProjectsRepository(tx);
        const existing = await txRepo.findById(projectId);
        if (!existing) throw AppError.notFound('Project', projectId);

        const deleted = await txRepo.softDelete(projectId, new Date());
        if (!deleted) throw AppError.notFound('Project', projectId);

        await events.append(
          {
            projectId,
            type: 'project.deleted',
            entityType: 'project',
            entityId: projectId,
            actorId,
            payload: { slug: existing.slug },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'delete',
          entityType: 'project',
          entityId: projectId,
          before: toProjectDto(existing) as unknown as Record<string, unknown>,
          ip: context?.ip,
          userAgent: context?.userAgent,
        });
      });
    },
  };
}

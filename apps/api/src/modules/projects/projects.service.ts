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
  create(input: CreateProjectInput, actorId: string): Promise<ProjectWithRoleDto>;
  list(userId: string): Promise<ProjectWithRoleDto[]>;
  get(projectId: string, role: ProjectRole): Promise<ProjectWithRoleDto>;
  update(projectId: string, input: UpdateProjectInput): Promise<Project>;
  remove(projectId: string): Promise<void>;
}

export function createProjectsService(db: Database): ProjectsService {
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
    async create(input, actorId) {
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

      const project = await repo.create({
        name: input.name,
        slug,
        description: input.description ?? null,
        repositoryUrl: input.repositoryUrl ?? null,
        createdBy: actorId,
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

    async update(projectId, input) {
      const existing = await repo.findById(projectId);
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

      const updated = await repo.update(
        projectId,
        {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
          ...(patch.repositoryUrl === undefined ? {} : { repositoryUrl: patch.repositoryUrl }),
          updatedAt: new Date(),
        },
        expected,
      );

      if (!updated) {
        throw AppError.versionConflict('Project was modified by someone else', {
          expectedRowVersion: expected,
        });
      }

      return toProjectDto(updated);
    },

    async remove(projectId) {
      const deleted = await repo.softDelete(projectId, new Date());
      if (!deleted) throw AppError.notFound('Project', projectId);
    },
  };
}

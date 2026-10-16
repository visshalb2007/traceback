import { and, desc, eq, gte, lt, lte, or } from 'drizzle-orm';
import type { AuditAction } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { auditLogs } from '../../db/schema';
import type { AuditLogRow, NewAuditLogRow } from '../../db/schema';

export interface AuditListFilters {
  action?: AuditAction | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  actorId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit: number;
  cursorCreatedAt?: string | undefined;
  cursorId?: string | undefined;
}

/**
 * The audit table is append-only: there is an `insert` and a read-side `list`, and
 * deliberately no update or delete. Rows are written by the same transaction that
 * performs the mutation (see `writeAudit`).
 */
export function createAuditRepository(db: DbExecutor) {
  return {
    async insert(row: NewAuditLogRow): Promise<AuditLogRow> {
      const [inserted] = await db.insert(auditLogs).values(row).returning();
      if (!inserted) throw new Error('failed to insert audit log');
      return inserted;
    },

    async list(projectId: string, filters: AuditListFilters): Promise<AuditLogRow[]> {
      const conditions = [eq(auditLogs.projectId, projectId)];

      if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
      if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
      if (filters.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
      if (filters.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));
      if (filters.from) conditions.push(gte(auditLogs.createdAt, filters.from));
      if (filters.to) conditions.push(lte(auditLogs.createdAt, filters.to));

      if (filters.cursorCreatedAt && filters.cursorId) {
        const cursorDate = new Date(filters.cursorCreatedAt);
        const keyset = or(
          lt(auditLogs.createdAt, cursorDate),
          and(eq(auditLogs.createdAt, cursorDate), lt(auditLogs.id, filters.cursorId)),
        );
        if (keyset) conditions.push(keyset);
      }

      return db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(filters.limit + 1);
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;

import fp from 'fastify-plugin';
import { createAuditService } from '../modules/audit/audit.service';

/**
 * Exposes the audit log to every module as `app.audit`. Writes go through
 * `writeAudit(executor, entry)` inside each mutation's transaction, so the audit
 * row and the change it describes commit or roll back together.
 */
export const auditPlugin = fp(
  async (app) => {
    app.decorate('audit', createAuditService(app.db));
  },
  { name: 'traceback-audit', dependencies: ['traceback-db'] },
);

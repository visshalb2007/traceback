import { pgEnum } from 'drizzle-orm/pg-core';
import { PROJECT_ROLES } from '@traceback/shared';

/**
 * Postgres enums are declared once here and re-used by the table modules. The
 * value lists come straight from @traceback/shared, so the DB, the Zod schemas
 * and the UI can never disagree about what a role or status is.
 */
export const projectRoleEnum = pgEnum('project_role', PROJECT_ROLES);

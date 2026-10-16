import { pgEnum } from 'drizzle-orm/pg-core';
import {
  CHANGE_TYPES,
  DEPLOYMENT_STATUSES,
  ENVIRONMENTS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  PROJECT_ROLES,
} from '@traceback/shared';

/**
 * Postgres enums are declared once here and re-used by the table modules. The
 * value lists come straight from @traceback/shared, so the DB, the Zod schemas
 * and the UI can never disagree about what a role or status is.
 */
export const projectRoleEnum = pgEnum('project_role', PROJECT_ROLES);

export const deploymentStatusEnum = pgEnum('deployment_status', DEPLOYMENT_STATUSES);
export const environmentEnum = pgEnum('environment', ENVIRONMENTS);
export const changeTypeEnum = pgEnum('change_type', CHANGE_TYPES);
export const incidentSeverityEnum = pgEnum('incident_severity', INCIDENT_SEVERITIES);
export const incidentStatusEnum = pgEnum('incident_status', INCIDENT_STATUSES);

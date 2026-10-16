import { pgEnum } from 'drizzle-orm/pg-core';
import {
  AUDIT_ACTIONS,
  CHANGE_TYPES,
  DEPLOYMENT_STATUSES,
  ENVIRONMENTS,
  EVENT_ENTITY_TYPES,
  EVENT_SOURCES,
  EVENT_TYPES,
  INCIDENT_LINK_ENTITY_TYPES,
  INCIDENT_LINK_SOURCES,
  INCIDENT_LINK_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  PROJECT_ROLES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_PROVIDERS,
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

export const eventTypeEnum = pgEnum('event_type', EVENT_TYPES);
export const eventEntityTypeEnum = pgEnum('event_entity_type', EVENT_ENTITY_TYPES);
export const eventSourceEnum = pgEnum('event_source', EVENT_SOURCES);

export const incidentLinkEntityTypeEnum = pgEnum(
  'incident_link_entity_type',
  INCIDENT_LINK_ENTITY_TYPES,
);
export const incidentLinkSourceEnum = pgEnum('incident_link_source', INCIDENT_LINK_SOURCES);
export const incidentLinkStatusEnum = pgEnum('incident_link_status', INCIDENT_LINK_STATUSES);

export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);
export const webhookProviderEnum = pgEnum('webhook_provider', WEBHOOK_PROVIDERS);
export const webhookDeliveryStatusEnum = pgEnum(
  'webhook_delivery_status',
  WEBHOOK_DELIVERY_STATUSES,
);

import { z } from 'zod';

/**
 * All domain enums for TraceBack. These are the single source of truth shared by
 * the API (Zod validation + Drizzle pgEnum) and the web app (UI labels/filters).
 */

export const projectRoleSchema = z.enum(['owner', 'admin', 'maintainer', 'member', 'viewer']);
export type ProjectRole = z.infer<typeof projectRoleSchema>;
export const PROJECT_ROLES = projectRoleSchema.options;

/** Higher number == more privilege. Used by the RBAC policy layer. */
export const PROJECT_ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  member: 2,
  maintainer: 3,
  admin: 4,
  owner: 5,
};

export const deploymentStatusSchema = z.enum([
  'queued',
  'in_progress',
  'success',
  'failed',
  'rolled_back',
  'cancelled',
  'unknown',
]);
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;
export const DEPLOYMENT_STATUSES = deploymentStatusSchema.options;

export const environmentSchema = z.enum([
  'production',
  'staging',
  'development',
  'preview',
  'test',
]);
export type Environment = z.infer<typeof environmentSchema>;
export const ENVIRONMENTS = environmentSchema.options;

export const changeTypeSchema = z.enum(['commit', 'pull_request', 'merge']);
export type ChangeType = z.infer<typeof changeTypeSchema>;
export const CHANGE_TYPES = changeTypeSchema.options;

export const incidentSeveritySchema = z.enum(['sev1', 'sev2', 'sev3', 'sev4']);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;
export const INCIDENT_SEVERITIES = incidentSeveritySchema.options;
export const INCIDENT_SEVERITY_RANK: Record<IncidentSeverity, number> = {
  sev1: 4,
  sev2: 3,
  sev3: 2,
  sev4: 1,
};

export const incidentStatusSchema = z.enum([
  'open',
  'investigating',
  'mitigated',
  'resolved',
  'closed',
]);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export const INCIDENT_STATUSES = incidentStatusSchema.options;

/** Allowed incident status transitions (a state machine, not a free-form field). */
export const INCIDENT_STATUS_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  open: ['investigating', 'mitigated', 'resolved', 'closed'],
  investigating: ['mitigated', 'resolved', 'closed', 'open'],
  mitigated: ['resolved', 'investigating'],
  resolved: ['closed', 'open'],
  closed: ['open'],
} as const;

export function canTransitionStatus(from: IncidentStatus, to: IncidentStatus): boolean {
  if (from === to) return false;
  return INCIDENT_STATUS_TRANSITIONS[from].includes(to);
}

export const incidentLinkSourceSchema = z.enum(['manual', 'suggested']);
export type IncidentLinkSource = z.infer<typeof incidentLinkSourceSchema>;
export const INCIDENT_LINK_SOURCES = incidentLinkSourceSchema.options;

export const incidentLinkStatusSchema = z.enum(['suggested', 'confirmed', 'rejected']);
export type IncidentLinkStatus = z.infer<typeof incidentLinkStatusSchema>;
export const INCIDENT_LINK_STATUSES = incidentLinkStatusSchema.options;

export const incidentLinkEntityTypeSchema = z.enum(['deployment', 'change']);
export type IncidentLinkEntityType = z.infer<typeof incidentLinkEntityTypeSchema>;
export const INCIDENT_LINK_ENTITY_TYPES = incidentLinkEntityTypeSchema.options;

export const eventSourceSchema = z.enum(['api', 'github', 'system']);
export type EventSource = z.infer<typeof eventSourceSchema>;
export const EVENT_SOURCES = eventSourceSchema.options;

export const eventTypeSchema = z.enum([
  'project.created',
  'project.updated',
  'project.deleted',
  'member.added',
  'member.role_changed',
  'member.removed',
  'deployment.recorded',
  'deployment.enriched',
  'change.recorded',
  'incident.created',
  'incident.updated',
  'incident.status_changed',
  'incident.severity_changed',
  'incident.assignee_added',
  'incident.assignee_removed',
  'incident.update_added',
  'incident.resolved',
  'incident.reopened',
  'incident.link_added',
  'incident.link_confirmed',
  'incident.link_rejected',
  'correlation.suggested',
  'fingerprint.grouped',
]);
export type EventType = z.infer<typeof eventTypeSchema>;
export const EVENT_TYPES = eventTypeSchema.options;

export const eventEntityTypeSchema = z.enum([
  'project',
  'member',
  'deployment',
  'change',
  'incident',
  'incident_update',
  'incident_link',
]);
export type EventEntityType = z.infer<typeof eventEntityTypeSchema>;
export const EVENT_ENTITY_TYPES = eventEntityTypeSchema.options;

export const auditActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'status_change',
  'role_change',
  'link',
  'login',
  'logout',
  'register',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;
export const AUDIT_ACTIONS = auditActionSchema.options;

export const webhookProviderSchema = z.enum(['github']);
export type WebhookProvider = z.infer<typeof webhookProviderSchema>;
export const WEBHOOK_PROVIDERS = webhookProviderSchema.options;

export const webhookDeliveryStatusSchema = z.enum(['received', 'processed', 'duplicate', 'failed']);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;
export const WEBHOOK_DELIVERY_STATUSES = webhookDeliveryStatusSchema.options;

/** Correlation algorithm version so stored suggestions always declare their provenance. */
export const CORRELATION_ALGORITHM_VERSION = 'correlation-v1';

/** A client-supplied `occurred_at` older than this threshold (ms) is flagged is_late. */
export const LATE_EVENT_THRESHOLD_MS = 5 * 60 * 1000;

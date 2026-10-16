'use client';

import type {
  ApiKey,
  ApiKeyWithSecret,
  AuditLog,
  AuthTokens,
  Change,
  ChangeType,
  CorrelationResult,
  CreateApiKeyInput,
  CreateIncidentInput,
  CreateProjectInput,
  CreateWebhookEndpointInput,
  DashboardMetrics,
  Deployment,
  DeploymentCompleteness,
  DeploymentStatus,
  Environment,
  EventEntityType,
  EventSource,
  EventType,
  Incident,
  IncidentCommentInput,
  IncidentFingerprintGroup,
  IncidentLink,
  IncidentSeverity,
  IncidentStatus,
  IncidentUpdate,
  LinkIncidentInput,
  LoginInput,
  Member,
  ProjectRole,
  ProjectWithRole,
  RecordChangeInput,
  RecordDeploymentInput,
  RegisterInput,
  SuggestionDecisionInput,
  TimelineItem,
  UpdateIncidentInput,
  UpdateProjectInput,
  UpdateWebhookEndpointInput,
  User,
  WebhookDelivery,
  WebhookEndpoint,
} from '@traceback/shared';
import { apiRequest, type QueryValue } from './api-client';

/** Deployment DTO as returned by the API: the row plus its computed completeness. */
export type DeploymentResponse = Deployment & { completeness: DeploymentCompleteness };

interface ListResponse<T> {
  items: T[];
  nextCursor?: string | null;
}

function toQuery(values: Record<string, QueryValue>): Record<string, QueryValue> {
  return values;
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export const authApi = {
  register: (input: RegisterInput) =>
    apiRequest<AuthTokens>('/api/v1/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    }),
  login: (input: LoginInput) =>
    apiRequest<AuthTokens>('/api/v1/auth/login', { method: 'POST', body: input, auth: false }),
  me: () => apiRequest<User>('/api/v1/auth/me'),
  logout: (refreshToken: string | undefined) =>
    apiRequest<void>('/api/v1/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    }),
};

/* -------------------------------------------------------------------------- */
/* Projects & members                                                         */
/* -------------------------------------------------------------------------- */

export const projectsApi = {
  list: () => apiRequest<ListResponse<ProjectWithRole>>('/api/v1/projects'),
  get: (projectId: string) => apiRequest<ProjectWithRole>(`/api/v1/projects/${projectId}`),
  create: (input: CreateProjectInput) =>
    apiRequest<ProjectWithRole>('/api/v1/projects', { method: 'POST', body: input }),
  update: (projectId: string, input: UpdateProjectInput) =>
    apiRequest<ProjectWithRole>(`/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      body: input,
    }),
  remove: (projectId: string) =>
    apiRequest<void>(`/api/v1/projects/${projectId}`, { method: 'DELETE' }),
};

export const membersApi = {
  list: (projectId: string) =>
    apiRequest<ListResponse<Member>>(`/api/v1/projects/${projectId}/members`),
  invite: (projectId: string, input: { email: string; role: ProjectRole }) =>
    apiRequest<Member>(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      body: input,
    }),
  updateRole: (projectId: string, userId: string, role: ProjectRole) =>
    apiRequest<Member>(`/api/v1/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),
  remove: (projectId: string, userId: string) =>
    apiRequest<void>(`/api/v1/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
};

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export const dashboardApi = {
  get: (projectId: string, windowDays: number) =>
    apiRequest<DashboardMetrics>(`/api/v1/projects/${projectId}/dashboard`, {
      query: toQuery({ windowDays }),
    }),
};

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

export interface TimelineFilters {
  types?: EventType[];
  entityType?: EventEntityType;
  entityId?: string;
  actorId?: string;
  environment?: string;
  source?: EventSource;
  isLate?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  order?: 'asc' | 'desc';
}

export const timelineApi = {
  list: (projectId: string, filters: TimelineFilters = {}) =>
    apiRequest<ListResponse<TimelineItem>>(`/api/v1/projects/${projectId}/timeline`, {
      query: toQuery({
        type: filters.types && filters.types.length ? filters.types.join(',') : undefined,
        entityType: filters.entityType,
        entityId: filters.entityId,
        actorId: filters.actorId,
        environment: filters.environment,
        source: filters.source,
        isLate: filters.isLate,
        from: filters.from,
        to: filters.to,
        limit: filters.limit,
        order: filters.order,
      }),
    }),
};

/* -------------------------------------------------------------------------- */
/* Deployments & changes                                                      */
/* -------------------------------------------------------------------------- */

export interface DeploymentFilters {
  environment?: Environment;
  status?: DeploymentStatus;
  service?: string;
  limit?: number;
}

export const deploymentsApi = {
  list: (projectId: string, filters: DeploymentFilters = {}) =>
    apiRequest<ListResponse<DeploymentResponse>>(`/api/v1/projects/${projectId}/deployments`, {
      query: toQuery({
        environment: filters.environment,
        status: filters.status,
        service: filters.service,
        limit: filters.limit,
      }),
    }),
  get: (projectId: string, deploymentId: string) =>
    apiRequest<DeploymentResponse>(`/api/v1/projects/${projectId}/deployments/${deploymentId}`),
  record: (projectId: string, input: RecordDeploymentInput) =>
    apiRequest<DeploymentResponse>(`/api/v1/projects/${projectId}/deployments`, {
      method: 'POST',
      body: input,
    }),
  enrich: (
    projectId: string,
    deploymentId: string,
    input: Partial<RecordDeploymentInput> & { rowVersion?: number },
  ) =>
    apiRequest<DeploymentResponse>(`/api/v1/projects/${projectId}/deployments/${deploymentId}`, {
      method: 'PATCH',
      body: input,
    }),
};

export interface ChangeFilters {
  type?: ChangeType;
  service?: string;
  authorEmail?: string;
  deploymentId?: string;
  limit?: number;
}

export const changesApi = {
  list: (projectId: string, filters: ChangeFilters = {}) =>
    apiRequest<ListResponse<Change>>(`/api/v1/projects/${projectId}/changes`, {
      query: toQuery({
        type: filters.type,
        service: filters.service,
        authorEmail: filters.authorEmail,
        deploymentId: filters.deploymentId,
        limit: filters.limit,
      }),
    }),
  get: (projectId: string, changeId: string) =>
    apiRequest<Change>(`/api/v1/projects/${projectId}/changes/${changeId}`),
  record: (projectId: string, input: RecordChangeInput) =>
    apiRequest<Change>(`/api/v1/projects/${projectId}/changes`, { method: 'POST', body: input }),
};

/* -------------------------------------------------------------------------- */
/* Incidents                                                                  */
/* -------------------------------------------------------------------------- */

export interface IncidentFilters {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  service?: string;
  search?: string;
  sort?: 'startedAt' | 'severity' | 'status' | 'updatedAt';
  order?: 'asc' | 'desc';
  limit?: number;
}

export const incidentsApi = {
  list: (projectId: string, filters: IncidentFilters = {}) =>
    apiRequest<ListResponse<Incident>>(`/api/v1/projects/${projectId}/incidents`, {
      query: toQuery({
        status: filters.status,
        severity: filters.severity,
        service: filters.service,
        search: filters.search,
        sort: filters.sort,
        order: filters.order,
        limit: filters.limit,
      }),
    }),
  get: (projectId: string, incidentId: string) =>
    apiRequest<Incident>(`/api/v1/projects/${projectId}/incidents/${incidentId}`),
  create: (projectId: string, input: CreateIncidentInput) =>
    apiRequest<Incident>(`/api/v1/projects/${projectId}/incidents`, {
      method: 'POST',
      body: input,
    }),
  update: (projectId: string, incidentId: string, input: UpdateIncidentInput) =>
    apiRequest<Incident>(`/api/v1/projects/${projectId}/incidents/${incidentId}`, {
      method: 'PATCH',
      body: input,
    }),
  changeStatus: (
    projectId: string,
    incidentId: string,
    input: {
      status: IncidentStatus;
      note?: string;
      expectedRowVersion?: number;
    },
  ) =>
    apiRequest<Incident>(`/api/v1/projects/${projectId}/incidents/${incidentId}/status`, {
      method: 'POST',
      body: input,
    }),
  listUpdates: (projectId: string, incidentId: string) =>
    apiRequest<ListResponse<IncidentUpdate>>(
      `/api/v1/projects/${projectId}/incidents/${incidentId}/updates`,
    ),
  addComment: (projectId: string, incidentId: string, input: IncidentCommentInput) =>
    apiRequest<IncidentUpdate>(`/api/v1/projects/${projectId}/incidents/${incidentId}/updates`, {
      method: 'POST',
      body: input,
    }),
  listRecurring: (projectId: string, minIncidents = 2) =>
    apiRequest<ListResponse<IncidentFingerprintGroup>>(
      `/api/v1/projects/${projectId}/incidents/recurring`,
      { query: toQuery({ minIncidents }) },
    ),
};

/* -------------------------------------------------------------------------- */
/* Correlation                                                                */
/* -------------------------------------------------------------------------- */

export const correlationApi = {
  suggestions: (projectId: string, incidentId: string) =>
    apiRequest<CorrelationResult>(
      `/api/v1/projects/${projectId}/incidents/${incidentId}/correlation`,
    ),
  run: (projectId: string, incidentId: string) =>
    apiRequest<CorrelationResult>(
      `/api/v1/projects/${projectId}/incidents/${incidentId}/correlation/run`,
      { method: 'POST' },
    ),
  listLinks: (projectId: string, incidentId: string) =>
    apiRequest<ListResponse<IncidentLink>>(
      `/api/v1/projects/${projectId}/incidents/${incidentId}/links`,
    ),
  addLink: (projectId: string, incidentId: string, input: LinkIncidentInput) =>
    apiRequest<IncidentLink>(`/api/v1/projects/${projectId}/incidents/${incidentId}/links`, {
      method: 'POST',
      body: input,
    }),
  decide: (projectId: string, incidentId: string, linkId: string, input: SuggestionDecisionInput) =>
    apiRequest<IncidentLink>(
      `/api/v1/projects/${projectId}/incidents/${incidentId}/links/${linkId}/decision`,
      { method: 'POST', body: input },
    ),
};

/* -------------------------------------------------------------------------- */
/* Settings: webhooks, API keys, audit                                        */
/* -------------------------------------------------------------------------- */

export const webhooksApi = {
  list: (projectId: string) =>
    apiRequest<ListResponse<WebhookEndpoint>>(`/api/v1/projects/${projectId}/webhooks`),
  create: (projectId: string, input: CreateWebhookEndpointInput) =>
    apiRequest<WebhookEndpoint>(`/api/v1/projects/${projectId}/webhooks`, {
      method: 'POST',
      body: input,
    }),
  update: (projectId: string, webhookId: string, input: UpdateWebhookEndpointInput) =>
    apiRequest<WebhookEndpoint>(`/api/v1/projects/${projectId}/webhooks/${webhookId}`, {
      method: 'PATCH',
      body: input,
    }),
  remove: (projectId: string, webhookId: string) =>
    apiRequest<void>(`/api/v1/projects/${projectId}/webhooks/${webhookId}`, { method: 'DELETE' }),
  deliveries: (projectId: string, limit = 50) =>
    apiRequest<ListResponse<WebhookDelivery>>(`/api/v1/projects/${projectId}/webhooks/deliveries`, {
      query: toQuery({ limit }),
    }),
};

export const apiKeysApi = {
  list: (projectId: string) =>
    apiRequest<ListResponse<ApiKey>>(`/api/v1/projects/${projectId}/api-keys`),
  create: (projectId: string, input: CreateApiKeyInput) =>
    apiRequest<ApiKeyWithSecret>(`/api/v1/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: input,
    }),
  revoke: (projectId: string, keyId: string) =>
    apiRequest<void>(`/api/v1/projects/${projectId}/api-keys/${keyId}`, { method: 'DELETE' }),
};

export interface AuditFilters {
  action?: AuditLog['action'];
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export const auditApi = {
  list: (projectId: string, filters: AuditFilters = {}) =>
    apiRequest<ListResponse<AuditLog>>(`/api/v1/projects/${projectId}/audit-logs`, {
      query: toQuery({
        action: filters.action,
        entityType: filters.entityType,
        entityId: filters.entityId,
        limit: filters.limit,
      }),
    }),
};

/* -------------------------------------------------------------------------- */
/* Query keys                                                                 */
/* -------------------------------------------------------------------------- */

/** Centralised keys so every mutation invalidates exactly the right queries. */
export const queryKeys = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  members: (projectId: string) => ['projects', projectId, 'members'] as const,
  dashboard: (projectId: string, windowDays: number) =>
    ['projects', projectId, 'dashboard', windowDays] as const,
  timeline: (projectId: string, filters: TimelineFilters) =>
    ['projects', projectId, 'timeline', filters] as const,
  deployments: (projectId: string, filters: DeploymentFilters) =>
    ['projects', projectId, 'deployments', filters] as const,
  deployment: (projectId: string, deploymentId: string) =>
    ['projects', projectId, 'deployments', deploymentId] as const,
  changes: (projectId: string, filters: ChangeFilters) =>
    ['projects', projectId, 'changes', filters] as const,
  incidents: (projectId: string, filters: IncidentFilters) =>
    ['projects', projectId, 'incidents', filters] as const,
  incident: (projectId: string, incidentId: string) =>
    ['projects', projectId, 'incidents', incidentId] as const,
  incidentUpdates: (projectId: string, incidentId: string) =>
    ['projects', projectId, 'incidents', incidentId, 'updates'] as const,
  incidentLinks: (projectId: string, incidentId: string) =>
    ['projects', projectId, 'incidents', incidentId, 'links'] as const,
  incidentSuggestions: (projectId: string, incidentId: string) =>
    ['projects', projectId, 'incidents', incidentId, 'correlation'] as const,
  recurring: (projectId: string) => ['projects', projectId, 'incidents', 'recurring'] as const,
  webhooks: (projectId: string) => ['projects', projectId, 'webhooks'] as const,
  webhookDeliveries: (projectId: string) =>
    ['projects', projectId, 'webhooks', 'deliveries'] as const,
  apiKeys: (projectId: string) => ['projects', projectId, 'api-keys'] as const,
  audit: (projectId: string, filters: AuditFilters) =>
    ['projects', projectId, 'audit', filters] as const,
};

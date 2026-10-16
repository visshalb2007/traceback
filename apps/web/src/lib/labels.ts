import type {
  DeploymentStatus,
  Environment,
  IncidentSeverity,
  IncidentLinkStatus,
  IncidentStatus,
  ProjectRole,
  WebhookDeliveryStatus,
} from '@traceback/shared';

/** Badge tone names, matching `components/ui/badge.tsx` variants. */
export type Tone =
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'muted';

export const severityMeta: Record<IncidentSeverity, { label: string; tone: Tone }> = {
  sev1: { label: 'SEV1', tone: 'destructive' },
  sev2: { label: 'SEV2', tone: 'warning' },
  sev3: { label: 'SEV3', tone: 'default' },
  sev4: { label: 'SEV4', tone: 'secondary' },
};

export const incidentStatusMeta: Record<IncidentStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'destructive' },
  investigating: { label: 'Investigating', tone: 'warning' },
  mitigated: { label: 'Mitigated', tone: 'default' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
};

export const deploymentStatusMeta: Record<DeploymentStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'muted' },
  in_progress: { label: 'In progress', tone: 'default' },
  success: { label: 'Success', tone: 'success' },
  failed: { label: 'Failed', tone: 'destructive' },
  rolled_back: { label: 'Rolled back', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  unknown: { label: 'Unknown', tone: 'outline' },
};

export const linkStatusMeta: Record<IncidentLinkStatus, { label: string; tone: Tone }> = {
  suggested: { label: 'Suggested', tone: 'default' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'muted' },
};

export const roleMeta: Record<ProjectRole, { label: string; tone: Tone }> = {
  owner: { label: 'Owner', tone: 'default' },
  admin: { label: 'Admin', tone: 'secondary' },
  maintainer: { label: 'Maintainer', tone: 'secondary' },
  member: { label: 'Member', tone: 'outline' },
  viewer: { label: 'Viewer', tone: 'muted' },
};

export const deliveryStatusMeta: Record<WebhookDeliveryStatus, { label: string; tone: Tone }> = {
  received: { label: 'Received', tone: 'default' },
  processed: { label: 'Processed', tone: 'success' },
  duplicate: { label: 'Duplicate', tone: 'muted' },
  failed: { label: 'Failed', tone: 'destructive' },
};

export const environmentLabels: Record<Environment, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  preview: 'Preview',
  test: 'Test',
};

/** Turns `incident.status_changed` into `Incident status changed` for timelines. */
export function humanizeEventType(type: string): string {
  const [entity, ...rest] = type.split('.');
  const action = rest.join(' ').replace(/_/g, ' ');
  const entityLabel = (entity ?? '').replace(/_/g, ' ');
  return `${entityLabel} ${action}`.replace(/\b\w/g, (char) => char.toUpperCase()).trim();
}

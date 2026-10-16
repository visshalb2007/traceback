import { z } from 'zod';
import { uuidSchema } from '../common';
import { deploymentStatusSchema, incidentSeveritySchema, incidentStatusSchema } from '../enums';

export const dashboardQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const incidentCountsSchema = z.object({
  bySeverity: z.record(incidentSeveritySchema, z.number().int()),
  byStatus: z.record(incidentStatusSchema, z.number().int()),
  total: z.number().int(),
});

export const mttrSchema = z.object({
  overallSeconds: z.number().nullable(),
  bySeverity: z.record(incidentSeveritySchema, z.number().nullable()),
  resolvedCount: z.number().int(),
});

export const deploymentFrequencySchema = z.object({
  totalDeployments: z.number().int(),
  perDay: z.number(),
  byEnvironment: z.record(z.string(), z.number().int()),
  byStatus: z.record(deploymentStatusSchema, z.number().int()),
  /** ISO date -> count, for the sparkline/chart. */
  daily: z.array(z.object({ date: z.string(), count: z.number().int() })),
});

export const changeFailureRateSchema = z.object({
  rate: z.number().min(0).max(1),
  failedDeployments: z.number().int(),
  totalDeployments: z.number().int(),
});

export const recurringIssueSchema = z.object({
  fingerprint: z.string(),
  title: z.string(),
  service: z.string().nullable(),
  occurrences: z.number().int(),
  avgMttrSeconds: z.number().nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  incidentIds: z.array(uuidSchema),
});
export type RecurringIssue = z.infer<typeof recurringIssueSchema>;

export const suspectDeploymentSchema = z.object({
  deploymentId: uuidSchema,
  service: z.string(),
  environment: z.string(),
  status: deploymentStatusSchema,
  version: z.string().nullable(),
  occurredAt: z.string(),
  linkedIncidentCount: z.number().int(),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});
export type SuspectDeployment = z.infer<typeof suspectDeploymentSchema>;

export const dashboardMetricsSchema = z.object({
  window: z.object({ from: z.string(), to: z.string(), days: z.number().int() }),
  incidents: incidentCountsSchema,
  mttr: mttrSchema,
  deployments: deploymentFrequencySchema,
  changeFailureRate: changeFailureRateSchema,
  recurringIssues: z.array(recurringIssueSchema),
  topSuspects: z.array(suspectDeploymentSchema),
  recentActivity: z.array(
    z.object({
      id: uuidSchema,
      type: z.string(),
      summary: z.string(),
      occurredAt: z.string(),
      isLate: z.boolean(),
    }),
  ),
});
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

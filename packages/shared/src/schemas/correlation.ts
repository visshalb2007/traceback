import { z } from 'zod';
import { uuidSchema } from '../common';
import { incidentLinkEntityTypeSchema } from '../enums';

export const correlationCandidateSchema = z.object({
  entityType: incidentLinkEntityTypeSchema,
  entityId: uuidSchema,
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  signals: z.record(z.number()),
});
export type CorrelationCandidate = z.infer<typeof correlationCandidateSchema>;

export const correlationResultSchema = z.object({
  algorithmVersion: z.string(),
  incidentId: uuidSchema,
  candidates: z.array(correlationCandidateSchema),
  generatedAt: z.string(),
});
export type CorrelationResult = z.infer<typeof correlationResultSchema>;

export const suggestionDecisionSchema = z.object({
  decision: z.enum(['confirm', 'reject']),
  note: z.string().max(2000).optional(),
});
export type SuggestionDecisionInput = z.infer<typeof suggestionDecisionSchema>;

export const rerunCorrelationSchema = z.object({
  lookbackHours: z.coerce.number().int().min(1).max(720).default(72),
  minScore: z.coerce.number().min(0).max(1).default(0.25),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});
export type RerunCorrelationInput = z.infer<typeof rerunCorrelationSchema>;

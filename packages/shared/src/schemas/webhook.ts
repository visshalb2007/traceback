import { z } from 'zod';
import { uuidSchema } from '../common';
import { webhookDeliveryStatusSchema, webhookProviderSchema } from '../enums';

export const createWebhookEndpointSchema = z.object({
  provider: webhookProviderSchema.default('github'),
  name: z.string().min(1).max(120),
  /** Shared secret used to verify the HMAC signature of incoming payloads. */
  secret: z.string().min(16).max(200),
  events: z.array(z.string().max(120)).max(50).default([]),
  active: z.boolean().default(true),
});
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export const updateWebhookEndpointSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    secret: z.string().min(16).max(200).optional(),
    events: z.array(z.string().max(120)).max(50).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'no fields to update' });
export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;

export const webhookEndpointSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  provider: webhookProviderSchema,
  name: z.string(),
  secretPreview: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.string(),
});
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

export const webhookDeliverySchema = z.object({
  id: uuidSchema,
  endpointId: uuidSchema,
  projectId: uuidSchema,
  deliveryId: z.string(),
  event: z.string(),
  status: webhookDeliveryStatusSchema,
  error: z.string().nullable(),
  receivedAt: z.string(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

/** What the public ingestion endpoint returns for every accepted delivery. */
export const webhookIngestResultSchema = z.object({
  deliveryId: z.string(),
  event: z.string(),
  status: webhookDeliveryStatusSchema,
  /** True when this `X-GitHub-Delivery` had already been processed. */
  duplicate: z.boolean(),
});
export type WebhookIngestResult = z.infer<typeof webhookIngestResultSchema>;

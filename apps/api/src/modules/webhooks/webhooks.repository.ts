import { and, desc, eq } from 'drizzle-orm';
import type { WebhookDeliveryStatus } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { webhookDeliveries, webhookEndpoints } from '../../db/schema';
import type {
  NewWebhookEndpointRow,
  WebhookDeliveryRow,
  WebhookEndpointRow,
} from '../../db/schema';

export interface WebhookEndpointPatch {
  name?: string;
  secret?: string;
  events?: string[];
  active?: boolean;
  updatedAt: Date;
}

export function createWebhooksRepository(db: DbExecutor) {
  return {
    async listEndpoints(projectId: string): Promise<WebhookEndpointRow[]> {
      return db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.projectId, projectId))
        .orderBy(desc(webhookEndpoints.createdAt));
    },

    async findEndpoint(projectId: string, id: string): Promise<WebhookEndpointRow | undefined> {
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.id, id)))
        .limit(1);
      return row;
    },

    /** Public ingestion path: the endpoint id alone identifies the project + secret. */
    async findEndpointById(id: string): Promise<WebhookEndpointRow | undefined> {
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, id))
        .limit(1);
      return row;
    },

    async insertEndpoint(row: NewWebhookEndpointRow): Promise<WebhookEndpointRow> {
      const [inserted] = await db.insert(webhookEndpoints).values(row).returning();
      if (!inserted) throw new Error('failed to insert webhook endpoint');
      return inserted;
    },

    async updateEndpoint(
      projectId: string,
      id: string,
      patch: WebhookEndpointPatch,
    ): Promise<WebhookEndpointRow | undefined> {
      const [row] = await db
        .update(webhookEndpoints)
        .set(patch)
        .where(and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.id, id)))
        .returning();
      return row;
    },

    async deleteEndpoint(projectId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(webhookEndpoints)
        .where(and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.id, id)))
        .returning({ id: webhookEndpoints.id });
      return rows.length > 0;
    },

    async insertDelivery(row: {
      endpointId: string;
      projectId: string;
      deliveryId: string;
      event: string;
      payload: Record<string, unknown>;
    }): Promise<WebhookDeliveryRow> {
      const [inserted] = await db.insert(webhookDeliveries).values(row).returning();
      if (!inserted) throw new Error('failed to insert webhook delivery');
      return inserted;
    },

    async findDelivery(
      endpointId: string,
      deliveryId: string,
    ): Promise<WebhookDeliveryRow | undefined> {
      const [row] = await db
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.endpointId, endpointId),
            eq(webhookDeliveries.deliveryId, deliveryId),
          ),
        )
        .limit(1);
      return row;
    },

    async markDelivery(
      id: string,
      status: WebhookDeliveryStatus,
      error?: string | null,
    ): Promise<WebhookDeliveryRow | undefined> {
      const [row] = await db
        .update(webhookDeliveries)
        .set({
          status,
          error: error ?? null,
          processedAt: status === 'received' ? null : new Date(),
        })
        .where(eq(webhookDeliveries.id, id))
        .returning();
      return row;
    },

    async listDeliveries(projectId: string, limit: number): Promise<WebhookDeliveryRow[]> {
      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.projectId, projectId))
        .orderBy(desc(webhookDeliveries.receivedAt))
        .limit(limit);
    },
  };
}

export type WebhooksRepository = ReturnType<typeof createWebhooksRepository>;

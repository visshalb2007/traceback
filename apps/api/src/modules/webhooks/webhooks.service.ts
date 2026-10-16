import type {
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookDelivery,
  WebhookEndpoint,
} from '@traceback/shared';
import type { Database } from '../../db/client';
import type { WebhookDeliveryRow, WebhookEndpointRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { AuditContext } from '../audit/audit.service';
import { writeAudit } from '../audit/audit.service';
import { createWebhooksRepository, type WebhooksRepository } from './webhooks.repository';

/** Never return a stored secret; show just enough to recognise it. */
export function secretPreview(secret: string): string {
  if (secret.length <= 4) return '••••';
  return `••••${secret.slice(-4)}`;
}

export function toWebhookEndpointDto(row: WebhookEndpointRow): WebhookEndpoint {
  return {
    id: row.id,
    projectId: row.projectId,
    provider: row.provider,
    name: row.name,
    secretPreview: secretPreview(row.secret),
    events: row.events,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWebhookDeliveryDto(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    endpointId: row.endpointId,
    projectId: row.projectId,
    deliveryId: row.deliveryId,
    event: row.event,
    status: row.status,
    error: row.error,
    receivedAt: row.receivedAt.toISOString(),
  };
}

export interface WebhooksService {
  listEndpoints(projectId: string): Promise<WebhookEndpoint[]>;
  createEndpoint(
    projectId: string,
    input: CreateWebhookEndpointInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<WebhookEndpoint>;
  updateEndpoint(
    projectId: string,
    endpointId: string,
    input: UpdateWebhookEndpointInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<WebhookEndpoint>;
  deleteEndpoint(
    projectId: string,
    endpointId: string,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<void>;
  listDeliveries(projectId: string, limit: number): Promise<WebhookDelivery[]>;
}

export function createWebhooksService(db: Database): WebhooksService {
  const repo: WebhooksRepository = createWebhooksRepository(db);

  return {
    async listEndpoints(projectId) {
      const rows = await repo.listEndpoints(projectId);
      return rows.map(toWebhookEndpointDto);
    },

    async createEndpoint(projectId, input, actorId, context) {
      return db.transaction(async (tx) => {
        const txRepo = createWebhooksRepository(tx);
        const inserted = await txRepo.insertEndpoint({
          projectId,
          provider: input.provider,
          name: input.name,
          secret: input.secret,
          events: input.events,
          active: input.active,
        });

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'create',
          entityType: 'webhook_endpoint',
          entityId: inserted.id,
          after: { name: inserted.name, provider: inserted.provider, events: inserted.events },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return toWebhookEndpointDto(inserted);
      });
    },

    async updateEndpoint(projectId, endpointId, input, actorId, context) {
      return db.transaction(async (tx) => {
        const txRepo = createWebhooksRepository(tx);
        const existing = await txRepo.findEndpoint(projectId, endpointId);
        if (!existing) throw AppError.notFound('Webhook endpoint', endpointId);

        const row = await txRepo.updateEndpoint(projectId, endpointId, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.secret === undefined ? {} : { secret: input.secret }),
          ...(input.events === undefined ? {} : { events: input.events }),
          ...(input.active === undefined ? {} : { active: input.active }),
          updatedAt: new Date(),
        });
        if (!row) throw AppError.notFound('Webhook endpoint', endpointId);

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'update',
          entityType: 'webhook_endpoint',
          entityId: endpointId,
          before: { name: existing.name, events: existing.events, active: existing.active },
          after: { name: row.name, events: row.events, active: row.active },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return toWebhookEndpointDto(row);
      });
    },

    async deleteEndpoint(projectId, endpointId, actorId, context) {
      await db.transaction(async (tx) => {
        const txRepo = createWebhooksRepository(tx);
        const existing = await txRepo.findEndpoint(projectId, endpointId);
        if (!existing) throw AppError.notFound('Webhook endpoint', endpointId);

        await txRepo.deleteEndpoint(projectId, endpointId);

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'delete',
          entityType: 'webhook_endpoint',
          entityId: endpointId,
          before: { name: existing.name, provider: existing.provider },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });
      });
    },

    async listDeliveries(projectId, limit) {
      const rows = await repo.listDeliveries(projectId, limit);
      return rows.map(toWebhookDeliveryDto);
    },
  };
}

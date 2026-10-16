import { createHash } from 'node:crypto';
import type { WebhookIngestResult } from '@traceback/shared';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import { createChangesService } from '../changes/changes.service';
import { createDeploymentsService } from '../deployments/deployments.service';
import { createDeploymentsRepository } from '../deployments/deployments.repository';
import type { EventsService } from '../events/events.service';
import { interpretGithubDelivery, type GithubDomainAction } from './webhooks.github';
import { createWebhooksRepository } from './webhooks.repository';
import { verifyGithubSignature } from './webhooks.signature';

export interface WebhookIngestInput {
  endpointId: string;
  event: string;
  deliveryId?: string | undefined;
  signature?: string | undefined;
  rawBody: Buffer;
  payload: Record<string, unknown>;
}

export interface WebhookIngestService {
  ingest(input: WebhookIngestInput): Promise<WebhookIngestResult>;
}

/**
 * The public ingestion path. It authenticates the *payload* (HMAC), not the caller,
 * dedupes on the provider's delivery id, records every attempt, and only then
 * applies the translated domain action. A processing failure is recorded and
 * reported, never thrown at GitHub as a 500 (which would trigger noisy retries).
 */
export function createWebhookIngestService(
  db: Database,
  events: EventsService,
): WebhookIngestService {
  const changes = createChangesService(db, events);
  const deployments = createDeploymentsService(db, events);

  async function apply(projectId: string, action: GithubDomainAction): Promise<void> {
    switch (action.kind) {
      case 'change':
        await changes.record(projectId, action.input, null);
        return;
      case 'deployment':
        await deployments.record(projectId, action.input, null);
        return;
      case 'deployment_status': {
        // The status event references the deployment by its provider id; if the
        // matching start event never arrived there is nothing to enrich yet.
        const repo = createDeploymentsRepository(db);
        const existing = await repo.findByExternalId(projectId, action.externalId);
        if (!existing) return;
        await deployments.enrich(projectId, existing.id, action.input, null);
        return;
      }
      case 'ignored':
        return;
    }
  }

  return {
    async ingest(input) {
      const repo = createWebhooksRepository(db);
      const endpoint = await repo.findEndpointById(input.endpointId);
      if (!endpoint || !endpoint.active) {
        throw AppError.notFound('Webhook endpoint', input.endpointId);
      }

      if (!verifyGithubSignature(endpoint.secret, input.rawBody, input.signature)) {
        throw AppError.unauthorized('Invalid webhook signature');
      }

      // GitHub always sends X-GitHub-Delivery; fall back to a body hash so a
      // delivery is still deduped when the header is missing.
      const deliveryId =
        input.deliveryId && input.deliveryId.length > 0
          ? input.deliveryId
          : createHash('sha256').update(input.rawBody).digest('hex');

      const existing = await repo.findDelivery(endpoint.id, deliveryId);
      if (existing) {
        return { deliveryId, event: existing.event, status: existing.status, duplicate: true };
      }

      const delivery = await repo.insertDelivery({
        endpointId: endpoint.id,
        projectId: endpoint.projectId,
        deliveryId,
        event: input.event,
        payload: input.payload,
      });

      try {
        await apply(endpoint.projectId, interpretGithubDelivery(input.event, input.payload));
        await repo.markDelivery(delivery.id, 'processed');
        return { deliveryId, event: input.event, status: 'processed', duplicate: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        await repo.markDelivery(delivery.id, 'failed', message);
        return { deliveryId, event: input.event, status: 'failed', duplicate: false };
      }
    },
  };
}

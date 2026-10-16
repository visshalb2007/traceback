import { z } from 'zod';
import { errorResponseSchema, webhookIngestResultSchema } from '@traceback/shared';
import type { AppServer } from '../../types';
import { AppError } from '../../lib/errors';
import { createWebhookIngestService } from './webhooks.ingest';

const paramsSchema = z.object({ endpointId: z.string().uuid() });

const headerValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * The public GitHub receiver, mounted at the root (not under `/api/v1`) because it
 * is called by GitHub, not by our own client.
 *
 * It registers a scoped JSON content-type parser that hands the handler the raw
 * bytes: the HMAC signature is computed over the exact request body, so the body
 * must be hashed *before* it is parsed. Fastify scopes content-type parsers to the
 * plugin they are registered in, so this does not affect any other route.
 */
export async function webhookIngestRoutes(app: AppServer): Promise<void> {
  const service = createWebhookIngestService(app.db, app.events);

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post(
    '/webhooks/github/:endpointId',
    {
      schema: {
        params: paramsSchema,
        response: {
          202: webhookIngestResultSchema,
          ...{ 400: errorResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema },
        },
      },
    },
    async (request, reply) => {
      const raw = request.body;
      if (!Buffer.isBuffer(raw)) {
        throw AppError.validation('Expected a raw request body');
      }

      let payload: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw.toString('utf8'));
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('body is not an object');
        }
        payload = parsed as Record<string, unknown>;
      } catch {
        throw AppError.validation('Request body must be a JSON object');
      }

      const result = await service.ingest({
        endpointId: request.params.endpointId,
        event: headerValue(request.headers['x-github-event']) ?? 'unknown',
        deliveryId: headerValue(request.headers['x-github-delivery']),
        signature: headerValue(request.headers['x-hub-signature-256']),
        rawBody: raw,
        payload,
      });

      if (result.duplicate) {
        void reply.header('x-webhook-duplicate', 'true');
      }
      return reply.status(202).send(result);
    },
  );
}

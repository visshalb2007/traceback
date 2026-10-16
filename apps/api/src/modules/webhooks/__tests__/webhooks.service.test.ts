import { describe, expect, it } from 'vitest';
import type { WebhookDeliveryRow, WebhookEndpointRow } from '../../../db/schema';
import { secretPreview, toWebhookDeliveryDto, toWebhookEndpointDto } from '../webhooks.service';

const NOW = new Date('2026-04-01T12:00:00.000Z');

const endpointRow = (overrides: Partial<WebhookEndpointRow> = {}): WebhookEndpointRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  provider: 'github',
  name: 'CI deploys',
  secret: 'super-secret-value-1234',
  events: ['push', 'deployment_status'],
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('secretPreview', () => {
  it('reveals only the last four characters', () => {
    expect(secretPreview('super-secret-value-1234')).toBe('••••1234');
  });

  it('hides short secrets entirely', () => {
    expect(secretPreview('abc')).toBe('••••');
  });
});

describe('toWebhookEndpointDto', () => {
  it('maps the row and never leaks the stored secret', () => {
    const dto = toWebhookEndpointDto(endpointRow());
    expect(dto).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      provider: 'github',
      secretPreview: '••••1234',
      active: true,
      createdAt: '2026-04-01T12:00:00.000Z',
    });
    expect(JSON.stringify(dto)).not.toContain('super-secret-value');
  });
});

describe('toWebhookDeliveryDto', () => {
  it('maps the delivery row', () => {
    const row: WebhookDeliveryRow = {
      id: '33333333-3333-4333-8333-333333333333',
      endpointId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      deliveryId: 'delivery-1',
      event: 'push',
      status: 'processed',
      payload: null,
      error: null,
      receivedAt: NOW,
      processedAt: NOW,
    };

    expect(toWebhookDeliveryDto(row)).toEqual({
      id: row.id,
      endpointId: row.endpointId,
      projectId: row.projectId,
      deliveryId: 'delivery-1',
      event: 'push',
      status: 'processed',
      error: null,
      receivedAt: '2026-04-01T12:00:00.000Z',
    });
  });
});

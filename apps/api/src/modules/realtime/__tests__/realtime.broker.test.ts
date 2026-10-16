import { describe, expect, it } from 'vitest';
import { parseNotification } from '../realtime.broker';

describe('parseNotification', () => {
  it('parses a well-formed trigger payload', () => {
    const payload = JSON.stringify({
      projectId: '11111111-1111-4111-8111-111111111111',
      eventId: '22222222-2222-4222-8222-222222222222',
      sequence: 42,
      type: 'incident.created',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });

    expect(parseNotification(payload)).toEqual({
      projectId: '11111111-1111-4111-8111-111111111111',
      eventId: '22222222-2222-4222-8222-222222222222',
      sequence: 42,
      type: 'incident.created',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('drops malformed JSON instead of throwing', () => {
    expect(parseNotification('not json')).toBeNull();
  });

  it('drops payloads that are missing required fields', () => {
    expect(parseNotification(JSON.stringify({ projectId: 'p' }))).toBeNull();
    expect(
      parseNotification(
        JSON.stringify({
          projectId: 'p',
          eventId: 'e',
          sequence: 'not-a-number',
          type: 't',
          occurredAt: 'x',
        }),
      ),
    ).toBeNull();
  });

  it('drops non-object payloads', () => {
    expect(parseNotification('42')).toBeNull();
    expect(parseNotification('null')).toBeNull();
  });
});

-- Push every new event to listeners over Postgres NOTIFY.
--
-- The SSE endpoint fans live updates out by LISTENing on this channel instead of
-- polling the events table. Doing it in a trigger (rather than in application code)
-- means *every* writer — the API today, a backfill or webhook worker tomorrow —
-- emits the same signal, and the notification only fires once the row is committed.
CREATE OR REPLACE FUNCTION traceback_notify_event() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'traceback_events',
    json_build_object(
      'projectId', NEW.project_id,
      'eventId', NEW.id,
      'sequence', NEW.sequence,
      'type', NEW.type,
      'occurredAt', NEW.occurred_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_notify_trigger ON events;
CREATE TRIGGER events_notify_trigger
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION traceback_notify_event();

-- Migration: Add LISTEN/NOTIFY trigger for outbox events
-- 
-- This trigger sends a PostgreSQL notification whenever a new event
-- is inserted into the outbox table, enabling real-time event processing
-- instead of relying solely on polling.
--
-- The notification payload is JSON containing the event_id and event_type,
-- which allows the listener to decide whether to process immediately or
-- batch multiple events.

-- Create the notification function
CREATE OR REPLACE FUNCTION notify_outbox_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Send notification with JSON payload containing event details
    PERFORM pg_notify(
        'outbox_events',
        json_build_object(
            'event_id', NEW.event_id,
            'event_type', NEW.event_type,
            'created_at', NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment documenting the function
COMMENT ON FUNCTION notify_outbox_event() IS 
    'Sends a PostgreSQL NOTIFY on outbox_events channel when new events are inserted. '
    'Payload is JSON with event_id, event_type, and created_at fields.';

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS outbox_notify_trigger ON ingestion_outbox;

-- Create trigger on INSERT
-- Using AFTER INSERT so the row is already committed and visible to listeners
CREATE TRIGGER outbox_notify_trigger
    AFTER INSERT ON ingestion_outbox
    FOR EACH ROW
    EXECUTE FUNCTION notify_outbox_event();

-- Add comment documenting the trigger
COMMENT ON TRIGGER outbox_notify_trigger ON ingestion_outbox IS
    'Fires notify_outbox_event() after each INSERT to enable real-time event processing.';

-- Create index on created_at for efficient catch-up queries
-- (when listener reconnects after disconnect, it queries events since last seen)
CREATE INDEX IF NOT EXISTS idx_ingestion_outbox_created_at 
    ON ingestion_outbox (created_at DESC)
    WHERE published_at IS NULL;

-- Verify the trigger was created successfully
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'outbox_notify_trigger'
    ) THEN
        RAISE EXCEPTION 'Trigger outbox_notify_trigger was not created successfully';
    END IF;
    
    RAISE NOTICE 'Migration complete: outbox LISTEN/NOTIFY trigger installed';
END;
$$;

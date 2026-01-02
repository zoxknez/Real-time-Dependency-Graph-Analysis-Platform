-- Migration: Add Transactional Outbox Pattern
-- Purpose: Enable reliable, at-least-once event publishing with idempotency guarantees
-- Author: Inverse Dependencies Platform Team
-- Date: 2026-01-01

-- ============================================================================
-- 1. TRANSACTIONAL OUTBOX TABLE
-- ============================================================================
-- This table implements the Transactional Outbox pattern for reliable event publishing.
-- All domain events are first written to this table within the same database transaction
-- that updates application state, ensuring atomicity and consistency.
--
-- Key features:
-- - Deterministic event_id for idempotency
-- - SKIP LOCKED support for horizontal scaling
-- - Retry/backoff mechanism via next_retry_at
-- - Status tracking for observability
-- - Dead letter queue integration

CREATE TABLE IF NOT EXISTS ingestion_outbox (
  -- Primary key (auto-incrementing for ordering)
  id BIGSERIAL PRIMARY KEY,

  -- Deterministic event identifier (SHA256 hash)
  -- Format: sha256(event_type + ecosystem + entity_id + payload_hash)
  -- This enables idempotent processing: same real-world event = same event_id
  event_id TEXT NOT NULL,

  -- Event type/schema identifier
  -- Examples: 'package.upserted', 'version.upserted', 'version.yanked', 'package.deleted'
  event_type TEXT NOT NULL,

  -- Target Kafka/Redpanda topic
  -- Examples: 'domain.package.upsert.v1', 'domain.version.yanked.v1'
  topic TEXT NOT NULL,

  -- Partition key for Kafka (ensures ordering per entity)
  -- Format: 'ecosystem:package_name' or 'ecosystem:package_name:version'
  partition_key TEXT NOT NULL,

  -- Serialized protobuf message (binary)
  payload BYTEA NOT NULL,

  -- Additional headers for Kafka message (JSON format)
  -- Can include tracing context, content-type, etc.
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Processing status
  -- Values: 'pending', 'publishing', 'published', 'failed', 'deadletter'
  status TEXT NOT NULL DEFAULT 'pending',

  -- Number of publish attempts (for retry logic)
  attempts INT NOT NULL DEFAULT 0,

  -- When to retry next (for exponential backoff)
  -- Format: NOW() + backoff_interval
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Which publisher instance currently owns this row (for distributed processing)
  -- Format: hostname or UUID
  locked_by TEXT NULL,

  -- When the lock was acquired
  locked_at TIMESTAMPTZ NULL,

  -- When successfully published to Kafka
  published_at TIMESTAMPTZ NULL,

  -- When the outbox row was created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Last error message (for debugging failed publishes)
  last_error TEXT NULL,

  -- Constraints
  CONSTRAINT chk_status CHECK (status IN ('pending', 'publishing', 'published', 'failed', 'deadletter')),
  CONSTRAINT chk_attempts_positive CHECK (attempts >= 0)
);

-- Unique index on event_id to prevent duplicate events
-- This is critical for idempotency: if we try to insert the same event twice,
-- it will fail with a unique violation, which we can safely ignore.
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_event_id ON ingestion_outbox(event_id);

-- Index for efficient pending event queries (used by OutboxPublisher)
-- Partial index only on pending rows for better performance
CREATE INDEX IF NOT EXISTS idx_outbox_pending 
  ON ingestion_outbox(status, next_retry_at, created_at)
  WHERE status = 'pending';

-- Index for publisher claiming (SKIP LOCKED queries)
-- Note: Cannot include next_retry_at <= NOW() here as NOW() is not IMMUTABLE
-- The query will filter by next_retry_at at runtime
CREATE INDEX IF NOT EXISTS idx_outbox_claiming
  ON ingestion_outbox(status, next_retry_at, id)
  WHERE status = 'pending';

-- Index for monitoring/debugging published events
CREATE INDEX IF NOT EXISTS idx_outbox_published_at
  ON ingestion_outbox(published_at)
  WHERE status = 'published';

-- Index for finding locked/stuck events
CREATE INDEX IF NOT EXISTS idx_outbox_locked
  ON ingestion_outbox(locked_by, locked_at)
  WHERE status = 'publishing';

-- ============================================================================
-- 2. UPDATE NPM PACKAGE STATE TABLE
-- ============================================================================
-- Add columns for tracking NPM sequence and deletion status

-- Add last_seq column (opaque npm sequence for this package)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'npm_package_state' AND column_name = 'last_seq'
  ) THEN
    ALTER TABLE npm_package_state ADD COLUMN last_seq TEXT NULL;
  END IF;
END $$;

-- Add deleted_at column for soft deletes
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'npm_package_state' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE npm_package_state ADD COLUMN deleted_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- Index for querying deleted packages
CREATE INDEX IF NOT EXISTS idx_npm_state_deleted 
  ON npm_package_state(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- 3. HELPER VIEWS FOR MONITORING
-- ============================================================================

-- View: Outbox statistics
CREATE OR REPLACE VIEW outbox_stats AS
SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest_created_at,
  MAX(created_at) as newest_created_at,
  AVG(attempts) as avg_attempts,
  MAX(attempts) as max_attempts
FROM ingestion_outbox
GROUP BY status;

-- View: Pending events backlog
CREATE OR REPLACE VIEW outbox_backlog AS
SELECT
  event_type,
  COUNT(*) as pending_count,
  MIN(created_at) as oldest_pending,
  MAX(next_retry_at) as next_retry
FROM ingestion_outbox
WHERE status = 'pending'
GROUP BY event_type
ORDER BY pending_count DESC;

-- View: Failed/stuck events
CREATE OR REPLACE VIEW outbox_failures AS
SELECT
  id,
  event_id,
  event_type,
  partition_key,
  attempts,
  last_error,
  created_at,
  next_retry_at
FROM ingestion_outbox
WHERE status IN ('failed', 'deadletter')
  OR (status = 'publishing' AND locked_at < NOW() - INTERVAL '5 minutes')
ORDER BY created_at DESC
LIMIT 100;

-- ============================================================================
-- 4. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE ingestion_outbox IS 
  'Transactional Outbox pattern: ensures atomic state updates + event publishing. '
  'Events are claimed with SKIP LOCKED for horizontal scaling.';

COMMENT ON COLUMN ingestion_outbox.event_id IS 
  'Deterministic SHA256 hash for idempotency. Same real-world event = same ID.';

COMMENT ON COLUMN ingestion_outbox.status IS 
  'pending: awaiting publish | publishing: claimed by worker | published: done | failed: retrying | deadletter: gave up';

COMMENT ON COLUMN ingestion_outbox.next_retry_at IS 
  'Exponential backoff: attempts 1=1m, 2=2m, 3=5m, 4=10m, 5=30m, 6+=1h';

COMMENT ON INDEX idx_outbox_pending IS 
  'Critical index for OutboxPublisher.claim_batch() with SKIP LOCKED';

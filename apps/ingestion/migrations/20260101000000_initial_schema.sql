-- Ingestion Checkpoints Table (Critical for Idempotency)
CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
    registry TEXT PRIMARY KEY, -- 'npm', 'pypi', 'crates'
    cursor TEXT NOT NULL,      -- seq (npm), timestamp (pypi), or other marker
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB                 -- Additional metadata (etags, stats)
);

-- Poison Events / Dead Letter Queue storage (For failed parsers/fetches)
CREATE TABLE IF NOT EXISTS ingestion_poison_events (
    event_id UUID PRIMARY KEY,
    registry TEXT NOT NULL,
    reason TEXT NOT NULL,
    payload JSONB NOT NULL,    -- raw content that failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for auditing poison events
CREATE INDEX idx_poison_registry ON ingestion_poison_events(registry);
CREATE INDEX idx_poison_created ON ingestion_poison_events(created_at);

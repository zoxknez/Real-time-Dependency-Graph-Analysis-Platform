-- Cargo/Crates.io package state table for tracking ingestion progress
-- Uses sparse index ETag for efficient polling

CREATE TABLE IF NOT EXISTS cargo_package_state (
    crate_name          TEXT PRIMARY KEY,
    last_version        TEXT,
    index_etag          TEXT,              -- ETag from sparse index HTTP response
    index_last_modified TEXT,              -- Last-Modified header value
    versions_json       JSONB,             -- All known versions with yank status
    versions_hash       TEXT,              -- Hash for quick change detection
    last_polled_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cargo_state_updated_at ON cargo_package_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_cargo_state_etag ON cargo_package_state(index_etag);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_cargo_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cargo_state_updated_at
    BEFORE UPDATE ON cargo_package_state
    FOR EACH ROW
    EXECUTE FUNCTION update_cargo_state_timestamp();

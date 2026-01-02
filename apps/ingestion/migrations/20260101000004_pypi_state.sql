-- PyPI package state table for tracking ingestion progress
-- Used to detect new versions and avoid duplicate processing

CREATE TABLE IF NOT EXISTS pypi_package_state (
    package_name        TEXT PRIMARY KEY,
    last_version        TEXT,
    last_event_id       TEXT,              -- guid/link from RSS or serial from changelog
    last_serial         BIGINT,            -- PyPI changelog serial number
    versions_json       JSONB,             -- All known versions with yank status
    versions_hash       TEXT,              -- Hash for quick change detection
    last_published_at   TIMESTAMPTZ,
    last_polled_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pypi_state_updated_at ON pypi_package_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_pypi_state_last_serial ON pypi_package_state(last_serial);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_pypi_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pypi_state_updated_at
    BEFORE UPDATE ON pypi_package_state
    FOR EACH ROW
    EXECUTE FUNCTION update_pypi_state_timestamp();

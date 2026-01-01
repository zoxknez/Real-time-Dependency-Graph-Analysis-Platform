-- NPM Package State for Stateful Diffing (Unpublish Detection)
CREATE TABLE IF NOT EXISTS npm_package_state (
    package_name TEXT PRIMARY KEY,
    -- We store a hash of the sorted versions list to quickly detect if something changed
    -- Alternatively, we can store the full JSON array of versions "[\"1.0.0\", \"1.0.1\"]"
    -- For enterprise accuracy, full JSON set is safer as it allows exact diff calculation without fetching old packument again (if we trust our DB).
    -- Given the constraint on size, we'll store the JSON array of versions.
    versions_json JSONB NOT NULL DEFAULT '[]', 
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_etag TEXT -- To optimize fetching if registry supports ETag
);

-- Index for Staleness checks (if we implement a "re-scan old packages" job)
CREATE INDEX idx_npm_state_updated ON npm_package_state(last_updated_at);

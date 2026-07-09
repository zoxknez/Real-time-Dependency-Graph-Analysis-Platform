-- RisingWave Streaming SQL Setup
-- Create sources, materialized views, and sinks
-- Usage: psql -h localhost -p 4566 -d dev < scripts/db/004-risingwave-setup.sql

-- ============================================
-- KAFKA SOURCES
-- ============================================

-- Source for package events from ingestion
CREATE SOURCE IF NOT EXISTS package_events (
    event_id VARCHAR,
    event_type VARCHAR,
    package_id VARCHAR,
    package_name VARCHAR,
    ecosystem VARCHAR,
    version VARCHAR,
    published_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ
) WITH (
    connector = 'kafka',
    topic = 'package.events',
    properties.bootstrap.server = 'redpanda:9092',
    scan.startup.mode = 'earliest'
) FORMAT PLAIN ENCODE JSON;

-- Source for analysis results
CREATE SOURCE IF NOT EXISTS analysis_results (
    analysis_id VARCHAR,
    package_id VARCHAR,
    version VARCHAR,
    symbols JSONB,
    breaking_changes JSONB,
    embedding FLOAT[],
    analyzed_at TIMESTAMPTZ
) WITH (
    connector = 'kafka',
    topic = 'analysis.results',
    properties.bootstrap.server = 'redpanda:9092',
    scan.startup.mode = 'earliest'
) FORMAT PLAIN ENCODE JSON;

-- ============================================
-- MATERIALIZED VIEWS
-- ============================================

-- Real-time package statistics by ecosystem
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ecosystem_stats AS
SELECT
    ecosystem,
    COUNT(DISTINCT package_id) AS package_count,
    COUNT(*) AS version_count,
    MAX(published_at) AS latest_update
FROM package_events
WHERE event_type = 'new_version'
GROUP BY ecosystem;

-- Hourly package activity
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_activity AS
SELECT
    date_trunc('hour', published_at) AS hour,
    ecosystem,
    COUNT(*) AS event_count,
    COUNT(DISTINCT package_id) AS unique_packages
FROM package_events
WHERE published_at > NOW() - INTERVAL '7 days'
GROUP BY date_trunc('hour', published_at), ecosystem;

-- Breaking changes summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_breaking_changes AS
SELECT
    package_id,
    version,
    jsonb_array_length(breaking_changes) AS breaking_change_count,
    breaking_changes,
    analyzed_at
FROM analysis_results
WHERE jsonb_array_length(breaking_changes) > 0
ORDER BY analyzed_at DESC;

-- Popular packages (by event count)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_popular_packages AS
SELECT
    package_id,
    package_name,
    ecosystem,
    COUNT(*) AS event_count,
    MAX(published_at) AS latest_activity
FROM package_events
WHERE published_at > NOW() - INTERVAL '30 days'
GROUP BY package_id, package_name, ecosystem
ORDER BY event_count DESC
LIMIT 1000;

-- ============================================
-- SINKS (for downstream processing)
-- ============================================

-- Sink breaking changes to dedicated topic
CREATE SINK IF NOT EXISTS sink_breaking_changes AS
SELECT * FROM mv_breaking_changes
WITH (
    connector = 'kafka',
    topic = 'breaking.changes.aggregated',
    properties.bootstrap.server = 'redpanda:9092',
    primary_key = 'package_id,version'
) FORMAT PLAIN ENCODE JSON;

-- ============================================
-- USEFUL QUERIES
-- ============================================

-- Get current ecosystem stats
-- SELECT * FROM mv_ecosystem_stats ORDER BY package_count DESC;

-- Get recent breaking changes
-- SELECT * FROM mv_breaking_changes WHERE analyzed_at > NOW() - INTERVAL '24 hours';

-- Get hourly activity for dashboard
-- SELECT * FROM mv_hourly_activity WHERE hour > NOW() - INTERVAL '24 hours' ORDER BY hour;

-- Get trending packages
-- SELECT * FROM mv_popular_packages LIMIT 50;

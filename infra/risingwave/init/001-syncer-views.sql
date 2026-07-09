-- Compatibility views expected by the syncer service.
-- The current live pipeline writes package and analysis events directly to
-- Memgraph/Qdrant writers. These empty views keep the optional RisingWave
-- sync bridge healthy until a real streaming SQL model is attached.

CREATE VIEW IF NOT EXISTS mv_packages_latest AS
SELECT
    ''::VARCHAR AS id,
    ''::VARCHAR AS name,
    ''::VARCHAR AS ecosystem,
    ''::VARCHAR AS version,
    NULL::VARCHAR AS description,
    NULL::VARCHAR AS repository_url,
    NULL::VARCHAR AS homepage_url,
    NULL::VARCHAR AS license,
    NOW()::TIMESTAMPTZ AS updated_at
WHERE false;

CREATE VIEW IF NOT EXISTS mv_dependencies_latest AS
SELECT
    ''::VARCHAR AS from_package_id,
    ''::VARCHAR AS to_package_id,
    ''::VARCHAR AS version_constraint,
    ''::VARCHAR AS dependency_type,
    NOW()::TIMESTAMPTZ AS updated_at
WHERE false;

CREATE VIEW IF NOT EXISTS mv_embeddings_latest AS
SELECT
    ''::VARCHAR AS package_id,
    ''::BYTEA AS embedding,
    ''::VARCHAR AS model,
    NOW()::TIMESTAMPTZ AS updated_at
WHERE false;

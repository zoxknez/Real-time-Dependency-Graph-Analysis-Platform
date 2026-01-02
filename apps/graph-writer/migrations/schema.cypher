// =============================================================================
// Memgraph Schema for IDP Graph Writer
// =============================================================================
// Run this BEFORE starting the graph-writer service.
// These constraints enable MERGE to work correctly with stable IDs.
// =============================================================================

// -----------------------------------------------------------------------------
// UNIQUE CONSTRAINTS
// Enables MERGE to find existing nodes by id
// -----------------------------------------------------------------------------

// Package: id format = "{ecosystem}:{name}"
CREATE CONSTRAINT ON (p:Package) ASSERT p.id IS UNIQUE;

// Version: id format = "{ecosystem}:{name}:{version}"
CREATE CONSTRAINT ON (v:Version) ASSERT v.id IS UNIQUE;

// -----------------------------------------------------------------------------
// INDEXES for query performance
// -----------------------------------------------------------------------------

// Package queries by ecosystem/name
CREATE INDEX ON :Package(ecosystem);
CREATE INDEX ON :Package(name);

// Version queries
CREATE INDEX ON :Version(package_id);
CREATE INDEX ON :Version(version);
CREATE INDEX ON :Version(yanked);

// Temporal queries
CREATE INDEX ON :Version(published_at);
CREATE INDEX ON :Package(updated_at);

// Soft-delete queries
CREATE INDEX ON :Package(deleted_at);

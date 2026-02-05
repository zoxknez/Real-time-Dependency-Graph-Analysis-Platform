-- Memgraph Database Schema and Indices
-- Run this script to initialize the database schema
-- Usage: mgconsole < scripts/db/001-init-schema.cypher

-- ============================================
-- CONSTRAINTS (Unique identifiers)
-- ============================================

-- Package constraints
CREATE CONSTRAINT ON (p:Package) ASSERT p.id IS UNIQUE;

-- Version constraints  
CREATE CONSTRAINT ON (v:Version) ASSERT v.id IS UNIQUE;

-- Maintainer constraints
CREATE CONSTRAINT ON (m:Maintainer) ASSERT m.id IS UNIQUE;

-- Repository constraints
CREATE CONSTRAINT ON (r:Repository) ASSERT r.url IS UNIQUE;

-- ============================================
-- INDICES for query performance
-- ============================================

-- Package indices
CREATE INDEX ON :Package(name);
CREATE INDEX ON :Package(ecosystem);
CREATE INDEX ON :Package(createdAt);
CREATE INDEX ON :Package(updatedAt);

-- Version indices
CREATE INDEX ON :Version(version);
CREATE INDEX ON :Version(publishedAt);
CREATE INDEX ON :Version(packageId);
CREATE INDEX ON :Version(hasBreakingChanges);

-- Maintainer indices
CREATE INDEX ON :Maintainer(login);
CREATE INDEX ON :Maintainer(email);

-- ============================================
-- COMPOSITE INDICES (for common query patterns)
-- ============================================

-- Search by ecosystem and name
CREATE INDEX ON :Package(ecosystem, name);

-- Find versions by package with date ordering
CREATE INDEX ON :Version(packageId, publishedAt);

-- ============================================
-- VERIFY INDICES
-- ============================================

-- List all indices
SHOW INDEX INFO;

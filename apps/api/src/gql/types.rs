//! GraphQL types matching the enterprise schema

use async_graphql::{Enum, InputObject, SimpleObject, ID};
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum Ecosystem {
    Npm,
    PyPi,
    Cargo,
    Maven,
    NuGet,
    Go,
}

impl From<&str> for Ecosystem {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "npm" => Ecosystem::Npm,
            "pypi" => Ecosystem::PyPi,
            "cargo" | "crates" => Ecosystem::Cargo,
            "maven" => Ecosystem::Maven,
            "nuget" => Ecosystem::NuGet,
            "go" | "golang" => Ecosystem::Go,
            _ => Ecosystem::Npm, // Default
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════

/// Package node from the dependency graph
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct Package {
    pub id: ID,
    pub ecosystem: Ecosystem,
    pub name: String,
    #[graphql(skip)]
    pub created_at: Option<i64>,
    #[graphql(skip)]
    pub updated_at: Option<i64>,
}

/// Version node with metadata
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct Version {
    pub id: ID,
    pub package_id: ID,
    pub version: String,
    pub published_at: Option<String>,
    pub yanked: bool,
}

/// Dependency edge with version requirement
#[derive(SimpleObject, Clone, Debug)]
pub struct Dependency {
    pub package: Package,
    pub version_req: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// QUERY RESULT TYPES
// ═══════════════════════════════════════════════════════════════

/// Result for reverseDependents query
#[derive(SimpleObject, Clone, Debug)]
pub struct ReverseDependentNode {
    pub package: Package,
    pub depth: i32,
}

/// Connection type for pagination (Relay-style)
#[derive(SimpleObject, Clone, Debug)]
pub struct PackageConnection {
    pub edges: Vec<PackageEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct PackageEdge {
    pub node: Package,
    pub cursor: String,
    pub depth: Option<i32>,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct PageInfo {
    pub has_next_page: bool,
    pub has_previous_page: bool,
    pub start_cursor: Option<String>,
    pub end_cursor: Option<String>,
}

/// Result for dependencyPath query
#[derive(SimpleObject, Clone, Debug)]
pub struct DependencyPathResult {
    /// Whether a path was found
    pub found: bool,
    /// Number of hops in the path
    pub hops: i32,
    /// Ordered list of packages in the path (from -> to)
    pub packages: Vec<Package>,
}

/// Result for impactRadius query (CVE simulation)
#[derive(SimpleObject, Clone, Debug)]
pub struct ImpactRadiusResult {
    /// The vulnerable package
    pub package_id: ID,
    /// The semver range that is vulnerable (for reference)
    pub vulnerable_version_range: Option<String>,
    /// Max traversal depth used
    pub max_depth: i32,
    /// Total number of impacted packages
    pub impacted_packages: i32,
    /// Total number of impacted versions (approximate)
    pub impacted_versions: i32,
    /// Top impacted packages by proximity
    pub top_impacted: Vec<ImpactNode>,
}

/// A package impacted by a vulnerability
#[derive(SimpleObject, Clone, Debug)]
pub struct ImpactNode {
    pub package: Package,
    /// Number of hops from the vulnerable package
    pub depth: i32,
    /// Estimated affected versions in this package
    pub estimated_affected_versions: Option<i32>,
}

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION TYPES
// ═══════════════════════════════════════════════════════════════

/// Real-time event for new versions
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct VersionEvent {
    pub meta: EventMeta,
    pub package: Package,
    pub version: Version,
}

/// Event metadata
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct EventMeta {
    pub event_id: ID,
    pub occurred_at: String,
    pub source: String,
    pub traceparent: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(InputObject, Clone, Debug)]
pub struct PackageFilter {
    pub ecosystem: Option<Ecosystem>,
    pub name_contains: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// STATS TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(SimpleObject, Clone, Debug)]
pub struct GraphStats {
    pub total_packages: i64,
    pub total_versions: i64,
    pub total_dependencies: i64,
    pub total_package_dependencies: i64,
}

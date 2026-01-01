//! Package domain models

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Package metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Package {
    pub id: String,
    pub name: String,
    pub ecosystem: String,
    pub description: Option<String>,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub license: Option<String>,
    pub keywords: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub stats: PackageStats,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PackageStats {
    pub weekly_downloads: i64,
    pub total_downloads: i64,
    pub dependent_count: i32,
    pub version_count: i32,
    pub health_score: f32,
}

/// Package version
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageVersion {
    pub package_id: String,
    pub version: String,
    pub published_at: DateTime<Utc>,
    pub tarball_url: Option<String>,
    pub sha256_checksum: Option<String>,
    pub dependencies: Vec<Dependency>,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub package_id: String,
    pub version_constraint: String,
    pub dep_type: DependencyType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DependencyType {
    Runtime,
    Dev,
    Peer,
    Optional,
}

/// Event: Package published
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackagePublished {
    pub event_id: String,
    pub event_ts: i64,
    pub version: PackageVersion,
}

/// Event: Breaking change detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakingChangeDetected {
    pub event_id: String,
    pub event_ts: i64,
    pub package_id: String,
    pub from_version: String,
    pub to_version: String,
    pub confidence_score: f32,
    pub change_type: ChangeType,
    pub change_description: String,
    pub description_embedding: Vec<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChangeType {
    ApiRemoval,
    SignatureChange,
    TypeChange,
    BehaviorChange,
    Deprecation,
    MajorVersion,
}

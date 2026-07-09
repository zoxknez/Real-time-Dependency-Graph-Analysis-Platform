//! Test fixtures for common test data

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Sample package for testing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestPackage {
    pub id: String,
    pub name: String,
    pub ecosystem: String,
    pub version: String,
    pub description: Option<String>,
    pub dependencies: Vec<TestDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestDependency {
    pub name: String,
    pub version_constraint: String,
    pub dep_type: String,
}

impl TestPackage {
    /// Create a sample NPM package
    pub fn npm_lodash() -> Self {
        Self {
            id: "npm/lodash/4.17.21".to_string(),
            name: "lodash".to_string(),
            ecosystem: "npm".to_string(),
            version: "4.17.21".to_string(),
            description: Some("Lodash modular utilities".to_string()),
            dependencies: vec![],
        }
    }

    /// Create a sample NPM package with dependencies
    pub fn npm_express() -> Self {
        Self {
            id: "npm/express/4.18.2".to_string(),
            name: "express".to_string(),
            ecosystem: "npm".to_string(),
            version: "4.18.2".to_string(),
            description: Some("Fast, unopinionated, minimalist web framework".to_string()),
            dependencies: vec![
                TestDependency {
                    name: "body-parser".to_string(),
                    version_constraint: "^1.20.0".to_string(),
                    dep_type: "runtime".to_string(),
                },
                TestDependency {
                    name: "cookie".to_string(),
                    version_constraint: "~0.6.0".to_string(),
                    dep_type: "runtime".to_string(),
                },
            ],
        }
    }

    /// Create a sample Cargo package
    pub fn cargo_serde() -> Self {
        Self {
            id: "cargo/serde/1.0.197".to_string(),
            name: "serde".to_string(),
            ecosystem: "cargo".to_string(),
            version: "1.0.197".to_string(),
            description: Some("A generic serialization/deserialization framework".to_string()),
            dependencies: vec![TestDependency {
                name: "serde_derive".to_string(),
                version_constraint: "1.0".to_string(),
                dep_type: "optional".to_string(),
            }],
        }
    }

    /// Create a sample PyPI package
    pub fn pypi_requests() -> Self {
        Self {
            id: "pypi/requests/2.31.0".to_string(),
            name: "requests".to_string(),
            ecosystem: "pypi".to_string(),
            version: "2.31.0".to_string(),
            description: Some("Python HTTP for Humans".to_string()),
            dependencies: vec![
                TestDependency {
                    name: "urllib3".to_string(),
                    version_constraint: ">=1.21.1,<3".to_string(),
                    dep_type: "runtime".to_string(),
                },
                TestDependency {
                    name: "certifi".to_string(),
                    version_constraint: ">=2017.4.17".to_string(),
                    dep_type: "runtime".to_string(),
                },
            ],
        }
    }

    /// Generate a random test package
    pub fn random(ecosystem: &str) -> Self {
        let id = Uuid::new_v4().to_string();
        let name = format!("test-package-{}", &id[..8]);

        Self {
            id: format!("{}/{}/1.0.0", ecosystem, name),
            name,
            ecosystem: ecosystem.to_string(),
            version: "1.0.0".to_string(),
            description: Some("Auto-generated test package".to_string()),
            dependencies: vec![],
        }
    }
}

/// Sample Kafka event for testing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestKafkaEvent {
    pub event_type: String,
    pub ecosystem: String,
    pub package_name: String,
    pub version: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub payload: serde_json::Value,
}

impl TestKafkaEvent {
    /// Create a package published event
    pub fn package_published(pkg: &TestPackage) -> Self {
        Self {
            event_type: "package.published".to_string(),
            ecosystem: pkg.ecosystem.clone(),
            package_name: pkg.name.clone(),
            version: Some(pkg.version.clone()),
            timestamp: Utc::now(),
            payload: serde_json::json!({
                "id": pkg.id,
                "name": pkg.name,
                "version": pkg.version,
                "description": pkg.description,
                "dependencies": pkg.dependencies,
            }),
        }
    }

    /// Create a package yanked event
    pub fn package_yanked(ecosystem: &str, name: &str, version: &str) -> Self {
        Self {
            event_type: "package.yanked".to_string(),
            ecosystem: ecosystem.to_string(),
            package_name: name.to_string(),
            version: Some(version.to_string()),
            timestamp: Utc::now(),
            payload: serde_json::json!({
                "reason": "security vulnerability",
            }),
        }
    }
}

/// Sample GraphQL queries for testing
pub struct GraphQLQueries;

impl GraphQLQueries {
    pub fn package_by_id() -> &'static str {
        r#"
        query PackageById($id: ID!) {
            package(id: $id) {
                id
                name
                ecosystem
                latestVersion
                description
            }
        }
        "#
    }

    pub fn reverse_dependents() -> &'static str {
        r#"
        query ReverseDependents($packageId: ID!, $depth: Int) {
            reverseDependents(packageId: $packageId, depth: $depth) {
                id
                name
                ecosystem
                dependencyPath {
                    from
                    to
                    version
                }
            }
        }
        "#
    }

    pub fn search_packages() -> &'static str {
        r#"
        query SearchPackages($query: String!, $ecosystem: String, $limit: Int) {
            searchPackages(query: $query, ecosystem: $ecosystem, limit: $limit) {
                id
                name
                ecosystem
                description
                score
            }
        }
        "#
    }

    pub fn impact_radius() -> &'static str {
        r#"
        query ImpactRadius($packageId: ID!, $maxDepth: Int) {
            impactRadius(packageId: $packageId, maxDepth: $maxDepth) {
                directDependents
                transitiveDependents
                totalAffected
                byDepth {
                    depth
                    count
                }
            }
        }
        "#
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_npm_lodash_fixture() {
        let pkg = TestPackage::npm_lodash();
        assert_eq!(pkg.name, "lodash");
        assert_eq!(pkg.ecosystem, "npm");
    }

    #[test]
    fn test_random_package() {
        let pkg = TestPackage::random("npm");
        assert!(pkg.name.starts_with("test-package-"));
        assert_eq!(pkg.ecosystem, "npm");
    }

    #[test]
    fn test_kafka_event_creation() {
        let pkg = TestPackage::npm_express();
        let event = TestKafkaEvent::package_published(&pkg);
        assert_eq!(event.event_type, "package.published");
        assert_eq!(event.package_name, "express");
    }
}

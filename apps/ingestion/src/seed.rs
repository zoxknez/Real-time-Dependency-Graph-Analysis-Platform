//! Seed Mode - Fetch real packages for testing without live polling
//!
//! Supports seeding from:
//! - PyPI JSON API: https://pypi.org/pypi/{package}/json
//! - Cargo Sparse Index: https://index.crates.io/{prefix}/{name}

use anyhow::{Context, Result};
use chrono::Utc;
use prost::Message as ProstMessage;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{info, warn, error};
use uuid::Uuid;

use crate::proto_gen::domain::package::v1::{VersionUpserted, Dependency};
use crate::proto_gen::shared::event::v1::EventMeta;
use crate::store::outbox::{OutboxRepo, OutboxEvent};

/// Seed configuration
#[derive(Debug, Clone)]
pub struct SeedConfig {
    pub pypi_packages: Vec<String>,
    pub cargo_crates: Vec<String>,
}

impl Default for SeedConfig {
    fn default() -> Self {
        Self {
            pypi_packages: vec!["requests".into(), "flask".into()],
            cargo_crates: vec!["tokio".into(), "serde".into()],
        }
    }
}

/// Seed runner - fetches real data and populates state + outbox
pub struct SeedRunner {
    pool: PgPool,
    client: Client,
    outbox: OutboxRepo,
}

impl SeedRunner {
    pub fn new(pool: PgPool) -> Result<Self> {
        let client = Client::builder()
            .user_agent("InverseDeps-Seed/1.0 (github.com/example)")
            .timeout(Duration::from_secs(30))
            .build()?;

        Ok(Self {
            outbox: OutboxRepo::new(pool.clone()),
            pool,
            client,
        })
    }

    /// Run seed for all configured packages
    pub async fn run(&self, config: &SeedConfig) -> Result<()> {
        info!("Starting seed mode...");

        // Seed PyPI packages
        for package in &config.pypi_packages {
            match self.seed_pypi_package(package).await {
                Ok(_) => info!(package = %package, "PyPI package seeded"),
                Err(e) => error!(package = %package, error = %e, "Failed to seed PyPI package"),
            }
        }

        // Seed Cargo crates
        for crate_name in &config.cargo_crates {
            match self.seed_cargo_crate(crate_name).await {
                Ok(_) => info!(crate_name = %crate_name, "Cargo crate seeded"),
                Err(e) => error!(crate_name = %crate_name, error = %e, "Failed to seed Cargo crate"),
            }
        }

        info!("Seed mode complete!");
        Ok(())
    }

    /// Seed a single PyPI package
    async fn seed_pypi_package(&self, package_name: &str) -> Result<()> {
        info!(package = %package_name, "Fetching PyPI package...");

        // Fetch from PyPI JSON API
        let url = format!("https://pypi.org/pypi/{}/json", package_name);
        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            anyhow::bail!("PyPI returned status {}", response.status());
        }

        let data: PypiPackageJson = response.json().await?;

        // Extract versions
        let versions: Vec<PypiVersionInfo> = data.releases
            .iter()
            .filter_map(|(version, files)| {
                if files.is_empty() {
                    return None;
                }
                let yanked = files.iter().any(|f| f.yanked.unwrap_or(false));
                Some(PypiVersionInfo {
                    version: version.clone(),
                    yanked,
                })
            })
            .collect();

        let versions_json = serde_json::to_value(&versions)?;
        let versions_hash = calculate_hash(&versions);

        // Start transaction
        let mut tx = self.pool.begin().await?;

        // Upsert state
        sqlx::query(r#"
            INSERT INTO pypi_package_state 
                (package_name, last_version, versions_json, versions_hash, last_polled_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (package_name) DO UPDATE SET
                last_version = EXCLUDED.last_version,
                versions_json = EXCLUDED.versions_json,
                versions_hash = EXCLUDED.versions_hash,
                last_polled_at = NOW(),
                updated_at = NOW()
        "#)
        .bind(package_name)
        .bind(&data.info.version)
        .bind(&versions_json)
        .bind(&versions_hash)
        .execute(&mut *tx)
        .await?;

        // Emit package upsert event
        let package_id = format!("pypi:{}", package_name);
        let package_event = OutboxEvent {
            event_id: Uuid::new_v4().to_string(),
            event_type: "domain.package.upsert.v1".to_string(),
            topic: "domain.package.upsert.v1".to_string(),
            partition_key: package_id.clone(),
            payload: serde_json::to_vec(&serde_json::json!({
                "package_id": package_id,
                "ecosystem": "pypi",
                "name": package_name,
                "description": data.info.summary,
                "repository_url": data.info.home_page,
                "license": data.info.license,
            }))?,
            headers: serde_json::json!({}),
        };
        self.outbox.insert(&mut *tx, &package_event).await?;

        // Emit version upsert events for each version using Protobuf
        let deps = data.info.requires_dist.unwrap_or_default();
        let parsed_deps: Vec<Dependency> = deps.iter()
            .filter_map(|d| parse_pypi_dep_proto(d))
            .collect();

        for v in &versions {
            if v.yanked {
                continue; // Skip yanked versions for seed
            }

            let event_id = Uuid::new_v4().to_string();
            let version_id = format!("{}@{}", package_id, v.version);
            
            // Create protobuf VersionUpserted event
            let event_meta = EventMeta {
                event_id: event_id.clone(),
                source: "pypi-seed".to_string(),
                traceparent: String::new(),
                occurred_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                schema_version: "v1".to_string(),
            };

            let proto_event = VersionUpserted {
                meta: Some(event_meta),
                ecosystem: "pypi".to_string(),
                package_name: package_name.to_string(),
                version: v.version.clone(),
                yanked: false,
                tarball_url: String::new(),
                integrity: String::new(),
                size_bytes: 0,
                published_at: None,
                dependencies: parsed_deps.clone(),
                dev_dependencies: vec![],
                optional_dependencies: vec![],
            };

            let version_event = OutboxEvent {
                event_id,
                event_type: "version.upserted".to_string(),  // Match graph-writer expected format
                topic: "domain.version.upsert.v1".to_string(),
                partition_key: version_id.clone(),
                payload: proto_event.encode_to_vec(),  // Protobuf binary
                headers: serde_json::json!({
                    "ecosystem": "pypi",
                    "content_type": "application/x-protobuf"
                }),
            };
            self.outbox.insert(&mut *tx, &version_event).await?;
        }

        tx.commit().await?;

        info!(
            package = %package_name,
            versions = versions.len(),
            deps = parsed_deps.len(),
            "PyPI package seeded"
        );

        Ok(())
    }

    /// Seed a single Cargo crate
    async fn seed_cargo_crate(&self, crate_name: &str) -> Result<()> {
        info!(crate_name = %crate_name, "Fetching Cargo crate...");

        // Calculate index path (Cargo Book layout)
        let path = cargo_index_path(crate_name);
        let url = format!("https://index.crates.io/{}", path);

        let response = self.client
            .get(&url)
            .header("Accept", "text/plain")
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!("Cargo index returned status {}", response.status());
        }

        let etag = response.headers()
            .get("ETag")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        let last_modified = response.headers()
            .get("Last-Modified")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        let body = response.text().await?;

        // Parse JSON lines
        let versions: Vec<CargoVersionInfo> = body
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|line| serde_json::from_str::<CargoIndexEntry>(line).ok())
            .map(|e| CargoVersionInfo {
                version: e.vers,
                yanked: e.yanked,
                deps: e.deps,
            })
            .collect();

        if versions.is_empty() {
            anyhow::bail!("No versions found for crate {}", crate_name);
        }

        let latest = versions.iter()
            .filter(|v| !v.yanked)
            .max_by(|a, b| compare_semver(&a.version, &b.version))
            .map(|v| v.version.clone());

        let versions_json = serde_json::to_value(&versions)?;
        let versions_hash = calculate_cargo_hash(&versions);

        // Start transaction
        let mut tx = self.pool.begin().await?;

        // Upsert state
        sqlx::query(r#"
            INSERT INTO cargo_package_state 
                (crate_name, last_version, index_etag, index_last_modified, versions_json, versions_hash, last_polled_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (crate_name) DO UPDATE SET
                last_version = EXCLUDED.last_version,
                index_etag = EXCLUDED.index_etag,
                index_last_modified = EXCLUDED.index_last_modified,
                versions_json = EXCLUDED.versions_json,
                versions_hash = EXCLUDED.versions_hash,
                last_polled_at = NOW(),
                updated_at = NOW()
        "#)
        .bind(crate_name)
        .bind(&latest)
        .bind(&etag)
        .bind(&last_modified)
        .bind(&versions_json)
        .bind(&versions_hash)
        .execute(&mut *tx)
        .await?;

        // Emit package upsert event
        let package_id = format!("cargo:{}", crate_name);
        let package_event = OutboxEvent {
            event_id: Uuid::new_v4().to_string(),
            event_type: "domain.package.upsert.v1".to_string(),
            topic: "domain.package.upsert.v1".to_string(),
            partition_key: package_id.clone(),
            payload: serde_json::to_vec(&serde_json::json!({
                "package_id": package_id,
                "ecosystem": "cargo",
                "name": crate_name,
                "latest_version": latest,
            }))?,
            headers: serde_json::json!({}),
        };
        self.outbox.insert(&mut *tx, &package_event).await?;

        // Emit version upsert events using Protobuf
        for v in &versions {
            if v.yanked {
                continue;
            }

            let event_id = Uuid::new_v4().to_string();
            let version_id = format!("{}@{}", package_id, v.version);
            
            // Parse deps for this version to protobuf format
            let deps: Vec<Dependency> = v.deps.iter()
                .filter(|d| d.kind.as_deref().unwrap_or("normal") == "normal")
                .map(|d| parse_cargo_dep_proto(&d.name, &d.req))
                .collect();

            let dev_deps: Vec<Dependency> = v.deps.iter()
                .filter(|d| d.kind.as_deref() == Some("dev"))
                .map(|d| parse_cargo_dep_proto(&d.name, &d.req))
                .collect();

            // Create protobuf VersionUpserted event
            let event_meta = EventMeta {
                event_id: event_id.clone(),
                source: "cargo-seed".to_string(),
                traceparent: String::new(),
                occurred_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                schema_version: "v1".to_string(),
            };

            let proto_event = VersionUpserted {
                meta: Some(event_meta),
                ecosystem: "cargo".to_string(),
                package_name: crate_name.to_string(),
                version: v.version.clone(),
                yanked: false,
                tarball_url: String::new(),
                integrity: String::new(),
                size_bytes: 0,
                published_at: None,
                dependencies: deps,
                dev_dependencies: dev_deps,
                optional_dependencies: vec![],
            };

            let version_event = OutboxEvent {
                event_id,
                event_type: "version.upserted".to_string(),  // Match graph-writer expected format
                topic: "domain.version.upsert.v1".to_string(),
                partition_key: version_id.clone(),
                payload: proto_event.encode_to_vec(),  // Protobuf binary
                headers: serde_json::json!({
                    "ecosystem": "cargo",
                    "content_type": "application/x-protobuf"
                }),
            };
            self.outbox.insert(&mut *tx, &version_event).await?;
        }

        tx.commit().await?;

        info!(
            crate_name = %crate_name,
            versions = versions.len(),
            latest = ?latest,
            "Cargo crate seeded"
        );

        Ok(())
    }
}

// --- PyPI Types ---

#[derive(Debug, Deserialize)]
struct PypiPackageJson {
    info: PypiInfoJson,
    releases: HashMap<String, Vec<PypiReleaseFile>>,
}

#[derive(Debug, Deserialize)]
struct PypiInfoJson {
    name: String,
    version: String,
    summary: Option<String>,
    home_page: Option<String>,
    license: Option<String>,
    requires_dist: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct PypiReleaseFile {
    yanked: Option<bool>,
}

#[derive(Debug, Serialize)]
struct PypiVersionInfo {
    version: String,
    yanked: bool,
}

// --- Cargo Types ---

#[derive(Debug, Deserialize)]
struct CargoIndexEntry {
    name: String,
    #[serde(rename = "vers")]
    vers: String,
    #[serde(default)]
    deps: Vec<CargoDep>,
    #[serde(default)]
    yanked: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct CargoDep {
    name: String,
    req: String,
    #[serde(default)]
    optional: Option<bool>,
    kind: Option<String>,
}

#[derive(Debug, Serialize)]
struct CargoVersionInfo {
    version: String,
    yanked: bool,
    #[serde(skip)]
    deps: Vec<CargoDep>,
}

// --- Helpers ---

/// Calculate Cargo index path (Cargo Book layout)
fn cargo_index_path(name: &str) -> String {
    let name_lower = name.to_lowercase();
    match name_lower.len() {
        1 => format!("1/{}", name_lower),
        2 => format!("2/{}", name_lower),
        3 => format!("3/{}/{}", &name_lower[..1], name_lower),
        _ => format!("{}/{}/{}", &name_lower[..2], &name_lower[2..4], name_lower),
    }
}

fn calculate_hash(versions: &[PypiVersionInfo]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    for v in versions {
        v.version.hash(&mut hasher);
        v.yanked.hash(&mut hasher);
    }
    format!("{:x}", hasher.finish())
}

fn calculate_cargo_hash(versions: &[CargoVersionInfo]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    for v in versions {
        v.version.hash(&mut hasher);
        v.yanked.hash(&mut hasher);
    }
    format!("{:x}", hasher.finish())
}

fn compare_semver(a: &str, b: &str) -> std::cmp::Ordering {
    semver::Version::parse(a)
        .ok()
        .cmp(&semver::Version::parse(b).ok())
}

fn parse_pypi_dep(spec: &str) -> Option<serde_json::Value> {
    // Simple PEP 508 parsing
    let spec = spec.trim();
    let (main, _marker) = spec.split_once(';').unwrap_or((spec, ""));
    
    let (name, version_req) = if let Some(idx) = main.find(|c: char| "(<>=!~[".contains(c)) {
        let n = main[..idx].trim();
        let v = main[idx..].trim().trim_matches(|c| c == '(' || c == ')');
        (n.to_string(), Some(v.to_string()))
    } else {
        (main.to_string(), None)
    };

    let clean_name = name.split('[').next()?.trim().to_string();
    if clean_name.is_empty() {
        return None;
    }

    Some(serde_json::json!({
        "package_id": format!("pypi:{}", clean_name),
        "version_req": version_req,
    }))
}

/// Parse PyPI dependency spec to protobuf Dependency
fn parse_pypi_dep_proto(spec: &str) -> Option<Dependency> {
    // Simple PEP 508 parsing
    let spec = spec.trim();
    let (main, _marker) = spec.split_once(';').unwrap_or((spec, ""));
    
    let (name, version_req) = if let Some(idx) = main.find(|c: char| "(<>=!~[".contains(c)) {
        let n = main[..idx].trim();
        let v = main[idx..].trim().trim_matches(|c| c == '(' || c == ')');
        (n.to_string(), v.to_string())
    } else {
        (main.to_string(), "*".to_string())
    };

    let clean_name = name.split('[').next()?.trim().to_string();
    if clean_name.is_empty() {
        return None;
    }

    Some(Dependency {
        name: clean_name,
        version_range: version_req,
        is_peer: false,
    })
}

/// Parse Cargo dependency to protobuf Dependency
fn parse_cargo_dep_proto(name: &str, version_req: &str) -> Dependency {
    Dependency {
        name: name.to_string(),
        version_range: version_req.to_string(),
        is_peer: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cargo_index_path() {
        assert_eq!(cargo_index_path("a"), "1/a");
        assert_eq!(cargo_index_path("ab"), "2/ab");
        assert_eq!(cargo_index_path("abc"), "3/a/abc");
        assert_eq!(cargo_index_path("tokio"), "to/ki/tokio");
        assert_eq!(cargo_index_path("serde"), "se/rd/serde");
    }

    #[test]
    fn test_parse_pypi_dep() {
        let dep = parse_pypi_dep("requests>=2.0.0").unwrap();
        assert_eq!(dep["package_id"], "pypi:requests");
        
        let dep2 = parse_pypi_dep("urllib3").unwrap();
        assert_eq!(dep2["package_id"], "pypi:urllib3");
    }
}

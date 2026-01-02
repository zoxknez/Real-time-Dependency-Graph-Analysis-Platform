//! Crawler module - Fetches package data from registries

use anyhow::Result;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use tracing::{debug, info, warn};

/// Supported package registries
#[derive(Debug, Clone, Copy)]
pub enum Registry {
    Npm,
    PyPi,
    Cargo,
}

impl Registry {
    pub fn base_url(&self) -> &'static str {
        match self {
            Registry::Npm => "https://registry.npmjs.org",
            Registry::PyPi => "https://pypi.org/pypi",
            Registry::Cargo => "https://crates.io/api/v1",
        }
    }
    
    pub fn name(&self) -> &'static str {
        match self {
            Registry::Npm => "npm",
            Registry::PyPi => "pypi",
            Registry::Cargo => "cargo",
        }
    }
}

/// Crawler configuration
pub struct CrawlerConfig {
    pub user_agent: String,
    pub timeout_secs: u64,
    pub max_retries: u32,
    pub proxy_urls: Vec<String>,
}

impl Default for CrawlerConfig {
    fn default() -> Self {
        Self {
            user_agent: "InverseDeps-Crawler/1.0 (contact@inversedeps.io)".into(),
            timeout_secs: 30,
            max_retries: 3,
            proxy_urls: vec![],
        }
    }
}

/// Crawler for a specific registry
pub struct Crawler {
    client: Client,
    registry: Registry,
    config: CrawlerConfig,
}

impl Crawler {
    pub fn new(registry: Registry, config: CrawlerConfig) -> Result<Self> {
        let client = Client::builder()
            .user_agent(&config.user_agent)
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .build()?;
        
        Ok(Self {
            client,
            registry,
            config,
        })
    }
    
    /// Fetch package metadata from registry
    pub async fn fetch_package(&self, name: &str) -> Result<PackageMetadata> {
        match self.registry {
            Registry::Npm => self.fetch_npm_package(name).await,
            Registry::PyPi => self.fetch_pypi_package(name).await,
            Registry::Cargo => self.fetch_cargo_package(name).await,
        }
    }
    
    /// Fetch NPM package metadata
    async fn fetch_npm_package(&self, name: &str) -> Result<PackageMetadata> {
        // Handle scoped packages: @foo/bar -> @foo%2fbar
        let encoded_name = name.replace('/', "%2f");
        let url = format!("{}/{}", self.registry.base_url(), encoded_name);
        
        debug!(package = %name, url = %url, "Fetching NPM package");
        
        let response = self.client.get(&url)
            .header("Accept", "application/vnd.npm.install-v1+json")
            .send()
            .await?;
        
        if !response.status().is_success() {
            anyhow::bail!("NPM registry returned {}", response.status());
        }
        
        let npm_data: NpmPackageResponse = response.json().await?;
        
        // Get latest version
        let latest_version = npm_data.dist_tags
            .as_ref()
            .and_then(|dt| dt.latest.clone())
            .unwrap_or_default();
        
        // Get version metadata
        let version_info = npm_data.versions
            .as_ref()
            .and_then(|v| v.get(&latest_version));
        
        let mut dependencies = Vec::new();
        
        if let Some(vi) = version_info {
            // Parse runtime dependencies
            if let Some(deps) = &vi.dependencies {
                for (dep_name, version_constraint) in deps {
                    dependencies.push(DependencyInfo {
                        name: dep_name.clone(),
                        version_constraint: version_constraint.clone(),
                        dep_type: "runtime".to_string(),
                    });
                }
            }
            
            // Parse dev dependencies
            if let Some(deps) = &vi.dev_dependencies {
                for (dep_name, version_constraint) in deps {
                    dependencies.push(DependencyInfo {
                        name: dep_name.clone(),
                        version_constraint: version_constraint.clone(),
                        dep_type: "dev".to_string(),
                    });
                }
            }
            
            // Parse peer dependencies
            if let Some(deps) = &vi.peer_dependencies {
                for (dep_name, version_constraint) in deps {
                    dependencies.push(DependencyInfo {
                        name: dep_name.clone(),
                        version_constraint: version_constraint.clone(),
                        dep_type: "peer".to_string(),
                    });
                }
            }
        }
        
        // Get tarball URL
        let tarball_url = version_info
            .and_then(|vi| vi.dist.as_ref())
            .map(|d| d.tarball.clone());
        
        Ok(PackageMetadata {
            name: name.to_string(),
            ecosystem: "npm".to_string(),
            version: latest_version,
            description: npm_data.description,
            repository_url: npm_data.repository.and_then(|r| r.url),
            homepage_url: npm_data.homepage,
            license: npm_data.license,
            tarball_url,
            published_at: npm_data.time.and_then(|t| t.modified),
            dependencies,
        })
    }
    
    /// Fetch PyPI package metadata
    async fn fetch_pypi_package(&self, name: &str) -> Result<PackageMetadata> {
        let url = format!("{}/{}/json", self.registry.base_url(), name);
        
        debug!(package = %name, url = %url, "Fetching PyPI package");
        
        let response = self.client.get(&url).send().await?;
        
        if !response.status().is_success() {
            anyhow::bail!("PyPI registry returned {}", response.status());
        }
        
        let pypi_data: PyPiPackageResponse = response.json().await?;
        
        // Parse dependencies from requires_dist
        let mut dependencies = Vec::new();
        if let Some(requires) = pypi_data.info.requires_dist {
            for req in requires {
                // Parse requirement string: "package-name (>=1.0,<2.0); extra == 'test'"
                let parts: Vec<&str> = req.splitn(2, ';').collect();
                let dep_spec = parts[0].trim();
                
                // Check if it's an extra/optional dependency
                let dep_type = if parts.len() > 1 && parts[1].contains("extra") {
                    "optional"
                } else {
                    "runtime"
                };
                
                // Parse name and version constraint
                if let Some((dep_name, version_constraint)) = parse_pypi_requirement(dep_spec) {
                    dependencies.push(DependencyInfo {
                        name: dep_name,
                        version_constraint,
                        dep_type: dep_type.to_string(),
                    });
                }
            }
        }
        
        Ok(PackageMetadata {
            name: name.to_string(),
            ecosystem: "pypi".to_string(),
            version: pypi_data.info.version,
            description: pypi_data.info.summary,
            repository_url: pypi_data.info.project_urls
                .and_then(|urls| urls.get("Repository").or(urls.get("Source")).cloned()),
            homepage_url: pypi_data.info.home_page,
            license: pypi_data.info.license,
            tarball_url: None, // Would need to parse from releases
            published_at: None,
            dependencies,
        })
    }
    
    /// Fetch Cargo/Crates.io package metadata
    async fn fetch_cargo_package(&self, name: &str) -> Result<PackageMetadata> {
        let url = format!("{}/crates/{}", self.registry.base_url(), name);
        
        debug!(package = %name, url = %url, "Fetching Cargo crate");
        
        let response = self.client.get(&url).send().await?;
        
        if !response.status().is_success() {
            anyhow::bail!("Crates.io registry returned {}", response.status());
        }
        
        let cargo_data: CratesIoResponse = response.json().await?;
        
        // Get latest version
        let latest_version = cargo_data.crate_info.newest_version.clone();
        
        // Fetch dependencies from version endpoint
        let deps_url = format!("{}/crates/{}/{}/dependencies", 
            self.registry.base_url(), name, latest_version);
        
        let mut dependencies = Vec::new();
        
        if let Ok(deps_response) = self.client.get(&deps_url).send().await {
            if deps_response.status().is_success() {
                if let Ok(deps_data) = deps_response.json::<CratesIoDepsResponse>().await {
                    for dep in deps_data.dependencies {
                        dependencies.push(DependencyInfo {
                            name: dep.crate_id,
                            version_constraint: dep.req,
                            dep_type: if dep.optional {
                                "optional".to_string()
                            } else if dep.kind == "dev" {
                                "dev".to_string()
                            } else if dep.kind == "build" {
                                "build".to_string()
                            } else {
                                "runtime".to_string()
                            },
                        });
                    }
                }
            }
        }
        
        Ok(PackageMetadata {
            name: name.to_string(),
            ecosystem: "cargo".to_string(),
            version: latest_version,
            description: cargo_data.crate_info.description,
            repository_url: cargo_data.crate_info.repository,
            homepage_url: cargo_data.crate_info.homepage,
            license: None, // Not in crate response, would need version details
            tarball_url: None,
            published_at: cargo_data.crate_info.updated_at,
            dependencies,
        })
    }
    
    /// Poll registry for changes since last check
    pub async fn poll_changes(&self, since: DateTime<Utc>) -> Result<Vec<PackageMetadata>> {
        match self.registry {
            Registry::Npm => self.poll_npm_changes(since).await,
            Registry::PyPi => self.poll_pypi_changes(since).await,
            Registry::Cargo => self.poll_cargo_changes(since).await,
        }
    }
    
    /// Poll NPM for recent updates
    async fn poll_npm_changes(&self, since: DateTime<Utc>) -> Result<Vec<PackageMetadata>> {
        info!(since = %since.to_rfc3339(), "Polling NPM for changes");
        
        // NPM changelog endpoint
        let timestamp = since.timestamp_millis();
        let url = format!("https://replicate.npmjs.com/_changes?since={}&limit=100", timestamp);
        
        let response = self.client.get(&url).send().await?;
        
        if !response.status().is_success() {
            warn!(status = %response.status(), "Failed to poll NPM changes");
            return Ok(vec![]);
        }
        
        // Parse changes and fetch package details
        let changes: NpmChangesResponse = response.json().await?;
        let mut packages = Vec::new();
        
        for change in changes.results.into_iter().take(50) {
            if change.deleted {
                continue;
            }
            
            match self.fetch_npm_package(&change.id).await {
                Ok(pkg) => packages.push(pkg),
                Err(e) => debug!(package = %change.id, error = %e, "Failed to fetch package"),
            }
        }
        
        Ok(packages)
    }
    
    /// Poll PyPI for recent updates  
    async fn poll_pypi_changes(&self, since: DateTime<Utc>) -> Result<Vec<PackageMetadata>> {
        info!(since = %since.to_rfc3339(), "Polling PyPI for changes");
        
        // PyPI RSS feed for updates
        let url = "https://pypi.org/rss/updates.xml";
        
        let response = self.client.get(url).send().await?;
        
        if !response.status().is_success() {
            warn!(status = %response.status(), "Failed to poll PyPI changes");
            return Ok(vec![]);
        }
        
        // Parse RSS and extract package names (simplified - would use XML parser)
        let text = response.text().await?;
        let mut packages = Vec::new();
        
        // Extract package names from RSS (simplified regex-like extraction)
        for line in text.lines() {
            if line.contains("<title>") && !line.contains("PyPI") {
                // Extract package name from title
                if let Some(start) = line.find("<title>") {
                    if let Some(end) = line.find("</title>") {
                        let title = &line[start + 7..end];
                        // Title format: "package-name version"
                        if let Some(name) = title.split_whitespace().next() {
                            if !packages.iter().any(|p: &PackageMetadata| p.name == name) {
                                match self.fetch_pypi_package(name).await {
                                    Ok(pkg) => packages.push(pkg),
                                    Err(e) => debug!(package = %name, error = %e, "Failed to fetch"),
                                }
                            }
                        }
                    }
                }
            }
            
            // Limit to avoid overwhelming
            if packages.len() >= 50 {
                break;
            }
        }
        
        Ok(packages)
    }
    
    /// Poll Crates.io for recent updates
    async fn poll_cargo_changes(&self, since: DateTime<Utc>) -> Result<Vec<PackageMetadata>> {
        info!(since = %since.to_rfc3339(), "Polling Crates.io for changes");
        
        // Crates.io API for recent updates
        let url = format!("{}/crates?per_page=100&sort=recent-updates", self.registry.base_url());
        
        let response = self.client.get(&url).send().await?;
        
        if !response.status().is_success() {
            warn!(status = %response.status(), "Failed to poll Crates.io changes");
            return Ok(vec![]);
        }
        
        let data: CratesIoListResponse = response.json().await?;
        let mut packages = Vec::new();
        
        for crate_item in data.crates {
            // Check if updated after our since timestamp
            if let Some(updated) = crate_item.updated_at {
                if updated > since {
                    match self.fetch_cargo_package(&crate_item.name).await {
                        Ok(pkg) => packages.push(pkg),
                        Err(e) => debug!(package = %crate_item.name, error = %e, "Failed to fetch"),
                    }
                }
            }
            
            if packages.len() >= 50 {
                break;
            }
        }
        
        Ok(packages)
    }
}

/// Parse PyPI requirement string to extract name and version constraint
fn parse_pypi_requirement(req: &str) -> Option<(String, String)> {
    // Handle various formats:
    // "requests>=2.0"
    // "requests (>=2.0,<3.0)"
    // "requests"
    
    let req = req.trim();
    
    // Find version constraint start
    let version_start = req.find(|c: char| c == '>' || c == '<' || c == '=' || c == '!' || c == '~' || c == '(');
    
    match version_start {
        Some(idx) => {
            let name = req[..idx].trim().to_string();
            let mut constraint = req[idx..].trim().to_string();
            
            // Remove parentheses if present
            constraint = constraint.trim_start_matches('(').trim_end_matches(')').to_string();
            
            Some((name, constraint))
        }
        None => Some((req.to_string(), "*".to_string())),
    }
}

// ============================================================================
// Response Types
// ============================================================================

/// NPM Package Response
#[derive(Debug, Deserialize)]
struct NpmPackageResponse {
    name: Option<String>,
    description: Option<String>,
    license: Option<String>,
    homepage: Option<String>,
    repository: Option<NpmRepository>,
    #[serde(rename = "dist-tags")]
    dist_tags: Option<NpmDistTags>,
    versions: Option<std::collections::HashMap<String, NpmVersionInfo>>,
    time: Option<NpmTimeInfo>,
}

#[derive(Debug, Deserialize)]
struct NpmRepository {
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NpmDistTags {
    latest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NpmVersionInfo {
    dependencies: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "devDependencies")]
    dev_dependencies: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "peerDependencies")]
    peer_dependencies: Option<std::collections::HashMap<String, String>>,
    dist: Option<NpmDist>,
}

#[derive(Debug, Deserialize)]
struct NpmDist {
    tarball: String,
}

#[derive(Debug, Deserialize)]
struct NpmTimeInfo {
    modified: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
struct NpmChangesResponse {
    results: Vec<NpmChange>,
}

#[derive(Debug, Deserialize)]
struct NpmChange {
    id: String,
    deleted: bool,
}

/// PyPI Package Response
#[derive(Debug, Deserialize)]
struct PyPiPackageResponse {
    info: PyPiInfo,
}

#[derive(Debug, Deserialize)]
struct PyPiInfo {
    version: String,
    summary: Option<String>,
    home_page: Option<String>,
    license: Option<String>,
    requires_dist: Option<Vec<String>>,
    project_urls: Option<std::collections::HashMap<String, String>>,
}

/// Crates.io Response
#[derive(Debug, Deserialize)]
struct CratesIoResponse {
    #[serde(rename = "crate")]
    crate_info: CratesIoCrate,
}

#[derive(Debug, Deserialize)]
struct CratesIoCrate {
    name: String,
    newest_version: String,
    description: Option<String>,
    repository: Option<String>,
    homepage: Option<String>,
    updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
struct CratesIoListResponse {
    crates: Vec<CratesIoListItem>,
}

#[derive(Debug, Deserialize)]
struct CratesIoListItem {
    name: String,
    updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
struct CratesIoDepsResponse {
    dependencies: Vec<CratesIoDep>,
}

#[derive(Debug, Deserialize)]
struct CratesIoDep {
    crate_id: String,
    req: String,
    kind: String,
    optional: bool,
}

// ============================================================================
// Common Types
// ============================================================================

/// Common package metadata across all registries
#[derive(Debug, Default, Deserialize)]
pub struct PackageMetadata {
    pub name: String,
    pub ecosystem: String,
    pub version: String,
    pub description: Option<String>,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub license: Option<String>,
    pub tarball_url: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub dependencies: Vec<DependencyInfo>,
}

#[derive(Debug, Deserialize)]
pub struct DependencyInfo {
    pub name: String,
    pub version_constraint: String,
    pub dep_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_pypi_requirement() {
        // Simple version constraint
        let (name, version) = parse_pypi_requirement("requests>=2.0").unwrap();
        assert_eq!(name, "requests");
        assert_eq!(version, ">=2.0");
        
        // With parentheses
        let (name, version) = parse_pypi_requirement("requests (>=2.0,<3.0)").unwrap();
        assert_eq!(name, "requests");
        assert_eq!(version, ">=2.0,<3.0");
        
        // No version
        let (name, version) = parse_pypi_requirement("requests").unwrap();
        assert_eq!(name, "requests");
        assert_eq!(version, "*");
    }
    
    #[test]
    fn test_registry_urls() {
        assert_eq!(Registry::Npm.base_url(), "https://registry.npmjs.org");
        assert_eq!(Registry::PyPi.base_url(), "https://pypi.org/pypi");
        assert_eq!(Registry::Cargo.base_url(), "https://crates.io/api/v1");
    }
}

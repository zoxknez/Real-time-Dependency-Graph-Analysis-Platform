//! Crawler module - Fetches package data from registries

use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;
use tracing::{debug, info, warn};

/// Supported package registries
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
        let url = match self.registry {
            Registry::Npm => format!("{}/{}", self.registry.base_url(), name),
            Registry::PyPi => format!("{}/{}/json", self.registry.base_url(), name),
            Registry::Cargo => format!("{}/crates/{}", self.registry.base_url(), name),
        };
        
        debug!(registry = %self.registry.name(), package = %name, "Fetching package");
        
        let response = self.client.get(&url).send().await?;
        
        if !response.status().is_success() {
            warn!(
                registry = %self.registry.name(),
                package = %name,
                status = %response.status(),
                "Failed to fetch package"
            );
            anyhow::bail!("Failed to fetch package: {}", response.status());
        }
        
        // TODO: Parse registry-specific response format
        let metadata = PackageMetadata {
            name: name.to_string(),
            ecosystem: self.registry.name().to_string(),
            ..Default::default()
        };
        
        Ok(metadata)
    }
    
    /// Poll registry for changes since last check
    pub async fn poll_changes(&self, since: chrono::DateTime<chrono::Utc>) -> Result<Vec<PackageMetadata>> {
        info!(
            registry = %self.registry.name(),
            since = %since.to_rfc3339(),
            "Polling for changes"
        );
        
        // TODO: Implement registry-specific change polling
        // npm: /-/all/since?stale=update_after:timestamp
        // PyPI: /rss/updates.xml
        // Cargo: /api/v1/crates?per_page=100&sort=recent-updates
        
        Ok(vec![])
    }
}

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
    pub published_at: Option<chrono::DateTime<chrono::Utc>>,
    pub dependencies: Vec<DependencyInfo>,
}

#[derive(Debug, Deserialize)]
pub struct DependencyInfo {
    pub name: String,
    pub version_constraint: String,
    pub dep_type: String,
}

//! PyPI Fetcher - Fetch package metadata from PyPI JSON API
//!
//! Endpoints:
//! - JSON API: https://pypi.org/pypi/{package}/json (full metadata)
//! - Simple API: https://pypi.org/simple/{package}/ (yank detection, PEP 691)

use crate::http::rate_limit::RateLimiter;
use anyhow::{Result, Context};
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, warn, instrument};

const PYPI_JSON_API: &str = "https://pypi.org/pypi";
const PYPI_SIMPLE_API: &str = "https://pypi.org/simple";

/// PyPI package metadata from JSON API
#[derive(Debug, Clone, Deserialize)]
pub struct PypiPackageMetadata {
    pub info: PypiInfo,
    pub releases: HashMap<String, Vec<PypiRelease>>,
    pub urls: Vec<PypiRelease>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PypiInfo {
    pub name: String,
    pub version: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub author_email: Option<String>,
    pub license: Option<String>,
    pub home_page: Option<String>,
    pub project_url: Option<String>,
    pub requires_dist: Option<Vec<String>>,  // PEP 508 dependency specs
    pub requires_python: Option<String>,
    pub keywords: Option<String>,
    pub classifiers: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PypiRelease {
    pub filename: String,
    pub url: String,
    pub size: u64,
    pub digests: PypiDigests,
    pub requires_python: Option<String>,
    pub yanked: Option<bool>,
    pub yanked_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PypiDigests {
    pub md5: Option<String>,
    pub sha256: Option<String>,
}

/// Simple API response for yank detection (PEP 691)
#[derive(Debug, Clone, Deserialize)]
pub struct SimpleApiResponse {
    pub files: Vec<SimpleApiFile>,
    pub meta: Option<SimpleApiMeta>,
    pub name: String,
    pub versions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SimpleApiFile {
    pub filename: String,
    pub url: String,
    /// Yanked status - can be absent, false, true, or a reason string
    #[serde(default, rename = "data-yanked")]
    pub yanked: serde_json::Value,
}

impl SimpleApiFile {
    /// Check if file is yanked (handles both bool and string values)
    pub fn is_yanked(&self) -> bool {
        match &self.yanked {
            serde_json::Value::Bool(b) => *b,
            serde_json::Value::String(s) => !s.is_empty(),
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SimpleApiMeta {
    #[serde(rename = "api-version")]
    pub api_version: String,
}

pub struct PypiFetcher {
    client: Client,
    rate_limiter: Arc<RateLimiter>,
}

impl PypiFetcher {
    pub fn new(rate_limiter: Arc<RateLimiter>) -> Result<Self> {
        let client = Client::builder()
            .user_agent("InverseDeps-PypiFetcher/1.0")
            .timeout(Duration::from_secs(30))
            .build()?;

        Ok(Self { client, rate_limiter })
    }

    /// Fetch full package metadata from JSON API
    #[instrument(skip(self), fields(package = %name))]
    pub async fn fetch_package(&self, name: &str) -> Result<Option<PypiPackageMetadata>> {
        self.rate_limiter.acquire().await;
        
        let url = format!("{}/{}/json", PYPI_JSON_API, name);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .context("Failed to fetch PyPI package")?;

        match response.status().as_u16() {
            200 => {
                let metadata: PypiPackageMetadata = response.json().await?;
                debug!(package = name, versions = metadata.releases.len(), "Fetched PyPI package");
                Ok(Some(metadata))
            }
            404 => {
                debug!(package = name, "PyPI package not found");
                Ok(None)
            }
            429 => {
                warn!("PyPI rate limit hit, triggering backoff");
                self.rate_limiter.report_429(Duration::from_secs(60)).await;
                Ok(None)
            }
            status => {
                warn!(package = name, status, "Unexpected PyPI response");
                Ok(None)
            }
        }
    }

    /// Fetch Simple API page for yank detection (PEP 691)
    #[instrument(skip(self), fields(package = %name))]
    pub async fn fetch_simple(&self, name: &str) -> Result<Option<SimpleApiResponse>> {
        self.rate_limiter.acquire().await;
        
        // Request JSON format via Accept header (PEP 691)
        let url = format!("{}/{}/", PYPI_SIMPLE_API, name);
        
        let response = self.client
            .get(&url)
            .header("Accept", "application/vnd.pypi.simple.v1+json")
            .send()
            .await
            .context("Failed to fetch PyPI Simple API")?;

        match response.status().as_u16() {
            200 => {
                let simple: SimpleApiResponse = response.json().await?;
                debug!(package = name, files = simple.files.len(), "Fetched Simple API");
                Ok(Some(simple))
            }
            404 => Ok(None),
            429 => {
                self.rate_limiter.report_429(Duration::from_secs(60)).await;
                Ok(None)
            }
            _ => Ok(None)
        }
    }

    /// Extract dependencies from requires_dist (PEP 508 format)
    /// 
    /// Format: "package (>=1.0,<2.0) ; extra == 'dev'"
    pub fn parse_requires_dist(requires: &[String]) -> Vec<ParsedDependency> {
        requires.iter().filter_map(|spec| {
            Self::parse_pep508_spec(spec)
        }).collect()
    }

    /// Parse a single PEP 508 dependency specification
    fn parse_pep508_spec(spec: &str) -> Option<ParsedDependency> {
        // Simple parsing - full PEP 508 is complex
        // Format: name [extras] (version) ; markers
        
        let spec = spec.trim();
        
        // Split on ';' to separate markers
        let (main_part, marker) = match spec.split_once(';') {
            Some((m, marker)) => (m.trim(), Some(marker.trim().to_string())),
            None => (spec, None),
        };

        // Extract name and version constraint
        let (name, version_req) = if let Some(idx) = main_part.find(|c: char| c == '(' || c == '<' || c == '>' || c == '=' || c == '!' || c == '~') {
            let name = main_part[..idx].trim();
            let version = main_part[idx..].trim().trim_matches(|c| c == '(' || c == ')');
            (name.to_string(), Some(version.to_string()))
        } else {
            (main_part.to_string(), None)
        };

        // Clean up name (remove extras like [security])
        let clean_name = name.split('[').next()?.trim().to_string();

        if clean_name.is_empty() {
            return None;
        }

        let is_optional = marker.as_ref().map(|m| m.contains("extra")).unwrap_or(false);

        Some(ParsedDependency {
            name: clean_name,
            version_req,
            marker,
            is_optional,
        })
    }
}

#[derive(Debug, Clone)]
pub struct ParsedDependency {
    pub name: String,
    pub version_req: Option<String>,
    pub marker: Option<String>,
    pub is_optional: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pep508_simple() {
        let dep = PypiFetcher::parse_pep508_spec("requests>=2.0").unwrap();
        assert_eq!(dep.name, "requests");
        assert!(dep.version_req.is_some());
    }

    #[test]
    fn test_parse_pep508_with_extras() {
        let dep = PypiFetcher::parse_pep508_spec("requests[security]>=2.0").unwrap();
        assert_eq!(dep.name, "requests");
    }

    #[test]
    fn test_parse_pep508_with_marker() {
        let dep = PypiFetcher::parse_pep508_spec("win32api ; sys_platform == 'win32'").unwrap();
        assert_eq!(dep.name, "win32api");
        assert!(dep.marker.is_some());
    }
}

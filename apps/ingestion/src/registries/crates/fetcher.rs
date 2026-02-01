//! Cargo Sparse Index Fetcher
//!
//! Fetches crate index files from the crates.io sparse registry.
//! Uses HTTP GET with ETag/Last-Modified for efficient polling.

use anyhow::{anyhow, Context, Result};
use reqwest::{Client, StatusCode};
use std::time::Duration;
use tracing::{debug, instrument, warn};

use super::index::CrateIndexEntry;

/// Sparse index configuration
const SPARSE_INDEX_URL: &str = "https://index.crates.io";

/// Fetcher for the Cargo sparse index
pub struct CargoFetcher {
    client: Client,
}

/// Result of fetching a crate's index file
#[derive(Debug)]
pub struct FetchResult {
    /// Parsed index entries (all versions)
    pub entries: Vec<CrateIndexEntry>,
    
    /// ETag for conditional requests
    pub etag: Option<String>,
    
    /// Last-Modified for conditional requests
    pub last_modified: Option<String>,
}

impl CargoFetcher {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .user_agent("randomapp-ingestion/1.0 (security@randomapp.dev)")
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { client })
    }

    /// Fetch a crate's index file from sparse registry
    /// 
    /// Returns None if crate doesn't exist (404)
    #[instrument(skip(self), fields(crate_name = %crate_name))]
    pub async fn fetch_crate_index(
        &self,
        crate_name: &str,
    ) -> Result<Option<FetchResult>> {
        self.fetch_crate_index_conditional(crate_name, None, None).await
    }

    /// Fetch with conditional headers for efficient polling
    /// 
    /// Returns Ok(None) if:
    /// - Crate doesn't exist (404)
    /// - Not modified (304) when etag/last_modified match
    #[instrument(skip(self, etag, last_modified), fields(crate_name = %crate_name))]
    pub async fn fetch_crate_index_conditional(
        &self,
        crate_name: &str,
        etag: Option<&str>,
        last_modified: Option<&str>,
    ) -> Result<Option<FetchResult>> {
        let path = CrateIndexEntry::index_path(crate_name);
        let url = format!("{}/{}", SPARSE_INDEX_URL, path);

        debug!(url = %url, "Fetching crate index");

        let mut request = self.client.get(&url);

        // Add conditional headers if provided
        if let Some(etag) = etag {
            request = request.header("If-None-Match", etag);
        }
        if let Some(last_mod) = last_modified {
            request = request.header("If-Modified-Since", last_mod);
        }

        // Required for sparse index
        request = request.header("Accept", "text/plain");

        let response = request.send().await.context("Failed to fetch index")?;

        match response.status() {
            StatusCode::OK => {
                let resp_etag = response
                    .headers()
                    .get("ETag")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from);

                let resp_last_modified = response
                    .headers()
                    .get("Last-Modified")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from);

                let body = response.text().await.context("Failed to read body")?;
                let entries = CrateIndexEntry::parse_index_file(&body);

                if entries.is_empty() {
                    warn!(crate_name = %crate_name, "Empty index file");
                }

                Ok(Some(FetchResult {
                    entries,
                    etag: resp_etag,
                    last_modified: resp_last_modified,
                }))
            }
            StatusCode::NOT_FOUND => {
                debug!(crate_name = %crate_name, "Crate not found");
                Ok(None)
            }
            StatusCode::NOT_MODIFIED => {
                debug!(crate_name = %crate_name, "Crate index not modified");
                Ok(None)
            }
            StatusCode::TOO_MANY_REQUESTS => {
                let retry_after = response
                    .headers()
                    .get("Retry-After")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(60);
                    
                Err(anyhow!(
                    "Rate limited. Retry after {} seconds",
                    retry_after
                ))
            }
            status => {
                Err(anyhow!("Unexpected status {}: {}", status, url))
            }
        }
    }

    /// Fetch crates.io API for crate metadata (owners, downloads, etc.)
    /// This is supplementary - main data comes from index
    #[instrument(skip(self), fields(crate_name = %crate_name))]
    pub async fn fetch_crate_api(&self, crate_name: &str) -> Result<CrateApiResponse> {
        let url = format!("https://crates.io/api/v1/crates/{}", crate_name);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to fetch crate API")?;

        match response.status() {
            StatusCode::OK => {
                response
                    .json()
                    .await
                    .context("Failed to parse crate API response")
            }
            StatusCode::NOT_FOUND => {
                Err(anyhow!("Crate not found: {}", crate_name))
            }
            StatusCode::TOO_MANY_REQUESTS => {
                Err(anyhow!("Rate limited by crates.io API"))
            }
            status => {
                Err(anyhow!("API error {}", status))
            }
        }
    }
}

impl Default for CargoFetcher {
    fn default() -> Self {
        Self::new().expect("Failed to create CargoFetcher")
    }
}

/// Response from crates.io API
#[derive(Debug, serde::Deserialize)]
pub struct CrateApiResponse {
    #[serde(rename = "crate")]
    pub krate: CrateInfo,
    pub versions: Vec<CrateVersionInfo>,
}

#[derive(Debug, serde::Deserialize)]
pub struct CrateInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub documentation: Option<String>,
    pub downloads: i64,
    pub categories: Vec<String>,
    pub keywords: Vec<String>,
    pub max_version: String,
    pub max_stable_version: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct CrateVersionInfo {
    pub id: i64,
    pub num: String,
    pub yanked: bool,
    pub downloads: i64,
    pub license: Option<String>,
    pub crate_size: Option<i64>,
    pub published_by: Option<CrateUser>,
    pub created_at: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct CrateUser {
    pub id: i64,
    pub login: String,
    pub name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sparse_index_url() {
        let path = CrateIndexEntry::index_path("serde");
        let url = format!("{}/{}", SPARSE_INDEX_URL, path);
        assert_eq!(url, "https://index.crates.io/se/rd/serde");
    }
}

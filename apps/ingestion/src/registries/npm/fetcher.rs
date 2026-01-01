use anyhow::{Result, Context};
use crate::http::ProxyRotator;
use reqwest::{StatusCode, Url};
use serde_json::Value;
use std::sync::Arc;
use tracing::{warn, info};

pub struct NpmFetcher {
    rotator: Arc<ProxyRotator>,
}

impl NpmFetcher {
    pub fn new(rotator: Arc<ProxyRotator>) -> Self {
        Self { rotator }
    }

    /// Fetch packument JSON for a package
    pub async fn fetch_packument(&self, package_name: &str) -> Result<Option<Value>> {
        // Handle scoped packages: @foo/bar -> @foo%2fbar
        let encoded_name = package_name.replace("/", "%2f");
        let url = format!("https://registry.npmjs.org/{}", encoded_name);
        
        // Use proxy rotator
        // TODO: Implement retry logic here using the RateLimiter/Retry policy
        // For MVP, we use simple retry in the rotator or just fail.
        // But Rotator returns a fresh client per request.
        
        let lease = self.rotator.get_client()?;
        let client = lease.client;

        let resp = client.get(&url)
            .header("Accept", "application/vnd.npm.install-v1+json") // Enterprise: faster
            .send()
            .await;

        match resp {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    let text = response.text().await?;
                    // lease.report_success(latency); // TODO: Measure latency
                    let json: Value = serde_json::from_str(&text)?;
                    Ok(Some(json))
                } else if status == StatusCode::NOT_FOUND {
                    // Package might be private or deleted
                    Ok(None) 
                } else {
                    // lease.report_failure();
                    warn!(package=%package_name, status=%status, "Failed to fetch packument");
                    Err(anyhow::anyhow!("Registry returned {}", status))
                }
            },
            Err(e) => {
                // lease.report_failure();
                warn!(package=%package_name, error=%e, "Network error fetching packument");
                Err(e.into())
            }
        }
    }
}

use crate::http::ProxyRotator;
use anyhow::Result;
use reqwest::StatusCode;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, warn};

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 500;

pub struct NpmFetcher {
    rotator: Arc<ProxyRotator>,
}

impl NpmFetcher {
    pub fn new(rotator: Arc<ProxyRotator>) -> Self {
        Self { rotator }
    }

    /// Fetch packument JSON for a package with retry logic
    pub async fn fetch_packument(&self, package_name: &str) -> Result<Option<Value>> {
        // Handle scoped packages: @foo/bar -> @foo%2fbar
        let encoded_name = package_name.replace("/", "%2f");
        let url = format!("https://registry.npmjs.org/{}", encoded_name);

        let mut last_error: Option<anyhow::Error> = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                let backoff = Duration::from_millis(INITIAL_BACKOFF_MS * 2u64.pow(attempt - 1));
                debug!(package=%package_name, attempt=%attempt, backoff_ms=%backoff.as_millis(), "Retrying fetch");
                tokio::time::sleep(backoff).await;
            }

            let lease = match self.rotator.get_client() {
                Ok(l) => l,
                Err(e) => {
                    last_error = Some(e.into());
                    continue;
                }
            };

            let resp = lease
                .client
                .get(&url)
                .header("Accept", "application/vnd.npm.install-v1+json")
                .send()
                .await;

            match resp {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        let text = response.text().await?;
                        let json: Value = serde_json::from_str(&text)?;
                        return Ok(Some(json));
                    } else if status == StatusCode::NOT_FOUND {
                        return Ok(None);
                    } else if status == StatusCode::TOO_MANY_REQUESTS {
                        warn!(package=%package_name, attempt=%attempt, "Rate limited, backing off");
                        last_error = Some(anyhow::anyhow!("Rate limited (429)"));
                        continue;
                    } else {
                        warn!(package=%package_name, status=%status, "Failed to fetch packument");
                        last_error = Some(anyhow::anyhow!("Registry returned {}", status));
                        // Don't retry client errors (4xx except 429)
                        if status.is_client_error() {
                            break;
                        }
                        continue;
                    }
                }
                Err(e) => {
                    warn!(package=%package_name, attempt=%attempt, error=%e, "Network error");
                    last_error = Some(e.into());
                    continue;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Failed after {} retries", MAX_RETRIES)))
    }
}

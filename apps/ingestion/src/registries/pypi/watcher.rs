//! PyPI Watcher - Serial-based changelog tracking
//!
//! Uses PyPI's XML-RPC changelog() method to get changes since last serial.
//! This is the "source of truth" for PyPI changes - more reliable than RSS.
//!
//! API: https://warehouse.pypa.io/api-reference/xml-rpc.html

use crate::producer::EventProducer;
use crate::store::PostgresCheckpointStore;
use crate::traits::CheckpointStore;
use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info, instrument, warn};

const PYPI_XMLRPC_URL: &str = "https://pypi.org/pypi";
const BATCH_SIZE: i64 = 1000;
const POLL_INTERVAL_SECS: u64 = 30;

/// Change entry from PyPI changelog
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PypiChangeEntry {
    pub project_name: String,
    pub version: Option<String>,
    pub timestamp: i64,
    pub action: String,
    pub serial: i64,
}

pub struct PypiWatcher {
    client: Client,
    checkpoint_store: Arc<PostgresCheckpointStore>,
    producer: Arc<EventProducer>,
    topic: String,
}

impl PypiWatcher {
    pub fn new(
        checkpoint_store: Arc<PostgresCheckpointStore>,
        producer: Arc<EventProducer>,
        topic: String,
    ) -> Result<Self> {
        let client = Client::builder()
            .user_agent("InverseDeps-PypiWatcher/1.0")
            .timeout(Duration::from_secs(60))
            .build()?;

        Ok(Self {
            client,
            checkpoint_store,
            producer,
            topic,
        })
    }

    #[instrument(skip(self), name = "pypi_watcher_loop")]
    pub async fn run(&self) -> Result<()> {
        info!("Starting PyPI Watcher (serial-based changelog)...");

        loop {
            match self.poll_changes().await {
                Ok(count) => {
                    if count == 0 {
                        debug!("No new PyPI changes, sleeping...");
                        tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;
                    } else {
                        info!(changes = count, "Processed PyPI changelog batch");
                    }
                }
                Err(e) => {
                    error!("PyPI changelog poll error: {}", e);
                    tokio::time::sleep(Duration::from_secs(10)).await;
                }
            }
        }
    }

    async fn poll_changes(&self) -> Result<usize> {
        // 1. Get last serial from checkpoint
        let since_serial: i64 = self
            .checkpoint_store
            .get_cursor("pypi")
            .await?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        // 2. Call XML-RPC changelog(since_serial)
        let changes = self.fetch_changelog(since_serial).await?;

        if changes.is_empty() {
            return Ok(0);
        }

        let last_serial = changes
            .iter()
            .map(|c| c.serial)
            .max()
            .unwrap_or(since_serial);

        // 3. Group changes by project and emit to RAW topic
        let mut projects_seen = std::collections::HashSet::new();
        for change in &changes {
            if !projects_seen.contains(&change.project_name) {
                projects_seen.insert(change.project_name.clone());

                // Emit to raw.pypi.journal.v1
                let payload = serde_json::to_vec(&change)?;
                let key = format!("pypi:{}", change.project_name);

                self.producer
                    .publish_raw(&self.topic, &key, &payload)
                    .await?;
            }
        }

        // 4. Update checkpoint
        self.checkpoint_store
            .set_cursor("pypi", &last_serial.to_string())
            .await?;

        info!(
            since = since_serial,
            last = last_serial,
            projects = projects_seen.len(),
            "PyPI checkpoint updated"
        );

        Ok(projects_seen.len())
    }

    /// Fetch changelog from PyPI XML-RPC API
    ///
    /// The changelog() method returns list of (name, version, timestamp, action, serial)
    async fn fetch_changelog(&self, since_serial: i64) -> Result<Vec<PypiChangeEntry>> {
        // XML-RPC request body for changelog(since_serial)
        let xml_body = format!(
            r#"<?xml version="1.0"?>
<methodCall>
  <methodName>changelog</methodName>
  <params>
    <param><value><int>{}</int></value></param>
  </params>
</methodCall>"#,
            since_serial
        );

        let response = self
            .client
            .post(PYPI_XMLRPC_URL)
            .header("Content-Type", "text/xml")
            .body(xml_body)
            .send()
            .await
            .context("Failed to call PyPI XML-RPC changelog")?;

        if !response.status().is_success() {
            warn!("PyPI XML-RPC returned status: {}", response.status());
            return Ok(vec![]);
        }

        let body = response.text().await?;

        // Parse XML-RPC response
        self.parse_changelog_response(&body)
    }

    /// Parse XML-RPC response into changelog entries
    fn parse_changelog_response(&self, xml: &str) -> Result<Vec<PypiChangeEntry>> {
        use quick_xml::Reader;
        use quick_xml::events::Event;

        let mut entries = Vec::new();
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);

        let mut in_data = false;
        let mut in_value = false;
        let mut current_values: Vec<String> = Vec::new();
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => match e.name().as_ref() {
                    b"data" => in_data = true,
                    b"value" if in_data => in_value = true,
                    _ => {}
                },
                Ok(Event::End(ref e)) => {
                    match e.name().as_ref() {
                        b"data" => {
                            // Each <data> element contains one changelog entry
                            // [name, version, timestamp, action, serial]
                            if current_values.len() >= 5 {
                                let entry = PypiChangeEntry {
                                    project_name: current_values[0].clone(),
                                    version: if current_values[1].is_empty() {
                                        None
                                    } else {
                                        Some(current_values[1].clone())
                                    },
                                    timestamp: current_values[2].parse().unwrap_or(0),
                                    action: current_values[3].clone(),
                                    serial: current_values[4].parse().unwrap_or(0),
                                };
                                entries.push(entry);
                            }
                            current_values.clear();
                            in_data = false;
                        }
                        b"value" => in_value = false,
                        _ => {}
                    }
                }
                Ok(Event::Text(e)) if in_value => {
                    let text = e.unescape()?.to_string();
                    current_values.push(text);
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    warn!("XML parse error: {}", e);
                    break;
                }
                _ => {}
            }
            buf.clear();
        }

        // Limit to BATCH_SIZE
        if entries.len() > BATCH_SIZE as usize {
            entries.truncate(BATCH_SIZE as usize);
        }

        Ok(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_changelog_entry() {
        let entry = PypiChangeEntry {
            project_name: "requests".to_string(),
            version: Some("2.28.0".to_string()),
            timestamp: 1640000000,
            action: "new release".to_string(),
            serial: 12345678,
        };

        assert_eq!(entry.project_name, "requests");
        assert!(entry.version.is_some());
    }
}

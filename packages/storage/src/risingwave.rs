//! RisingWave client wrapper

use anyhow::Result;
use tracing::info;

pub struct RisingWaveClient {
    // pool: sqlx::PgPool,
}

impl RisingWaveClient {
    pub async fn new(url: &str) -> Result<Self> {
        info!(url = %url, "Connecting to RisingWave");
        // TODO: Initialize connection
        Ok(Self {})
    }
}

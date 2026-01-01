//! Configuration module

use serde::Deserialize;
use anyhow::Result;

#[derive(Debug, Deserialize)]
pub struct AppConfig {
    pub kafka: KafkaConfig,
    pub database: DatabaseConfig,
    pub crawler: CrawlerSettings,
    pub registries: RegistryConfig,
}

#[derive(Debug, Deserialize)]
pub struct KafkaConfig {
    pub brokers: String,
    pub topic: String,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Deserialize)]
pub struct CrawlerSettings {
    pub user_agent: String,
    pub timeout_secs: u64,
    pub max_retries: u32,
    pub proxy_urls: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RegistryConfig {
    pub npm_enabled: bool,
    pub pypi_enabled: bool,
    pub cargo_enabled: bool,
    pub poll_interval_secs: u64,
}

impl AppConfig {
    pub fn load() -> Result<Self> {
        dotenvy::dotenv().ok();
        
        let config = config::Config::builder()
            .add_source(config::File::with_name("config/ingestion").required(false))
            .add_source(config::Environment::with_prefix("INGESTION").separator("__"))
            // Default overrides via env vars directly (e.g. DATABASE_URL)
            // .set_override("database.url", std::env::var("DATABASE_URL").ok())?
            .build()?;
        
        Ok(config.try_deserialize()?)
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            kafka: KafkaConfig {
                brokers: "localhost:19092".into(),
                topic: "ingestion-events".into(),
            },
            database: DatabaseConfig {
                url: "postgres://idp:idp_secret@localhost:5432/inverse_deps".into(),
                max_connections: 5,
            },
            crawler: CrawlerSettings {
                user_agent: "InverseDeps-Crawler/1.0".into(),
                timeout_secs: 30,
                max_retries: 3,
                proxy_urls: vec![],
            },
            registries: RegistryConfig {
                npm_enabled: true,
                pypi_enabled: true,
                cargo_enabled: true,
                poll_interval_secs: 60,
            },
        }
    }
}

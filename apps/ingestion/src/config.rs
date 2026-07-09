//! Configuration module

use anyhow::Result;
use serde::Deserialize;

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

        let defaults = AppConfig::default();
        let mut builder = config::Config::builder()
            .set_default("kafka.brokers", defaults.kafka.brokers)?
            .set_default("kafka.topic", defaults.kafka.topic)?
            .set_default("database.url", defaults.database.url)?
            .set_default(
                "database.max_connections",
                defaults.database.max_connections as i64,
            )?
            .set_default("crawler.user_agent", defaults.crawler.user_agent)?
            .set_default("crawler.timeout_secs", defaults.crawler.timeout_secs as i64)?
            .set_default("crawler.max_retries", defaults.crawler.max_retries as i64)?
            .set_default("crawler.proxy_urls", defaults.crawler.proxy_urls)?
            .set_default("registries.npm_enabled", defaults.registries.npm_enabled)?
            .set_default("registries.pypi_enabled", defaults.registries.pypi_enabled)?
            .set_default(
                "registries.cargo_enabled",
                defaults.registries.cargo_enabled,
            )?
            .set_default(
                "registries.poll_interval_secs",
                defaults.registries.poll_interval_secs as i64,
            )?
            .add_source(config::File::with_name("config/ingestion").required(false))
            .add_source(config::Environment::with_prefix("INGESTION").separator("__"));

        if let Ok(value) = std::env::var("DATABASE_URL") {
            builder = builder.set_override("database.url", value)?;
        }
        if let Ok(value) = std::env::var("KAFKA_BROKERS") {
            builder = builder.set_override("kafka.brokers", value)?;
        }
        if let Ok(value) = std::env::var("KAFKA_TOPIC") {
            builder = builder.set_override("kafka.topic", value)?;
        }

        let config = builder.build()?;

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

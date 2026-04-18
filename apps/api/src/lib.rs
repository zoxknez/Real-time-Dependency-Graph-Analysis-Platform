//! API Gateway Library
//!
//! Shared modules and utilities for the API gateway service.

pub mod cache;
pub mod config;
pub mod embeddings;
pub mod gql;
pub mod graph;
pub mod handlers;
pub mod kafka;
pub mod metrics;
pub mod middleware;
pub mod services;
pub mod streaming;

// Re-export commonly used types
pub use cache::CacheClient;
pub use config::Config;
pub use graph::GraphClient;
pub use handlers::AppState;
pub use streaming::{stream_results, StreamConfig, StreamBatch};

// Made with Bob

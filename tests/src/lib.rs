//! E2E Test Infrastructure
//!
//! Provides testcontainers-based infrastructure for integration testing
//! of the complete platform including Memgraph, Qdrant, Kafka, and RisingWave.

pub mod containers;
pub mod fixtures;
pub mod helpers;

pub use containers::*;
pub use fixtures::*;
pub use helpers::*;

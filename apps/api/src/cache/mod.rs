//! Redis caching layer for hot queries
//!
//! Features:
//! - Connection pooling with auto-reconnect
//! - Singleflight for stampede protection
//! - Stale-while-revalidate pattern

mod client;
mod singleflight;

pub use client::{CacheClient, CacheKeys};
pub use singleflight::{CacheConfig, SingleflightCache, TimestampedEntry};

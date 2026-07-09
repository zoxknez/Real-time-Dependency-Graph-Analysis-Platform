//! Cargo/Crates.io Registry Module
//!
//! Enterprise-grade ingestion for Rust crates from crates.io
//!
//! Features:
//! - Sparse index watcher (modern, efficient)
//! - Git index fallback (legacy support)
//! - JSON lines parsing for crate metadata
//! - Yank detection via index diff
//! - Idempotent state management via PostgreSQL

mod diff;
mod fetcher;
mod index;
mod state;
mod watcher;
mod worker;

pub use fetcher::CargoFetcher;
pub use index::CrateIndexEntry;
pub use state::CargoStateStore;
pub use watcher::CargoWatcher;
pub use worker::CargoWorker;

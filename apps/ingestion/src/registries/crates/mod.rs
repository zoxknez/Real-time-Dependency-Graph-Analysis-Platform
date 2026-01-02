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

mod watcher;
mod worker;
mod fetcher;
mod state;
mod diff;
mod index;

pub use watcher::CargoWatcher;
pub use worker::CargoWorker;
pub use fetcher::CargoFetcher;
pub use state::CargoStateStore;
pub use index::CrateIndexEntry;

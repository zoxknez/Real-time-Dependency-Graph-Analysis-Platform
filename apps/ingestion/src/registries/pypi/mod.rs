//! PyPI Registry Module
//!
//! Enterprise-grade ingestion for Python Package Index (PyPI)
//!
//! Features:
//! - Serial-based changelog tracking (source of truth)
//! - JSON API for package metadata
//! - Simple API for yank detection (PEP 691)
//! - Idempotent state management via PostgreSQL

mod diff;
mod fetcher;
mod state;
mod watcher;
mod worker;

pub use fetcher::PypiFetcher;
pub use state::PypiStateStore;
pub use watcher::PypiWatcher;
pub use worker::PypiWorker;

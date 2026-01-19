//! Dead Letter Queue module for Vector Writer
//!
//! Provides DLQ publishing for failed embedding events
//! that cannot be written to Qdrant.

mod publisher;

pub use publisher::DlqPublisher;

// Event emission layer - outbox publisher and event construction

pub mod outbox_publisher;

pub use outbox_publisher::{OutboxPublisher, OutboxPublisherConfig, OutboxStats};

// Event emission layer - outbox publisher and event construction
//
// Features:
// - Transactional outbox pattern for reliable publishing
// - PostgreSQL LISTEN/NOTIFY for real-time wakeups
// - Exponential backoff reconnection
// - Hybrid polling + notification mode

pub mod notify_watcher;
pub mod outbox_publisher;

pub use notify_watcher::{
    ConnectionState, HybridOutboxWatcher, NOTIFY_TRIGGER_SQL, NotifyWatcher, NotifyWatcherConfig,
    OutboxNotification, WatcherStats,
};
pub use outbox_publisher::{OutboxPublisher, OutboxPublisherConfig, OutboxStats};

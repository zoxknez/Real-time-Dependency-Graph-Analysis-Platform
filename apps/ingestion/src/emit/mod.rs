// Event emission layer - outbox publisher and event construction
//
// Features:
// - Transactional outbox pattern for reliable publishing
// - PostgreSQL LISTEN/NOTIFY for real-time wakeups
// - Exponential backoff reconnection
// - Hybrid polling + notification mode

pub mod outbox_publisher;
pub mod notify_watcher;

pub use outbox_publisher::{OutboxPublisher, OutboxPublisherConfig, OutboxStats};
pub use notify_watcher::{
    NotifyWatcher, NotifyWatcherConfig, HybridOutboxWatcher, 
    OutboxNotification, ConnectionState, WatcherStats,
    NOTIFY_TRIGGER_SQL,
};

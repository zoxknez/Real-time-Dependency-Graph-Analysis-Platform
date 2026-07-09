use chrono::{DateTime, Utc};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// Poison queue entry
#[derive(Debug, Clone)]
pub struct PoisonItem {
    pub key: String,
    pub payload: Vec<u8>,
    pub error: String,
    pub occurred_at: DateTime<Utc>,
}

/// Simple in-memory poison queue for failed messages
#[derive(Clone, Default)]
pub struct PoisonQueue {
    inner: Arc<Mutex<VecDeque<PoisonItem>>>,
}

impl PoisonQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&self, item: PoisonItem) {
        if let Ok(mut queue) = self.inner.lock() {
            queue.push_back(item);
        }
    }

    pub fn pop(&self) -> Option<PoisonItem> {
        self.inner.lock().ok().and_then(|mut q| q.pop_front())
    }

    pub fn len(&self) -> usize {
        self.inner.lock().map(|q| q.len()).unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn drain(&self) -> Vec<PoisonItem> {
        self.inner
            .lock()
            .map(|mut q| q.drain(..).collect())
            .unwrap_or_default()
    }
}

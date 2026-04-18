//! Query Result Streaming for Large Datasets
//!
//! Implements streaming responses for GraphQL queries to handle large result sets
//! without loading everything into memory.
//!
//! References:
//! - https://async-graphql.github.io/async-graphql/en/subscription.html
//! - https://www.apollographql.com/docs/react/data/subscriptions/
//! - https://github.com/enisdenjo/graphql-ws

use async_graphql::*;
use futures::stream::{Stream, StreamExt};
use std::pin::Pin;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tracing::{debug, warn};

pub mod package_stream;
pub mod dependency_stream;

/// Stream configuration
#[derive(Debug, Clone)]
pub struct StreamConfig {
    /// Batch size for streaming
    pub batch_size: usize,
    /// Delay between batches (backpressure)
    pub batch_delay: Duration,
    /// Maximum items to stream
    pub max_items: usize,
    /// Buffer size for channel
    pub buffer_size: usize,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            batch_size: 100,
            batch_delay: Duration::from_millis(10),
            max_items: 10_000,
            buffer_size: 1000,
        }
    }
}

/// Streaming result wrapper
#[derive(Debug, Clone, SimpleObject)]
pub struct StreamBatch<T: OutputType> {
    /// Items in this batch
    pub items: Vec<T>,
    /// Batch number (0-indexed)
    pub batch_number: usize,
    /// Total batches (if known)
    pub total_batches: Option<usize>,
    /// Has more batches
    pub has_more: bool,
    /// Cursor for pagination
    pub cursor: Option<String>,
}

/// Stream a large result set in batches
pub fn stream_results<T, F, Fut>(
    fetch_fn: F,
    config: StreamConfig,
) -> Pin<Box<dyn Stream<Item = Result<StreamBatch<T>>> + Send>>
where
    T: OutputType + Send + 'static,
    F: Fn(usize, usize) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<Vec<T>>> + Send,
{
    let (tx, rx) = mpsc::channel(config.buffer_size);
    
    tokio::spawn(async move {
        let mut batch_number = 0;
        let mut total_items = 0;
        
        loop {
            // Check if we've reached max items
            if total_items >= config.max_items {
                debug!(
                    total_items = total_items,
                    "Reached max items limit"
                );
                break;
            }
            
            // Fetch next batch
            let offset = batch_number * config.batch_size;
            let limit = config.batch_size.min(config.max_items - total_items);
            
            match fetch_fn(offset, limit).await {
                Ok(items) => {
                    let item_count = items.len();
                    let has_more = item_count == config.batch_size;
                    
                    total_items += item_count;
                    
                    let batch = StreamBatch {
                        items,
                        batch_number,
                        total_batches: None, // Unknown in streaming mode
                        has_more,
                        cursor: Some(format!("batch:{}", batch_number + 1)),
                    };
                    
                    if tx.send(Ok(batch)).await.is_err() {
                        debug!("Stream receiver dropped");
                        break;
                    }
                    
                    batch_number += 1;
                    
                    // Stop if no more items
                    if !has_more {
                        debug!(
                            total_items = total_items,
                            batches = batch_number,
                            "Stream complete"
                        );
                        break;
                    }
                    
                    // Backpressure delay
                    if config.batch_delay > Duration::ZERO {
                        tokio::time::sleep(config.batch_delay).await;
                    }
                }
                Err(e) => {
                    warn!(error = %e, "Stream fetch error");
                    let _ = tx.send(Err(e)).await;
                    break;
                }
            }
        }
    });
    
    Box::pin(ReceiverStream::new(rx))
}

/// Stream with progress tracking
pub struct ProgressStream<T> {
    stream: Pin<Box<dyn Stream<Item = Result<T>> + Send>>,
    total: Option<usize>,
    processed: usize,
}

impl<T> ProgressStream<T> {
    pub fn new(
        stream: Pin<Box<dyn Stream<Item = Result<T>> + Send>>,
        total: Option<usize>,
    ) -> Self {
        Self {
            stream,
            total,
            processed: 0,
        }
    }
    
    pub fn progress(&self) -> f64 {
        if let Some(total) = self.total {
            if total > 0 {
                return (self.processed as f64 / total as f64) * 100.0;
            }
        }
        0.0
    }
}

impl<T> Stream for ProgressStream<T> {
    type Item = Result<(T, f64)>; // (item, progress_percentage)
    
    fn poll_next(
        mut self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        match self.stream.as_mut().poll_next(cx) {
            std::task::Poll::Ready(Some(Ok(item))) => {
                self.processed += 1;
                let progress = self.progress();
                std::task::Poll::Ready(Some(Ok((item, progress))))
            }
            std::task::Poll::Ready(Some(Err(e))) => {
                std::task::Poll::Ready(Some(Err(e)))
            }
            std::task::Poll::Ready(None) => std::task::Poll::Ready(None),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}

/// Buffered stream for better throughput
pub fn buffered_stream<T, F, Fut>(
    items: Vec<String>,
    fetch_fn: F,
    concurrency: usize,
) -> Pin<Box<dyn Stream<Item = Result<T>> + Send>>
where
    T: Send + 'static,
    F: Fn(String) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<T>> + Send + 'static,
{
    let stream = futures::stream::iter(items)
        .map(move |item| {
            let fetch_fn = &fetch_fn;
            async move { fetch_fn(item).await }
        })
        .buffer_unordered(concurrency);
    
    Box::pin(stream)
}

/// Throttled stream to prevent overwhelming downstream
pub fn throttled_stream<T>(
    stream: Pin<Box<dyn Stream<Item = T> + Send>>,
    rate: Duration,
) -> Pin<Box<dyn Stream<Item = T> + Send>>
where
    T: Send + 'static,
{
    let throttled = stream.then(move |item| async move {
        tokio::time::sleep(rate).await;
        item
    });
    
    Box::pin(throttled)
}

/// Retry stream for transient failures
pub fn retry_stream<T, F, Fut>(
    fetch_fn: F,
    max_retries: usize,
    retry_delay: Duration,
) -> Pin<Box<dyn Stream<Item = Result<T>> + Send>>
where
    T: Send + 'static,
    F: Fn() -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<T>> + Send + 'static,
{
    let (tx, rx) = mpsc::channel(1);
    
    tokio::spawn(async move {
        for attempt in 0..=max_retries {
            match fetch_fn().await {
                Ok(result) => {
                    let _ = tx.send(Ok(result)).await;
                    return;
                }
                Err(e) => {
                    if attempt == max_retries {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    
                    warn!(
                        attempt = attempt + 1,
                        max_retries = max_retries,
                        "Retry attempt failed, retrying..."
                    );
                    
                    tokio::time::sleep(retry_delay * (attempt as u32 + 1)).await;
                }
            }
        }
    });
    
    Box::pin(ReceiverStream::new(rx))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_stream_results() {
        let config = StreamConfig {
            batch_size: 10,
            batch_delay: Duration::from_millis(1),
            max_items: 50,
            buffer_size: 10,
        };

        let fetch_fn = |offset: usize, limit: usize| async move {
            // Simulate database fetch
            let items: Vec<String> = (offset..offset + limit)
                .map(|i| format!("item-{}", i))
                .collect();
            Ok(items)
        };

        let mut stream = stream_results(fetch_fn, config);
        let mut total_items = 0;
        let mut batch_count = 0;

        while let Some(result) = stream.next().await {
            match result {
                Ok(batch) => {
                    total_items += batch.items.len();
                    batch_count += 1;
                    assert_eq!(batch.batch_number, batch_count - 1);
                }
                Err(e) => panic!("Stream error: {}", e),
            }
        }

        assert_eq!(total_items, 50);
        assert_eq!(batch_count, 5);
    }

    #[tokio::test]
    async fn test_buffered_stream() {
        let items = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        
        let fetch_fn = |item: String| async move {
            tokio::time::sleep(Duration::from_millis(10)).await;
            Ok::<_, anyhow::Error>(item.to_uppercase())
        };

        let mut stream = buffered_stream(items, fetch_fn, 2);
        let mut results = Vec::new();

        while let Some(result) = stream.next().await {
            results.push(result.unwrap());
        }

        assert_eq!(results.len(), 3);
        assert!(results.contains(&"A".to_string()));
        assert!(results.contains(&"B".to_string()));
        assert!(results.contains(&"C".to_string()));
    }

    #[tokio::test]
    async fn test_throttled_stream() {
        let items = vec![1, 2, 3];
        let stream = futures::stream::iter(items);
        
        let start = std::time::Instant::now();
        let mut throttled = throttled_stream(
            Box::pin(stream),
            Duration::from_millis(50)
        );

        let mut count = 0;
        while let Some(_) = throttled.next().await {
            count += 1;
        }

        let elapsed = start.elapsed();
        
        assert_eq!(count, 3);
        // Should take at least 150ms (3 items * 50ms)
        assert!(elapsed >= Duration::from_millis(150));
    }

    #[tokio::test]
    async fn test_retry_stream() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let attempts = Arc::new(AtomicUsize::new(0));
        let attempts_clone = attempts.clone();

        let fetch_fn = move || {
            let attempts = attempts_clone.clone();
            async move {
                let count = attempts.fetch_add(1, Ordering::Relaxed);
                if count < 2 {
                    Err(anyhow::anyhow!("Transient error"))
                } else {
                    Ok("success")
                }
            }
        };

        let mut stream = retry_stream(
            fetch_fn,
            3,
            Duration::from_millis(10)
        );

        if let Some(result) = stream.next().await {
            assert!(result.is_ok());
            assert_eq!(result.unwrap(), "success");
        }

        // Should have made 3 attempts
        assert_eq!(attempts.load(Ordering::Relaxed), 3);
    }
}

// Made with Bob

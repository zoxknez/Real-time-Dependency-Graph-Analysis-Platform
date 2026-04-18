//! Integration tests for advanced features
//!
//! Tests:
//! - Advanced caching (L1/L2, strategies, compression)
//! - Enhanced circuit breaker (states, bulkhead, metrics)
//! - Query streaming (batching, backpressure, retry)

use anyhow::Result;
use redis::aio::MultiplexedConnection;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

// Import from packages
use packages::storage::{
    AdvancedCache, CacheConfig, CacheStrategy,
    EnhancedCircuitBreaker, EnhancedCircuitBreakerConfig,
    CircuitBreakerState,
};

// Import from api
use api::streaming::{stream_results, StreamConfig};

// ═════════════════════════════════════════════════════════════════════════════
// Advanced Cache Tests
// ═════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_cache_l1_hit() -> Result<()> {
    let redis_conn = setup_redis().await?;
    let config = CacheConfig {
        default_ttl: Duration::from_secs(60),
        max_size: 100,
        strategy: CacheStrategy::WriteThrough,
        compression: false,
        key_prefix: "test".to_string(),
    };
    
    let cache = AdvancedCache::new(redis_conn, config);
    
    // Set value
    cache.set("key1", &"value1".to_string(), None).await?;
    
    // Get value (should hit L1)
    let value: Option<String> = cache.get("key1").await?;
    assert_eq!(value, Some("value1".to_string()));
    
    // Check stats
    let stats = cache.stats().await?;
    assert_eq!(stats.l1_hits, 1);
    assert_eq!(stats.l1_misses, 0);
    
    Ok(())
}

#[tokio::test]
async fn test_cache_l2_fallback() -> Result<()> {
    let redis_conn = setup_redis().await?;
    let config = CacheConfig {
        default_ttl: Duration::from_secs(60),
        max_size: 10, // Small L1 to force eviction
        strategy: CacheStrategy::WriteThrough,
        compression: false,
        key_prefix: "test".to_string(),
    };
    
    let cache = AdvancedCache::new(redis_conn, config);
    
    // Fill L1 cache
    for i in 0..15 {
        cache.set(&format!("key{}", i), &format!("value{}", i), None).await?;
    }
    
    // Get early key (should be evicted from L1, hit L2)
    let value: Option<String> = cache.get("key0").await?;
    assert_eq!(value, Some("value0".to_string()));
    
    // Check stats
    let stats = cache.stats().await?;
    assert!(stats.l2_hits > 0, "Expected L2 hits");
    
    Ok(())
}

#[tokio::test]
async fn test_cache_compression() -> Result<()> {
    let redis_conn = setup_redis().await?;
    let config = CacheConfig {
        default_ttl: Duration::from_secs(60),
        max_size: 100,
        strategy: CacheStrategy::WriteThrough,
        compression: true,
        key_prefix: "test".to_string(),
    };
    
    let cache = AdvancedCache::new(redis_conn, config);
    
    // Large value that benefits from compression
    let large_value = "x".repeat(10000);
    cache.set("large_key", &large_value, None).await?;
    
    // Retrieve and verify
    let value: Option<String> = cache.get("large_key").await?;
    assert_eq!(value, Some(large_value));
    
    Ok(())
}

#[tokio::test]
async fn test_cache_pattern_deletion() -> Result<()> {
    let redis_conn = setup_redis().await?;
    let config = CacheConfig {
        default_ttl: Duration::from_secs(60),
        max_size: 100,
        strategy: CacheStrategy::WriteThrough,
        compression: false,
        key_prefix: "test".to_string(),
    };
    
    let cache = AdvancedCache::new(redis_conn, config);
    
    // Set multiple keys with pattern
    cache.set("user:1:profile", &"data1".to_string(), None).await?;
    cache.set("user:1:settings", &"data2".to_string(), None).await?;
    cache.set("user:2:profile", &"data3".to_string(), None).await?;
    
    // Delete pattern
    let deleted = cache.delete_pattern("user:1:*").await?;
    assert_eq!(deleted, 2);
    
    // Verify deletion
    let value: Option<String> = cache.get("user:1:profile").await?;
    assert_eq!(value, None);
    
    let value: Option<String> = cache.get("user:2:profile").await?;
    assert_eq!(value, Some("data3".to_string()));
    
    Ok(())
}

#[tokio::test]
async fn test_cache_get_or_compute() -> Result<()> {
    let redis_conn = setup_redis().await?;
    let config = CacheConfig {
        default_ttl: Duration::from_secs(60),
        max_size: 100,
        strategy: CacheStrategy::CacheAside,
        compression: false,
        key_prefix: "test".to_string(),
    };
    
    let cache = AdvancedCache::new(redis_conn, config);
    
    let mut compute_count = 0;
    
    // First call - should compute
    let value = cache.get_or_compute(
        "computed_key",
        || {
            compute_count += 1;
            async { Ok::<_, anyhow::Error>("computed_value".to_string()) }
        },
        None
    ).await?;
    assert_eq!(value, "computed_value");
    assert_eq!(compute_count, 1);
    
    // Second call - should use cache
    let value = cache.get_or_compute(
        "computed_key",
        || {
            compute_count += 1;
            async { Ok::<_, anyhow::Error>("computed_value".to_string()) }
        },
        None
    ).await?;
    assert_eq!(value, "computed_value");
    assert_eq!(compute_count, 1); // Should not increment
    
    Ok(())
}

// ═════════════════════════════════════════════════════════════════════════════
// Enhanced Circuit Breaker Tests
// ═════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_circuit_breaker_closed_state() -> Result<()> {
    let config = EnhancedCircuitBreakerConfig {
        failure_threshold: 0.5,
        min_requests: 5,
        timeout: Duration::from_secs(30),
        success_threshold: 3,
        window_size: Duration::from_secs(60),
        max_concurrent: 100,
    };
    
    let cb = EnhancedCircuitBreaker::new(config);
    
    // Successful calls
    for _ in 0..10 {
        let result = cb.call(async { Ok::<_, anyhow::Error>(42) }).await;
        assert!(result.is_ok());
    }
    
    // Should remain closed
    let state = cb.state().await;
    assert_eq!(state, CircuitBreakerState::Closed);
    
    Ok(())
}

#[tokio::test]
async fn test_circuit_breaker_opens_on_failures() -> Result<()> {
    let config = EnhancedCircuitBreakerConfig {
        failure_threshold: 0.5,
        min_requests: 5,
        timeout: Duration::from_secs(1),
        success_threshold: 3,
        window_size: Duration::from_secs(60),
        max_concurrent: 100,
    };
    
    let cb = EnhancedCircuitBreaker::new(config);
    
    // Mix of successes and failures
    for i in 0..10 {
        let result = if i % 2 == 0 {
            cb.call(async { Ok::<_, anyhow::Error>(42) }).await
        } else {
            cb.call(async { Err::<i32, _>(anyhow::anyhow!("error")) }).await
        };
        let _ = result;
    }
    
    // Should open due to 50% failure rate
    let state = cb.state().await;
    assert_eq!(state, CircuitBreakerState::Open);
    
    Ok(())
}

#[tokio::test]
async fn test_circuit_breaker_half_open_recovery() -> Result<()> {
    let config = EnhancedCircuitBreakerConfig {
        failure_threshold: 0.5,
        min_requests: 5,
        timeout: Duration::from_millis(100),
        success_threshold: 3,
        window_size: Duration::from_secs(60),
        max_concurrent: 100,
    };
    
    let cb = EnhancedCircuitBreaker::new(config);
    
    // Cause failures to open circuit
    for _ in 0..10 {
        let _ = cb.call(async { Err::<i32, _>(anyhow::anyhow!("error")) }).await;
    }
    
    assert_eq!(cb.state().await, CircuitBreakerState::Open);
    
    // Wait for timeout
    sleep(Duration::from_millis(150)).await;
    
    // Should transition to half-open
    let _ = cb.call(async { Ok::<_, anyhow::Error>(42) }).await;
    let state = cb.state().await;
    assert!(
        state == CircuitBreakerState::HalfOpen || state == CircuitBreakerState::Closed,
        "Expected HalfOpen or Closed, got {:?}", state
    );
    
    Ok(())
}

#[tokio::test]
async fn test_circuit_breaker_bulkhead() -> Result<()> {
    let config = EnhancedCircuitBreakerConfig {
        failure_threshold: 0.5,
        min_requests: 5,
        timeout: Duration::from_secs(30),
        success_threshold: 3,
        window_size: Duration::from_secs(60),
        max_concurrent: 2, // Low limit for testing
    };
    
    let cb = Arc::new(EnhancedCircuitBreaker::new(config));
    
    // Start 2 concurrent operations (at limit)
    let cb1 = cb.clone();
    let handle1 = tokio::spawn(async move {
        cb1.call(async {
            sleep(Duration::from_millis(100)).await;
            Ok::<_, anyhow::Error>(1)
        }).await
    });
    
    let cb2 = cb.clone();
    let handle2 = tokio::spawn(async move {
        cb2.call(async {
            sleep(Duration::from_millis(100)).await;
            Ok::<_, anyhow::Error>(2)
        }).await
    });
    
    // Third should be rejected
    sleep(Duration::from_millis(10)).await; // Let others start
    let result = cb.call(async { Ok::<_, anyhow::Error>(3) }).await;
    assert!(result.is_err(), "Expected bulkhead rejection");
    
    // Wait for others to complete
    let _ = handle1.await;
    let _ = handle2.await;
    
    Ok(())
}

#[tokio::test]
async fn test_circuit_breaker_metrics() -> Result<()> {
    let config = EnhancedCircuitBreakerConfig {
        failure_threshold: 0.5,
        min_requests: 5,
        timeout: Duration::from_secs(30),
        success_threshold: 3,
        window_size: Duration::from_secs(60),
        max_concurrent: 100,
    };
    
    let cb = EnhancedCircuitBreaker::new(config);
    
    // Execute some operations
    for i in 0..10 {
        let result = if i < 7 {
            cb.call(async { Ok::<_, anyhow::Error>(42) }).await
        } else {
            cb.call(async { Err::<i32, _>(anyhow::anyhow!("error")) }).await
        };
        let _ = result;
    }
    
    // Check stats
    let stats = cb.stats().await;
    assert_eq!(stats.total_requests, 10);
    assert_eq!(stats.successful_requests, 7);
    assert_eq!(stats.failed_requests, 3);
    assert!((stats.error_rate - 0.3).abs() < 0.01);
    
    Ok(())
}

// ═════════════════════════════════════════════════════════════════════════════
// Query Streaming Tests
// ═════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_streaming_basic() -> Result<()> {
    let config = StreamConfig {
        batch_size: 10,
        batch_delay: Duration::from_millis(10),
        max_items: 100,
        buffer_size: 50,
    };
    
    // Mock fetch function
    let fetch_fn = |offset: usize, limit: usize| async move {
        let items: Vec<i32> = (offset..offset + limit.min(100 - offset))
            .map(|i| i as i32)
            .collect();
        Ok::<_, anyhow::Error>(items)
    };
    
    let mut stream = stream_results(fetch_fn, config);
    let mut total_items = 0;
    let mut batch_count = 0;
    
    while let Some(batch_result) = stream.next().await {
        let batch = batch_result?;
        total_items += batch.items.len();
        batch_count += 1;
        
        assert!(batch.items.len() <= 10, "Batch size exceeded");
        assert_eq!(batch.batch_number, batch_count);
    }
    
    assert_eq!(total_items, 100);
    assert_eq!(batch_count, 10);
    
    Ok(())
}

#[tokio::test]
async fn test_streaming_empty_result() -> Result<()> {
    let config = StreamConfig {
        batch_size: 10,
        batch_delay: Duration::from_millis(10),
        max_items: 100,
        buffer_size: 50,
    };
    
    // Fetch function that returns empty
    let fetch_fn = |_offset: usize, _limit: usize| async move {
        Ok::<Vec<i32>, anyhow::Error>(vec![])
    };
    
    let mut stream = stream_results(fetch_fn, config);
    let batch = stream.next().await;
    
    assert!(batch.is_none(), "Expected no batches for empty result");
    
    Ok(())
}

#[tokio::test]
async fn test_streaming_partial_batch() -> Result<()> {
    let config = StreamConfig {
        batch_size: 10,
        batch_delay: Duration::from_millis(10),
        max_items: 25, // Not divisible by batch_size
        buffer_size: 50,
    };
    
    let fetch_fn = |offset: usize, limit: usize| async move {
        let items: Vec<i32> = (offset..offset + limit.min(25 - offset))
            .map(|i| i as i32)
            .collect();
        Ok::<_, anyhow::Error>(items)
    };
    
    let mut stream = stream_results(fetch_fn, config);
    let mut batches = vec![];
    
    while let Some(batch_result) = stream.next().await {
        batches.push(batch_result?);
    }
    
    assert_eq!(batches.len(), 3); // 10 + 10 + 5
    assert_eq!(batches[0].items.len(), 10);
    assert_eq!(batches[1].items.len(), 10);
    assert_eq!(batches[2].items.len(), 5);
    assert!(!batches[2].has_more);
    
    Ok(())
}

#[tokio::test]
async fn test_streaming_progress_tracking() -> Result<()> {
    let config = StreamConfig {
        batch_size: 10,
        batch_delay: Duration::from_millis(10),
        max_items: 50,
        buffer_size: 50,
    };
    
    let fetch_fn = |offset: usize, limit: usize| async move {
        let items: Vec<i32> = (offset..offset + limit.min(50 - offset))
            .map(|i| i as i32)
            .collect();
        Ok::<_, anyhow::Error>(items)
    };
    
    let mut stream = stream_results(fetch_fn, config);
    
    while let Some(batch_result) = stream.next().await {
        let batch = batch_result?;
        
        // Verify cursor progression
        assert_eq!(batch.cursor, batch.batch_number * 10);
        
        // Verify has_more flag
        if batch.batch_number < 5 {
            assert!(batch.has_more);
        } else {
            assert!(!batch.has_more);
        }
    }
    
    Ok(())
}

// ═════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═════════════════════════════════════════════════════════════════════════════

async fn setup_redis() -> Result<MultiplexedConnection> {
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://localhost:6379".to_string());
    
    let client = redis::Client::open(redis_url)?;
    let conn = client.get_multiplexed_async_connection().await?;
    
    Ok(conn)
}

// ═════════════════════════════════════════════════════════════════════════════
// Integration Test: Full Pipeline
// ═════════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_full_pipeline_with_advanced_features() -> Result<()> {
    // Setup
    let redis_conn = setup_redis().await?;
    
    // 1. Cache configuration
    let cache_config = CacheConfig {
        default_ttl: Duration::from_secs(60),
        max_size: 100,
        strategy: CacheStrategy::WriteThrough,
        compression: true,
        key_prefix: "pipeline".to_string(),
    };
    let cache = Arc::new(AdvancedCache::new(redis_conn, cache_config));
    
    // 2. Circuit breaker configuration
    let cb_config = EnhancedCircuitBreakerConfig {
        failure_threshold: 0.5,
        min_requests: 5,
        timeout: Duration::from_secs(30),
        success_threshold: 3,
        window_size: Duration::from_secs(60),
        max_concurrent: 10,
    };
    let circuit_breaker = Arc::new(EnhancedCircuitBreaker::new(cb_config));
    
    // 3. Simulate database query with circuit breaker
    let query_with_protection = |query: &str| {
        let cb = circuit_breaker.clone();
        let q = query.to_string();
        async move {
            cb.call(async move {
                // Simulate query
                sleep(Duration::from_millis(10)).await;
                Ok::<Vec<String>, anyhow::Error>(vec![q])
            }).await
        }
    };
    
    // 4. Use cache with circuit breaker
    let cache_key = "test:query:1";
    let result = cache.get_or_compute(
        cache_key,
        || query_with_protection("SELECT * FROM packages"),
        Some(Duration::from_secs(300))
    ).await?;
    
    assert!(!result.is_empty());
    
    // 5. Verify cache hit on second call
    let stats_before = cache.stats().await?;
    let _ = cache.get::<Vec<String>>(cache_key).await?;
    let stats_after = cache.stats().await?;
    
    assert_eq!(stats_after.l1_hits, stats_before.l1_hits + 1);
    
    // 6. Verify circuit breaker stats
    let cb_stats = circuit_breaker.stats().await;
    assert!(cb_stats.successful_requests > 0);
    assert_eq!(cb_stats.failed_requests, 0);
    
    Ok(())
}

// Made with Bob

//! Performance benchmarks for advanced features
//!
//! Run with: cargo bench --bench performance_benchmark

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId, Throughput};
use std::time::Duration;
use tokio::runtime::Runtime;

// Mock implementations for benchmarking
mod mocks {
    use std::sync::Arc;
    use std::collections::HashMap;
    use tokio::sync::RwLock;
    
    pub struct MockCache {
        data: Arc<RwLock<HashMap<String, Vec<u8>>>>,
    }
    
    impl MockCache {
        pub fn new() -> Self {
            Self {
                data: Arc::new(RwLock::new(HashMap::new())),
            }
        }
        
        pub async fn get(&self, key: &str) -> Option<Vec<u8>> {
            self.data.read().await.get(key).cloned()
        }
        
        pub async fn set(&self, key: String, value: Vec<u8>) {
            self.data.write().await.insert(key, value);
        }
    }
    
    pub struct MockCircuitBreaker {
        failure_count: Arc<RwLock<usize>>,
    }
    
    impl MockCircuitBreaker {
        pub fn new() -> Self {
            Self {
                failure_count: Arc::new(RwLock::new(0)),
            }
        }
        
        pub async fn call<F, T>(&self, f: F) -> Result<T, String>
        where
            F: std::future::Future<Output = Result<T, String>>,
        {
            let result = f.await;
            if result.is_err() {
                *self.failure_count.write().await += 1;
            }
            result
        }
    }
}

use mocks::{MockCache, MockCircuitBreaker};

// ═════════════════════════════════════════════════════════════════════════════
// Cache Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

fn bench_cache_get(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let cache = rt.block_on(async {
        let cache = MockCache::new();
        // Pre-populate cache
        for i in 0..1000 {
            cache.set(format!("key_{}", i), vec![0u8; 1024]).await;
        }
        cache
    });
    
    let mut group = c.benchmark_group("cache_get");
    
    for size in [10, 100, 1000].iter() {
        group.throughput(Throughput::Elements(*size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, &size| {
            b.to_async(&rt).iter(|| async {
                for i in 0..size {
                    let _ = cache.get(&format!("key_{}", i % 1000)).await;
                }
            });
        });
    }
    
    group.finish();
}

fn bench_cache_set(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    let mut group = c.benchmark_group("cache_set");
    
    for size in [10, 100, 1000].iter() {
        group.throughput(Throughput::Elements(*size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, &size| {
            b.to_async(&rt).iter(|| async {
                let cache = MockCache::new();
                for i in 0..size {
                    cache.set(format!("key_{}", i), vec![0u8; 1024]).await;
                }
            });
        });
    }
    
    group.finish();
}

fn bench_cache_mixed_workload(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let cache = rt.block_on(async {
        let cache = MockCache::new();
        // Pre-populate cache
        for i in 0..500 {
            cache.set(format!("key_{}", i), vec![0u8; 1024]).await;
        }
        cache
    });
    
    c.bench_function("cache_mixed_80_20", |b| {
        b.to_async(&rt).iter(|| async {
            // 80% reads, 20% writes
            for i in 0..100 {
                if i < 80 {
                    let _ = cache.get(&format!("key_{}", i % 500)).await;
                } else {
                    cache.set(format!("key_{}", i), vec![0u8; 1024]).await;
                }
            }
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// Circuit Breaker Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

fn bench_circuit_breaker_success(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let cb = MockCircuitBreaker::new();
    
    c.bench_function("circuit_breaker_success", |b| {
        b.to_async(&rt).iter(|| async {
            for _ in 0..100 {
                let _ = cb.call(async { Ok::<_, String>(42) }).await;
            }
        });
    });
}

fn bench_circuit_breaker_failure(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let cb = MockCircuitBreaker::new();
    
    c.bench_function("circuit_breaker_failure", |b| {
        b.to_async(&rt).iter(|| async {
            for _ in 0..100 {
                let _ = cb.call(async { Err::<i32, _>("error".to_string()) }).await;
            }
        });
    });
}

fn bench_circuit_breaker_mixed(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let cb = MockCircuitBreaker::new();
    
    c.bench_function("circuit_breaker_mixed_90_10", |b| {
        b.to_async(&rt).iter(|| async {
            // 90% success, 10% failure
            for i in 0..100 {
                if i < 90 {
                    let _ = cb.call(async { Ok::<_, String>(42) }).await;
                } else {
                    let _ = cb.call(async { Err::<i32, _>("error".to_string()) }).await;
                }
            }
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// Streaming Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

fn bench_streaming_batch_processing(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    let mut group = c.benchmark_group("streaming_batch");
    
    for batch_size in [10, 50, 100, 500].iter() {
        group.throughput(Throughput::Elements(*batch_size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(batch_size), batch_size, |b, &batch_size| {
            b.to_async(&rt).iter(|| async move {
                let mut total = 0;
                for _ in 0..10 {
                    // Simulate batch processing
                    let batch: Vec<i32> = (0..batch_size).collect();
                    total += batch.iter().sum::<i32>();
                }
                black_box(total);
            });
        });
    }
    
    group.finish();
}

fn bench_streaming_memory_usage(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    let mut group = c.benchmark_group("streaming_memory");
    
    for item_count in [1000, 10000, 100000].iter() {
        group.throughput(Throughput::Elements(*item_count as u64));
        group.bench_with_input(BenchmarkId::from_parameter(item_count), item_count, |b, &item_count| {
            b.to_async(&rt).iter(|| async move {
                // Simulate streaming with constant memory
                let batch_size = 100;
                let mut processed = 0;
                
                while processed < item_count {
                    let batch: Vec<i32> = (processed..std::cmp::min(processed + batch_size, item_count)).collect();
                    let _sum: i32 = batch.iter().sum();
                    processed += batch_size;
                }
            });
        });
    }
    
    group.finish();
}

// ═════════════════════════════════════════════════════════════════════════════
// Compression Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

fn bench_compression(c: &mut Criterion) {
    let mut group = c.benchmark_group("compression");
    
    for size in [1024, 10240, 102400].iter() {
        let data = vec![0u8; *size];
        
        group.throughput(Throughput::Bytes(*size as u64));
        group.bench_with_input(BenchmarkId::new("compress", size), &data, |b, data| {
            b.iter(|| {
                // Simulate compression
                let compressed = zstd::encode_all(data.as_slice(), 3).unwrap();
                black_box(compressed);
            });
        });
        
        let compressed = zstd::encode_all(data.as_slice(), 3).unwrap();
        group.bench_with_input(BenchmarkId::new("decompress", size), &compressed, |b, compressed| {
            b.iter(|| {
                // Simulate decompression
                let decompressed = zstd::decode_all(compressed.as_slice()).unwrap();
                black_box(decompressed);
            });
        });
    }
    
    group.finish();
}

// ═════════════════════════════════════════════════════════════════════════════
// Concurrent Operations Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

fn bench_concurrent_cache_operations(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    let mut group = c.benchmark_group("concurrent_cache");
    
    for concurrency in [1, 10, 100].iter() {
        group.throughput(Throughput::Elements(*concurrency as u64));
        group.bench_with_input(BenchmarkId::from_parameter(concurrency), concurrency, |b, &concurrency| {
            b.to_async(&rt).iter(|| async move {
                let cache = MockCache::new();
                
                // Pre-populate
                for i in 0..100 {
                    cache.set(format!("key_{}", i), vec![0u8; 1024]).await;
                }
                
                // Concurrent operations
                let mut handles = vec![];
                for i in 0..concurrency {
                    let cache = cache.clone();
                    let handle = tokio::spawn(async move {
                        for j in 0..10 {
                            let key = format!("key_{}", (i * 10 + j) % 100);
                            let _ = cache.get(&key).await;
                        }
                    });
                    handles.push(handle);
                }
                
                for handle in handles {
                    let _ = handle.await;
                }
            });
        });
    }
    
    group.finish();
}

fn bench_concurrent_circuit_breaker(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    let mut group = c.benchmark_group("concurrent_circuit_breaker");
    
    for concurrency in [1, 10, 100].iter() {
        group.throughput(Throughput::Elements(*concurrency as u64));
        group.bench_with_input(BenchmarkId::from_parameter(concurrency), concurrency, |b, &concurrency| {
            b.to_async(&rt).iter(|| async move {
                let cb = MockCircuitBreaker::new();
                
                // Concurrent operations
                let mut handles = vec![];
                for _ in 0..concurrency {
                    let cb_clone = cb.clone();
                    let handle = tokio::spawn(async move {
                        for _ in 0..10 {
                            let _ = cb_clone.call(async { Ok::<_, String>(42) }).await;
                        }
                    });
                    handles.push(handle);
                }
                
                for handle in handles {
                    let _ = handle.await;
                }
            });
        });
    }
    
    group.finish();
}

// ═════════════════════════════════════════════════════════════════════════════
// End-to-End Pipeline Benchmarks
// ═════════════════════════════════════════════════════════════════════════════

fn bench_full_pipeline(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    c.bench_function("full_pipeline_with_cache_and_cb", |b| {
        b.to_async(&rt).iter(|| async {
            let cache = MockCache::new();
            let cb = MockCircuitBreaker::new();
            
            // Simulate full request pipeline
            for i in 0..100 {
                let key = format!("key_{}", i % 10);
                
                // Try cache first
                if let Some(data) = cache.get(&key).await {
                    black_box(data);
                } else {
                    // Cache miss - fetch with circuit breaker
                    let result = cb.call(async {
                        // Simulate database query
                        tokio::time::sleep(Duration::from_micros(100)).await;
                        Ok::<_, String>(vec![0u8; 1024])
                    }).await;
                    
                    if let Ok(data) = result {
                        cache.set(key, data).await;
                    }
                }
            }
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// Benchmark Groups
// ═════════════════════════════════════════════════════════════════════════════

criterion_group!(
    name = cache_benches;
    config = Criterion::default()
        .sample_size(100)
        .measurement_time(Duration::from_secs(10));
    targets = bench_cache_get, bench_cache_set, bench_cache_mixed_workload
);

criterion_group!(
    name = circuit_breaker_benches;
    config = Criterion::default()
        .sample_size(100)
        .measurement_time(Duration::from_secs(10));
    targets = bench_circuit_breaker_success, bench_circuit_breaker_failure, bench_circuit_breaker_mixed
);

criterion_group!(
    name = streaming_benches;
    config = Criterion::default()
        .sample_size(50)
        .measurement_time(Duration::from_secs(10));
    targets = bench_streaming_batch_processing, bench_streaming_memory_usage
);

criterion_group!(
    name = compression_benches;
    config = Criterion::default()
        .sample_size(100)
        .measurement_time(Duration::from_secs(10));
    targets = bench_compression
);

criterion_group!(
    name = concurrent_benches;
    config = Criterion::default()
        .sample_size(50)
        .measurement_time(Duration::from_secs(15));
    targets = bench_concurrent_cache_operations, bench_concurrent_circuit_breaker
);

criterion_group!(
    name = pipeline_benches;
    config = Criterion::default()
        .sample_size(50)
        .measurement_time(Duration::from_secs(15));
    targets = bench_full_pipeline
);

criterion_main!(
    cache_benches,
    circuit_breaker_benches,
    streaming_benches,
    compression_benches,
    concurrent_benches,
    pipeline_benches
);

// Made with Bob

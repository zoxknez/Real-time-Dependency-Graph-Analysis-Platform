//! Shared Metrics Library
//!
//! Provides Prometheus metrics infrastructure for all services
//! in the dependency analytics platform.

use std::time::Instant;

pub use metrics::{counter, gauge, histogram, Counter, Gauge, Histogram};
pub use metrics_exporter_prometheus::{Matcher, PrometheusBuilder, PrometheusHandle};

/// Common metric prefixes for each service
pub mod prefixes {
    pub const API: &str = "api";
    pub const INGESTION: &str = "ingestion";
    pub const ANALYSIS: &str = "analysis";
    pub const GRAPH_WRITER: &str = "graph_writer";
    pub const VECTOR_WRITER: &str = "vector_writer";
    pub const SYNCER: &str = "syncer";
}

/// Standard metric names used across services
pub mod names {
    // Processing metrics
    pub const MESSAGES_RECEIVED: &str = "messages_received_total";
    pub const MESSAGES_PROCESSED: &str = "messages_processed_total";
    pub const MESSAGES_FAILED: &str = "messages_failed_total";
    pub const MESSAGE_PROCESSING_DURATION: &str = "message_processing_duration_seconds";
    
    // Kafka metrics
    pub const KAFKA_CONSUMER_LAG: &str = "kafka_consumer_lag";
    pub const KAFKA_MESSAGES_SENT: &str = "kafka_messages_sent_total";
    pub const KAFKA_SEND_ERRORS: &str = "kafka_send_errors_total";
    
    // Database metrics
    pub const DB_OPERATIONS: &str = "db_operations_total";
    pub const DB_OPERATION_DURATION: &str = "db_operation_duration_seconds";
    pub const DB_ERRORS: &str = "db_errors_total";
    pub const DB_CONNECTIONS: &str = "db_connections";
    
    // Registry/crawler metrics
    pub const REGISTRY_REQUESTS: &str = "registry_requests_total";
    pub const REGISTRY_REQUEST_DURATION: &str = "registry_request_duration_seconds";
    pub const REGISTRY_ERRORS: &str = "registry_errors_total";
    pub const REGISTRY_RATE_LIMITED: &str = "registry_rate_limited_total";
    
    // Analysis metrics
    pub const PACKAGES_ANALYZED: &str = "packages_analyzed_total";
    pub const ANALYSIS_DURATION: &str = "analysis_duration_seconds";
    pub const VECTORS_GENERATED: &str = "vectors_generated_total";
    pub const BREAKING_CHANGES_DETECTED: &str = "breaking_changes_detected_total";
    
    // Graph metrics
    pub const NODES_CREATED: &str = "nodes_created_total";
    pub const EDGES_CREATED: &str = "edges_created_total";
    pub const GRAPH_QUERIES: &str = "graph_queries_total";
    pub const GRAPH_QUERY_DURATION: &str = "graph_query_duration_seconds";
}

/// Configuration for initializing metrics
pub struct MetricsConfig {
    pub service_name: String,
    pub custom_buckets: Vec<(String, Vec<f64>)>,
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            service_name: "unknown".to_string(),
            custom_buckets: vec![],
        }
    }
}

/// Initialize metrics with default histogram buckets
pub fn init_metrics(service_name: &str) -> PrometheusHandle {
    init_metrics_with_config(MetricsConfig {
        service_name: service_name.to_string(),
        ..Default::default()
    })
}

/// Initialize metrics with custom configuration
pub fn init_metrics_with_config(config: MetricsConfig) -> PrometheusHandle {
    let mut builder = PrometheusBuilder::new()
        // Default latency buckets for message processing
        .set_buckets_for_metric(
            Matcher::Suffix(names::MESSAGE_PROCESSING_DURATION.to_string()),
            &[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
        )
        .expect("Failed to set message processing buckets")
        // DB operation buckets
        .set_buckets_for_metric(
            Matcher::Suffix(names::DB_OPERATION_DURATION.to_string()),
            &[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
        )
        .expect("Failed to set DB buckets")
        // Registry request buckets (can be slower due to network)
        .set_buckets_for_metric(
            Matcher::Suffix(names::REGISTRY_REQUEST_DURATION.to_string()),
            &[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
        )
        .expect("Failed to set registry buckets")
        // Analysis duration buckets (can be slow)
        .set_buckets_for_metric(
            Matcher::Suffix(names::ANALYSIS_DURATION.to_string()),
            &[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0],
        )
        .expect("Failed to set analysis buckets");
    
    // Apply custom buckets
    for (metric, buckets) in config.custom_buckets {
        builder = builder
            .set_buckets_for_metric(Matcher::Full(metric), &buckets)
            .expect("Failed to set custom buckets");
    }
    
    builder
        .install_recorder()
        .expect("Failed to install metrics recorder")
}

/// A guard that records duration when dropped
pub struct TimingGuard {
    metric_name: &'static str,
    labels: Vec<(&'static str, String)>,
    start: Instant,
}

impl TimingGuard {
    pub fn new(metric_name: &'static str, labels: Vec<(&'static str, String)>) -> Self {
        Self {
            metric_name,
            labels,
            start: Instant::now(),
        }
    }
}

impl Drop for TimingGuard {
    fn drop(&mut self) {
        let duration = self.start.elapsed().as_secs_f64();
        histogram!(self.metric_name, &self.labels).record(duration);
    }
}

/// Helper macro to create a timing guard
#[macro_export]
macro_rules! time_operation {
    ($metric:expr, $($label:expr => $value:expr),* $(,)?) => {
        $crate::TimingGuard::new($metric, vec![$(($label, $value.to_string())),*])
    };
}

/// Record a message received from Kafka
pub fn record_message_received(service: &str, topic: &str) {
    counter!(
        names::MESSAGES_RECEIVED,
        &[
            ("service", service.to_string()),
            ("topic", topic.to_string())
        ]
    ).increment(1);
}

/// Record a message processed
pub fn record_message_processed(service: &str, topic: &str, success: bool) {
    let metric = if success {
        names::MESSAGES_PROCESSED
    } else {
        names::MESSAGES_FAILED
    };
    
    counter!(
        metric,
        &[
            ("service", service.to_string()),
            ("topic", topic.to_string())
        ]
    ).increment(1);
}

/// Record message processing duration
pub fn record_message_duration(service: &str, topic: &str, duration_secs: f64) {
    histogram!(
        names::MESSAGE_PROCESSING_DURATION,
        &[
            ("service", service.to_string()),
            ("topic", topic.to_string())
        ]
    ).record(duration_secs);
}

/// Record a database operation
pub fn record_db_operation(database: &str, operation: &str, duration_secs: f64, success: bool) {
    counter!(
        names::DB_OPERATIONS,
        &[
            ("database", database.to_string()),
            ("operation", operation.to_string()),
            ("success", success.to_string())
        ]
    ).increment(1);
    
    histogram!(
        names::DB_OPERATION_DURATION,
        &[
            ("database", database.to_string()),
            ("operation", operation.to_string())
        ]
    ).record(duration_secs);
    
    if !success {
        counter!(
            names::DB_ERRORS,
            &[
                ("database", database.to_string()),
                ("operation", operation.to_string())
            ]
        ).increment(1);
    }
}

/// Set the current consumer lag
pub fn set_consumer_lag(service: &str, topic: &str, partition: i32, lag: i64) {
    gauge!(
        names::KAFKA_CONSUMER_LAG,
        &[
            ("service", service.to_string()),
            ("topic", topic.to_string()),
            ("partition", partition.to_string())
        ]
    ).set(lag as f64);
}

/// Record registry request
pub fn record_registry_request(registry: &str, endpoint: &str, status: u16, duration_secs: f64) {
    counter!(
        names::REGISTRY_REQUESTS,
        &[
            ("registry", registry.to_string()),
            ("endpoint", endpoint.to_string()),
            ("status", status.to_string())
        ]
    ).increment(1);
    
    histogram!(
        names::REGISTRY_REQUEST_DURATION,
        &[
            ("registry", registry.to_string()),
            ("endpoint", endpoint.to_string())
        ]
    ).record(duration_secs);
    
    if status == 429 {
        counter!(
            names::REGISTRY_RATE_LIMITED,
            &[("registry", registry.to_string())]
        ).increment(1);
    } else if status >= 400 {
        counter!(
            names::REGISTRY_ERRORS,
            &[
                ("registry", registry.to_string()),
                ("status", status.to_string())
            ]
        ).increment(1);
    }
}

/// Simple HTTP handler for metrics endpoint
pub fn render_metrics(handle: &PrometheusHandle) -> String {
    handle.render()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_timing_guard() {
        // Just ensure it compiles and works
        {
            let _guard = TimingGuard::new("test_metric", vec![("label", "value".to_string())]);
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}

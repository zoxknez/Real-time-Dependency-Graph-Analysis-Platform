//! Prometheus Metrics
//!
//! Provides custom metrics for the API service including:
//! - HTTP request latency and counts
//! - GraphQL query metrics
//! - Database connection pool metrics
//! - Cache hit/miss rates

#![allow(dead_code)]

use axum::{
    body::Body,
    extract::MatchedPath,
    http::{Request, Response},
    middleware::Next,
};
use metrics::{counter, gauge, histogram};
use metrics_exporter_prometheus::{Matcher, PrometheusBuilder, PrometheusHandle};
use std::time::Instant;

/// Metric names as constants
pub mod names {
    pub const HTTP_REQUESTS_TOTAL: &str = "http_requests_total";
    pub const HTTP_REQUEST_DURATION_SECONDS: &str = "http_request_duration_seconds";
    pub const HTTP_REQUESTS_IN_FLIGHT: &str = "http_requests_in_flight";

    pub const GRAPHQL_QUERIES_TOTAL: &str = "graphql_queries_total";
    pub const GRAPHQL_QUERY_DURATION_SECONDS: &str = "graphql_query_duration_seconds";
    pub const GRAPHQL_QUERY_COMPLEXITY: &str = "graphql_query_complexity";
    pub const GRAPHQL_ERRORS_TOTAL: &str = "graphql_errors_total";

    pub const DB_CONNECTIONS_ACTIVE: &str = "db_connections_active";
    pub const DB_QUERY_DURATION_SECONDS: &str = "db_query_duration_seconds";
    pub const DB_ERRORS_TOTAL: &str = "db_errors_total";

    pub const CACHE_HITS_TOTAL: &str = "cache_hits_total";
    pub const CACHE_MISSES_TOTAL: &str = "cache_misses_total";
    pub const CACHE_SIZE_BYTES: &str = "cache_size_bytes";

    pub const KAFKA_MESSAGES_CONSUMED: &str = "kafka_messages_consumed_total";
    pub const KAFKA_CONSUMER_LAG: &str = "kafka_consumer_lag";

    pub const SUBSCRIPTIONS_ACTIVE: &str = "subscriptions_active";
    pub const SUBSCRIPTIONS_TOTAL: &str = "subscriptions_total";

    pub const RATE_LIMIT_HITS_TOTAL: &str = "rate_limit_hits_total";

    pub const IMPACT_CALCULATIONS_TOTAL: &str = "impact_calculations_total";
    pub const IMPACT_CALCULATION_DURATION_SECONDS: &str = "impact_calculation_duration_seconds";

    pub const EMBEDDINGS_REQUESTS_TOTAL: &str = "embeddings_requests_total";
    pub const EMBEDDINGS_REQUEST_DURATION_SECONDS: &str = "embeddings_request_duration_seconds";
    pub const EMBEDDINGS_ERRORS_TOTAL: &str = "embeddings_errors_total";
    pub const EMBEDDINGS_RATE_LIMIT_DELAYS_TOTAL: &str = "embeddings_rate_limit_delays_total";
}

/// Initialize the Prometheus metrics recorder and return a handle for rendering metrics
pub fn init_metrics() -> PrometheusHandle {
    // Define histogram buckets for different use cases
    let builder = PrometheusBuilder::new()
        // HTTP latency buckets (in seconds)
        .set_buckets_for_metric(
            Matcher::Full(names::HTTP_REQUEST_DURATION_SECONDS.to_string()),
            &[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
        )
        .expect("Failed to set HTTP buckets")
        // GraphQL query latency buckets
        .set_buckets_for_metric(
            Matcher::Full(names::GRAPHQL_QUERY_DURATION_SECONDS.to_string()),
            &[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
        )
        .expect("Failed to set GraphQL buckets")
        // DB query latency buckets
        .set_buckets_for_metric(
            Matcher::Full(names::DB_QUERY_DURATION_SECONDS.to_string()),
            &[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
        )
        .expect("Failed to set DB buckets")
        // Impact calculation buckets (can be slow)
        .set_buckets_for_metric(
            Matcher::Full(names::IMPACT_CALCULATION_DURATION_SECONDS.to_string()),
            &[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0],
        )
        .expect("Failed to set impact buckets")
        // Embeddings latency buckets
        .set_buckets_for_metric(
            Matcher::Full(names::EMBEDDINGS_REQUEST_DURATION_SECONDS.to_string()),
            &[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
        )
        .expect("Failed to set embeddings buckets");

    builder
        .install_recorder()
        .expect("Failed to install metrics recorder")
}

/// Metrics layer for HTTP requests
pub async fn metrics_layer(
    matched_path: Option<MatchedPath>,
    req: Request<Body>,
    next: Next,
) -> Response<Body> {
    let path = matched_path
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| req.uri().path().to_string());

    let method = req.method().to_string();

    // Increment in-flight counter
    gauge!(
        names::HTTP_REQUESTS_IN_FLIGHT,
        &[("path", path.clone()), ("method", method.clone())]
    )
    .increment(1.0);

    let start = Instant::now();
    let response = next.run(req).await;
    let duration = start.elapsed();

    // Decrement in-flight counter
    gauge!(
        names::HTTP_REQUESTS_IN_FLIGHT,
        &[("path", path.clone()), ("method", method.clone())]
    )
    .decrement(1.0);

    let status = response.status().as_u16().to_string();

    // Record request count
    counter!(
        names::HTTP_REQUESTS_TOTAL,
        &[
            ("path", path.clone()),
            ("method", method.clone()),
            ("status", status.clone())
        ]
    )
    .increment(1);

    // Record request duration
    histogram!(
        names::HTTP_REQUEST_DURATION_SECONDS,
        &[("path", path), ("method", method), ("status", status)]
    )
    .record(duration.as_secs_f64());

    response
}

/// Record a GraphQL query execution
pub fn record_graphql_query(
    operation_name: Option<&str>,
    operation_type: &str,
    complexity: u64,
    duration_secs: f64,
    has_errors: bool,
) {
    let op_name = operation_name.unwrap_or("anonymous");

    counter!(
        names::GRAPHQL_QUERIES_TOTAL,
        &[
            ("operation_name", op_name.to_string()),
            ("operation_type", operation_type.to_string())
        ]
    )
    .increment(1);

    histogram!(
        names::GRAPHQL_QUERY_DURATION_SECONDS,
        &[
            ("operation_name", op_name.to_string()),
            ("operation_type", operation_type.to_string())
        ]
    )
    .record(duration_secs);

    histogram!(
        names::GRAPHQL_QUERY_COMPLEXITY,
        &[("operation_name", op_name.to_string())]
    )
    .record(complexity as f64);

    if has_errors {
        counter!(
            names::GRAPHQL_ERRORS_TOTAL,
            &[("operation_name", op_name.to_string())]
        )
        .increment(1);
    }
}

/// Record a database query
pub fn record_db_query(database: &str, operation: &str, duration_secs: f64, success: bool) {
    histogram!(
        names::DB_QUERY_DURATION_SECONDS,
        &[
            ("database", database.to_string()),
            ("operation", operation.to_string())
        ]
    )
    .record(duration_secs);

    if !success {
        counter!(
            names::DB_ERRORS_TOTAL,
            &[
                ("database", database.to_string()),
                ("operation", operation.to_string())
            ]
        )
        .increment(1);
    }
}

/// Record cache access
pub fn record_cache_access(cache_name: &str, hit: bool) {
    if hit {
        counter!(
            names::CACHE_HITS_TOTAL,
            &[("cache", cache_name.to_string())]
        )
        .increment(1);
    } else {
        counter!(
            names::CACHE_MISSES_TOTAL,
            &[("cache", cache_name.to_string())]
        )
        .increment(1);
    }
}

/// Update active connections gauge
pub fn set_active_connections(database: &str, count: f64) {
    gauge!(
        names::DB_CONNECTIONS_ACTIVE,
        &[("database", database.to_string())]
    )
    .set(count);
}

/// Record Kafka message consumption
pub fn record_kafka_message(topic: &str, partition: i32) {
    counter!(
        names::KAFKA_MESSAGES_CONSUMED,
        &[
            ("topic", topic.to_string()),
            ("partition", partition.to_string())
        ]
    )
    .increment(1);
}

/// Update Kafka consumer lag
pub fn set_kafka_lag(topic: &str, partition: i32, lag: i64) {
    gauge!(
        names::KAFKA_CONSUMER_LAG,
        &[
            ("topic", topic.to_string()),
            ("partition", partition.to_string())
        ]
    )
    .set(lag as f64);
}

/// Record subscription activity
pub fn record_subscription_opened(subscription_type: &str) {
    counter!(
        names::SUBSCRIPTIONS_TOTAL,
        &[("type", subscription_type.to_string())]
    )
    .increment(1);

    gauge!(
        names::SUBSCRIPTIONS_ACTIVE,
        &[("type", subscription_type.to_string())]
    )
    .increment(1.0);
}

/// Record subscription closed
pub fn record_subscription_closed(subscription_type: &str) {
    gauge!(
        names::SUBSCRIPTIONS_ACTIVE,
        &[("type", subscription_type.to_string())]
    )
    .decrement(1.0);
}

/// Record rate limit hit
pub fn record_rate_limit_hit(endpoint: &str, tier: &str) {
    counter!(
        names::RATE_LIMIT_HITS_TOTAL,
        &[
            ("endpoint", endpoint.to_string()),
            ("tier", tier.to_string())
        ]
    )
    .increment(1);
}

/// Record impact radius calculation
pub fn record_impact_calculation(depth: u8, duration_secs: f64, _packages_impacted: u64) {
    counter!(
        names::IMPACT_CALCULATIONS_TOTAL,
        &[("depth", depth.to_string())]
    )
    .increment(1);

    histogram!(
        names::IMPACT_CALCULATION_DURATION_SECONDS,
        &[("depth", depth.to_string())]
    )
    .record(duration_secs);
}

/// Metrics endpoint handler that renders all metrics in Prometheus format
pub async fn metrics_handler(handle: axum::Extension<PrometheusHandle>) -> String {
    handle.render()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metric_names_are_valid() {
        // Prometheus metric names must match [a-zA-Z_:][a-zA-Z0-9_:]*
        let names = vec![
            names::HTTP_REQUESTS_TOTAL,
            names::HTTP_REQUEST_DURATION_SECONDS,
            names::GRAPHQL_QUERIES_TOTAL,
            names::DB_QUERY_DURATION_SECONDS,
            names::CACHE_HITS_TOTAL,
        ];

        for name in names {
            assert!(
                name.chars().next().unwrap().is_alphabetic() || name.starts_with('_'),
                "Metric name must start with letter or underscore: {}",
                name
            );
            assert!(
                name.chars()
                    .all(|c| c.is_alphanumeric() || c == '_' || c == ':'),
                "Metric name contains invalid character: {}",
                name
            );
        }
    }
}

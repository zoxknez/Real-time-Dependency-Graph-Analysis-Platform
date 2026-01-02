//! GraphQL Schema builder with complexity limits

use anyhow::Result;
use async_graphql::{EmptyMutation, Schema};
use tokio::sync::broadcast;
use tracing::{info, warn};
use std::time::Duration;

use crate::cache::CacheClient;
use crate::config::Config;
use crate::graph::GraphClient;
use crate::gql::context::GqlContext;
use crate::gql::query::QueryRoot;
use crate::gql::subscription::SubscriptionRoot;
use crate::gql::types::VersionEvent;

/// The complete GraphQL schema type
pub type ApiSchema = Schema<QueryRoot, EmptyMutation, SubscriptionRoot>;

/// Build the GraphQL schema with all dependencies
pub async fn build_schema(config: &Config) -> Result<(ApiSchema, broadcast::Sender<VersionEvent>, GraphClient, Option<CacheClient>)> {
    info!("Building GraphQL schema...");

    // Connect to Memgraph
    let graph = GraphClient::connect(&config.memgraph).await?;

    // Connect to Redis with timeout (optional - graceful degradation)
    let cache = match tokio::time::timeout(
        Duration::from_secs(3),
        CacheClient::connect(&config.redis)
    ).await {
        Ok(Ok(client)) => {
            info!("Redis cache enabled");
            Some(client)
        }
        Ok(Err(e)) => {
            warn!("Redis connection failed, caching disabled: {}", e);
            None
        }
        Err(_) => {
            warn!("Redis connection timeout (3s), caching disabled");
            None
        }
    };

    // Create broadcast channel for subscriptions (buffer 1000 events)
    let (event_tx, _) = broadcast::channel::<VersionEvent>(1000);

    // Create GraphQL context
    let ctx = GqlContext::new(
        graph.clone(),
        cache.clone(),
        config.guardrails.clone(),
        event_tx.clone(),
    );

    // Build schema with complexity limits
    let schema = Schema::build(QueryRoot, EmptyMutation, SubscriptionRoot)
        .data(ctx)
        .limit_complexity(config.guardrails.max_complexity)
        .limit_depth(12) // Hard limit on query nesting
        .finish();

    info!(
        max_complexity = config.guardrails.max_complexity,
        max_depth = 12,
        "GraphQL schema built successfully"
    );

    Ok((schema, event_tx, graph, cache))
}

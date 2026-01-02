//! GraphQL Schema builder with complexity limits

use anyhow::Result;
use async_graphql::{EmptyMutation, Schema};
use std::sync::Arc;
use tracing::{info, warn};
use std::time::Duration;

use crate::cache::CacheClient;
use crate::config::Config;
use crate::graph::GraphClient;
use crate::gql::context::{GqlContext, EventChannels};
use crate::gql::query::QueryRoot;
use crate::gql::subscription::SubscriptionRoot;

/// The complete GraphQL schema type
pub type ApiSchema = Schema<QueryRoot, EmptyMutation, SubscriptionRoot>;

/// Build the GraphQL schema with all dependencies
pub async fn build_schema(config: &Config) -> Result<(ApiSchema, Arc<EventChannels>, GraphClient, Option<CacheClient>)> {
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

    // Create event channels for subscriptions (buffer 1024 events per channel)
    let channels = Arc::new(EventChannels::new(1024));

    // Create GraphQL context with all event channels
    let ctx = GqlContext::with_channels(
        graph.clone(),
        cache.clone(),
        config.guardrails.clone(),
        channels.clone(),
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
        subscription_channels = 4,
        "GraphQL schema built successfully"
    );

    Ok((schema, channels, graph, cache))
}

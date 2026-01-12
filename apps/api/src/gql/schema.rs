//! GraphQL Schema builder with complexity limits

use anyhow::Result;
use async_graphql::{EmptyMutation, Schema};
use std::sync::Arc;
use tracing::{info, warn};
use std::time::Duration;

use crate::cache::CacheClient;
use crate::config::Config;
use crate::embeddings::EmbeddingGenerator;
use crate::graph::GraphClient;
use crate::gql::context::{GqlContext, EventChannels, SemanticSearchContext};
use crate::gql::query::QueryRoot;
use crate::gql::subscription::SubscriptionRoot;
use crate::services::gemini::GeminiService;

use qdrant_client::Qdrant;

/// The complete GraphQL schema type
pub type ApiSchema = Schema<QueryRoot, EmptyMutation, SubscriptionRoot>;

/// Build the GraphQL schema with all dependencies
pub async fn build_schema(config: &Config) -> Result<(ApiSchema, Arc<EventChannels>, GraphClient, Option<CacheClient>)> {
    println!("DEBUG: Building GraphQL schema...");
    info!("Building GraphQL schema...");

    // Connect to Memgraph (Required)
    info!("Connecting to Memgraph at {}...", config.memgraph.uri);
    let graph = match tokio::time::timeout(Duration::from_secs(5), GraphClient::connect(&config.memgraph)).await {
        Ok(res) => res?,
        Err(_) => anyhow::bail!("Timed out connecting to Memgraph at {}", config.memgraph.uri),
    };
    println!("DEBUG: Connected to Memgraph successfully");
    info!("Connected to Memgraph successfully");

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

    // Optional semantic search context (Qdrant + embedder)
    let semantic_search = if config.qdrant.enabled {
        if config.qdrant.dimension != config.embedding.dimension {
            warn!(
                qdrant_dimension = config.qdrant.dimension,
                embedding_dimension = config.embedding.dimension,
                "Qdrant and embedding dimensions differ; semantic search may fail"
            );
        }

        let embedder = match EmbeddingGenerator::new(&config.embedding).await {
            Ok(e) => Some(Arc::new(e)),
            Err(e) => {
                warn!(error = %e, "Embedding generator init failed; semantic search disabled");
                None
            }
        };

        if let Some(embedder) = embedder {
            match tokio::time::timeout(Duration::from_secs(3), async {
                Qdrant::from_url(&config.qdrant.url).build()
            })
            .await
            {
                Ok(Ok(client)) => {
                    info!(url = %config.qdrant.url, collection = %config.qdrant.collection, "Qdrant enabled for semantic search");
                    Some(SemanticSearchContext {
                        qdrant: Arc::new(client),
                        collection: config.qdrant.collection.clone(),
                        embedder,
                    })
                }
                Ok(Err(e)) => {
                    warn!(error = %e, "Qdrant client init failed; semantic search disabled");
                    None
                }
                Err(_) => {
                    warn!("Qdrant init timeout (3s); semantic search disabled");
                    None
                }
            }
        } else {
            None
        }
    } else {
        None
    };



    // Initialize Gemini Service
    let gemini = if !config.gemini.api_key.is_empty() {
        info!("Gemini service enabled");
        Some(Arc::new(GeminiService::new(
            config.gemini.api_key.clone(),
            config.gemini.flash_model.clone(),
            config.gemini.thinking_model.clone(),
        )))
    } else {
        warn!("Gemini API key missing; Gemini service disabled");
        None
    };

    // Create GraphQL context with all event channels
    let ctx = GqlContext::with_channels(
        graph.clone(),
        cache.clone(),
        config.guardrails.clone(),
        channels.clone(),
        semantic_search,
        gemini,
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

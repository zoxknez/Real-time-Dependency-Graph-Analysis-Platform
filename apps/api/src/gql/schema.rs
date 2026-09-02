//! GraphQL Schema builder with security limits and production hardening

use anyhow::Result;
use async_graphql::{EmptyMutation, Schema, extensions::Analyzer};
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

use crate::cache::CacheClient;
use crate::config::Config;
use crate::embeddings::EmbeddingGenerator;
use crate::gql::context::{EventChannels, GqlContext, SemanticSearchContext};
use crate::gql::query::QueryRoot;
use crate::gql::subscription::SubscriptionRoot;
use crate::graph::GraphClient;
use crate::services::gemini::GeminiService;

use storage::qdrant::{QdrantClient, QdrantConfig};

/// The complete GraphQL schema type
pub type ApiSchema = Schema<QueryRoot, EmptyMutation, SubscriptionRoot>;

/// Build the GraphQL schema with all dependencies
pub async fn build_schema(
    config: &Config,
) -> Result<(
    ApiSchema,
    Arc<EventChannels>,
    GraphClient,
    Option<CacheClient>,
)> {
    info!("Building GraphQL schema...");

    // Connect to Memgraph (Required)
    info!("Connecting to Memgraph at {}...", config.memgraph.uri);
    let graph =
        match tokio::time::timeout(Duration::from_secs(5), GraphClient::connect(config)).await {
            Ok(res) => res?,
            Err(_) => anyhow::bail!(
                "Timed out connecting to Memgraph at {}",
                config.memgraph.uri
            ),
        };
    info!("Connected to Memgraph successfully");

    // Connect to Redis with timeout (optional - graceful degradation)
    let cache =
        match tokio::time::timeout(Duration::from_secs(3), CacheClient::connect(&config.redis))
            .await
        {
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

        let embedder = match EmbeddingGenerator::new_with_tei(&config.embedding, None).await {
            Ok(e) => Some(Arc::new(e)),
            Err(e) => {
                warn!(error = %e, "Embedding generator init failed; semantic search disabled");
                None
            }
        };

        if let Some(embedder) = embedder {
            let qdrant_config = QdrantConfig {
                url: config.qdrant.url.clone(),
                api_key: config.qdrant.api_key.clone(),
                collection: config.qdrant.collection.clone(),
                dimension: config.qdrant.dimension as u64,
                timeout: std::time::Duration::from_secs(30),
                batch_size: 100,
                max_retries: 3,
            };

            match tokio::time::timeout(Duration::from_secs(3), QdrantClient::new(qdrant_config))
                .await
            {
                Ok(Ok(client)) => {
                    info!(url = %config.qdrant.url, collection = %config.qdrant.collection, "Qdrant enabled for semantic search");
                    Some(SemanticSearchContext {
                        qdrant: Arc::new(client),
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

    // Get limits from config (already adjusted for environment)
    let max_depth = config.guardrails.max_depth;
    let max_complexity = config.guardrails.max_complexity;
    let is_production = config.environment.is_production();

    // Build schema with security limits
    let mut schema_builder = Schema::build(QueryRoot, EmptyMutation, SubscriptionRoot)
        .data(ctx)
        .extension(Analyzer) // Logs query complexity
        .limit_complexity(max_complexity)
        .limit_depth(max_depth);

    // Disable introspection in production for security
    if is_production {
        info!("🔒 GraphQL introspection DISABLED (production mode)");
        schema_builder = schema_builder.disable_introspection();
    } else {
        info!("📖 GraphQL introspection enabled (development mode)");
    }

    let schema = schema_builder.finish();

    info!(
        max_complexity = max_complexity,
        max_depth = max_depth,
        introspection = !is_production,
        subscription_channels = 4,
        "GraphQL schema built successfully with security limits"
    );

    Ok((schema, channels, graph, cache))
}

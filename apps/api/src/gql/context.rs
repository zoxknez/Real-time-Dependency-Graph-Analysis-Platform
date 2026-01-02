//! GraphQL Context - shared state for resolvers

use std::sync::Arc;
use tokio::sync::broadcast;

use crate::cache::CacheClient;
use crate::config::GuardrailsConfig;
use crate::graph::GraphClient;
use crate::gql::loaders::PackageLoader;
use crate::gql::types::VersionEvent;

/// Context passed to all GraphQL resolvers
pub struct GqlContext {
    /// Memgraph client for graph queries
    pub graph: GraphClient,
    /// Redis cache client (optional - graceful degradation)
    pub cache: Option<Arc<CacheClient>>,
    /// DataLoader for batch package fetching
    pub package_loader: PackageLoader,
    /// Guardrails configuration
    pub guardrails: GuardrailsConfig,
    /// Broadcast channel for subscription events
    pub event_tx: Arc<broadcast::Sender<VersionEvent>>,
}

impl GqlContext {
    pub fn new(
        graph: GraphClient,
        cache: Option<CacheClient>,
        guardrails: GuardrailsConfig,
        event_tx: broadcast::Sender<VersionEvent>,
    ) -> Self {
        let package_loader = PackageLoader::new(graph.clone());
        
        Self {
            graph,
            cache: cache.map(Arc::new),
            package_loader,
            guardrails,
            event_tx: Arc::new(event_tx),
        }
    }
}


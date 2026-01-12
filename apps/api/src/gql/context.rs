//! GraphQL Context - shared state for resolvers

#![allow(dead_code)]

use std::sync::Arc;
use tokio::sync::broadcast;
use std::sync::atomic::{AtomicUsize, Ordering};

use crate::cache::CacheClient;
use crate::config::GuardrailsConfig;
use crate::graph::GraphClient;
use crate::embeddings::EmbeddingGenerator;
use crate::gql::loaders::PackageLoader;
use crate::gql::types::{VersionEvent, BreakingChangeEvent, LiveStatsEvent, DependencyImpactEvent};
use crate::services::gemini::GeminiService;

use storage::qdrant::QdrantClient;

/// Broadcast channels for different event types
pub struct EventChannels {
    /// New version events
    pub version_tx: broadcast::Sender<VersionEvent>,
    /// Breaking change detection events
    pub breaking_change_tx: broadcast::Sender<BreakingChangeEvent>,
    /// Live statistics updates
    pub live_stats_tx: broadcast::Sender<LiveStatsEvent>,
    /// Dependency impact events
    pub dependency_impact_tx: broadcast::Sender<DependencyImpactEvent>,
    /// Active subscription counter
    pub active_subscriptions: AtomicUsize,
}

pub struct SubscriptionGuard {
    channels: Arc<EventChannels>,
}

impl Drop for SubscriptionGuard {
    fn drop(&mut self) {
        self.channels.active_subscriptions.fetch_sub(1, Ordering::Relaxed);
    }
}

impl EventChannels {
    pub fn new(channel_capacity: usize) -> Self {
        Self {
            version_tx: broadcast::channel(channel_capacity).0,
            breaking_change_tx: broadcast::channel(channel_capacity).0,
            live_stats_tx: broadcast::channel(channel_capacity).0,
            dependency_impact_tx: broadcast::channel(channel_capacity).0,
            active_subscriptions: AtomicUsize::new(0),
        }
    }
    
    pub fn track_subscription(self: &Arc<Self>) -> SubscriptionGuard {
        self.active_subscriptions.fetch_add(1, Ordering::Relaxed);
        SubscriptionGuard {
            channels: self.clone(),
        }
    }
    
    pub fn subscription_count(&self) -> usize {
        self.active_subscriptions.load(Ordering::Relaxed)
    }
}

/// Resources needed for semantic search.
#[derive(Clone)]
pub struct SemanticSearchContext {
    pub qdrant: Arc<QdrantClient>,
    pub embedder: Arc<EmbeddingGenerator>,
}

/// Context passed to all GraphQL resolvers
pub struct GqlContext {
    /// Memgraph client for graph queries
    pub graph: GraphClient,
    /// Redis cache client (optional - graceful degradation)
    #[allow(dead_code)]
    pub cache: Option<Arc<CacheClient>>,
    /// DataLoader for batch package fetching
    pub package_loader: PackageLoader,
    /// Guardrails configuration
    pub guardrails: GuardrailsConfig,
    /// Broadcast channel for subscription events (legacy - for compatibility)
    pub event_tx: Arc<broadcast::Sender<VersionEvent>>,
    /// All event channels
    pub channels: Arc<EventChannels>,

    /// Optional semantic search context
    pub semantic_search: Option<SemanticSearchContext>,
    /// Gemini AI service (for thinking/generation)
    pub gemini: Option<Arc<GeminiService>>,
}

impl GqlContext {
    pub fn new(
        graph: GraphClient,
        cache: Option<CacheClient>,
        guardrails: GuardrailsConfig,
        event_tx: broadcast::Sender<VersionEvent>,
    ) -> Self {
        let package_loader = PackageLoader::new(graph.clone());
        let channels = EventChannels::new(1024);
        
        Self {
            graph,
            cache: cache.map(Arc::new),
            package_loader,
            guardrails,
            event_tx: Arc::new(event_tx),
            channels: Arc::new(channels),
            semantic_search: None,
            gemini: None,
        }
    }
    
    pub fn with_channels(
        graph: GraphClient,
        cache: Option<CacheClient>,
        guardrails: GuardrailsConfig,
        channels: Arc<EventChannels>,
        semantic_search: Option<SemanticSearchContext>,
        gemini: Option<Arc<GeminiService>>,
    ) -> Self {
        let package_loader = PackageLoader::new(graph.clone());
        // Create version_tx from channels for backwards compatibility
        let event_tx = channels.version_tx.clone();
        
        Self {
            graph,
            cache: cache.map(Arc::new),
            package_loader,
            guardrails,
            event_tx: Arc::new(event_tx),
            channels,
            semantic_search,
            gemini,
        }
    }
}


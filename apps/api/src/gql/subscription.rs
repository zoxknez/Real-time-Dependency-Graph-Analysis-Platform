//! GraphQL Subscriptions - real-time events for enterprise dependency intelligence
//!
//! Consumes Kafka events and broadcasts to connected clients.
//! Supports multiple event types:
//! - Version updates (new package versions)
//! - Breaking change detection
//! - Live statistics
//! - Dependency impact analysis

use async_graphql::{Context, Subscription, Result, ID};
use futures::Stream;
use tokio_stream::StreamExt;
use tracing::{debug, info};
use std::sync::Arc;

use crate::gql::context::GqlContext;
use crate::gql::types::{
    Ecosystem, VersionEvent, BreakingChangeEvent, LiveStatsEvent, 
    DependencyImpactEvent, BreakingSeverity,
};


pub struct SubscriptionRoot;

#[Subscription]
impl SubscriptionRoot {
    /// Subscribe to new version events
    ///
    /// # Arguments
    /// * `ecosystem` - Filter by ecosystem (NPM, PYPI, CARGO, etc.)
    /// * `package_id` - Filter by specific package ID
    ///
    /// Returns a stream of VersionEvent when new versions are published
    async fn new_version(
        &self,
        ctx: &Context<'_>,
        ecosystem: Option<Ecosystem>,
        package_id: Option<ID>,
    ) -> Result<impl Stream<Item = VersionEvent>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        
        let rx = gql_ctx.channels.version_tx.subscribe();
        let guard = Arc::new(gql_ctx.channels.track_subscription());

        info!(
            ecosystem = ?ecosystem,
            package_id = package_id.as_ref().map(|id| id.as_str()),
            active_subscriptions = gql_ctx.channels.subscription_count(),
            "Client subscribed to newVersion events"
        );

        let stream = tokio_stream::wrappers::BroadcastStream::new(rx);
        
        let filtered = stream.filter_map(move |result| {
            let _guard = guard.clone(); // Keep guard alive
            match result {
                Ok(event) => {
                    let ecosystem_match = ecosystem
                        .map(|e| event.package.ecosystem == e)
                        .unwrap_or(true);
                    
                    let package_match = package_id
                        .as_ref()
                        .map(|id| event.package.id.as_str() == id.as_str())
                        .unwrap_or(true);

                    if ecosystem_match && package_match {
                        Some(event)
                    } else {
                        None
                    }
                }
                Err(_) => None,
            }
        });

        Ok(filtered)
    }

    /// Subscribe to breaking change detection events
    ///
    /// # Arguments
    /// * `ecosystem` - Filter by ecosystem
    /// * `package_id` - Filter by specific package ID
    /// * `min_severity` - Minimum severity level to receive (defaults to LOW)
    ///
    /// Returns a stream of BreakingChangeEvent when breaking changes are detected
    async fn breaking_change_detected(
        &self,
        ctx: &Context<'_>,
        ecosystem: Option<Ecosystem>,
        package_id: Option<ID>,
        min_severity: Option<BreakingSeverity>,
    ) -> Result<impl Stream<Item = BreakingChangeEvent>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        
        let rx = gql_ctx.channels.breaking_change_tx.subscribe();
        let min_sev = min_severity.unwrap_or(BreakingSeverity::Low);
        let guard = Arc::new(gql_ctx.channels.track_subscription());

        info!(
            ecosystem = ?ecosystem,
            package_id = package_id.as_ref().map(|id| id.as_str()),
            min_severity = ?min_sev,
            "Client subscribed to breakingChangeDetected events"
        );

        let stream = tokio_stream::wrappers::BroadcastStream::new(rx);
        
        let filtered = stream.filter_map(move |result| {
            let _guard = guard.clone();
            match result {
                Ok(event) => {
                    let ecosystem_match = ecosystem
                        .map(|e| event.package.ecosystem == e)
                        .unwrap_or(true);
                    
                    let package_match = package_id
                        .as_ref()
                        .map(|id| event.package.id.as_str() == id.as_str())
                        .unwrap_or(true);
                    
                    let severity_match = severity_gte(event.severity, min_sev);

                    if ecosystem_match && package_match && severity_match {
                        Some(event)
                    } else {
                        None
                    }
                }
                Err(_) => None,
            }
        });

        Ok(filtered)
    }

    /// Subscribe to live platform statistics
    ///
    /// # Arguments
    /// * `interval_ms` - Minimum interval between updates (default 5000ms)
    ///
    /// Returns a stream of LiveStatsEvent with current platform metrics
    async fn live_stats(
        &self,
        ctx: &Context<'_>,
        #[graphql(default = 5000)] interval_ms: i32,
    ) -> Result<impl Stream<Item = LiveStatsEvent>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        
        let rx = gql_ctx.channels.live_stats_tx.subscribe();
        let min_interval = std::time::Duration::from_millis(interval_ms.max(1000) as u64);
        let guard = Arc::new(gql_ctx.channels.track_subscription());

        debug!(
            interval_ms = interval_ms,
            "Client subscribed to liveStats events"
        );

        let stream = tokio_stream::wrappers::BroadcastStream::new(rx);
        
        // Throttle updates based on requested interval
        let throttled = stream
            .filter_map(move |result| {
                let _guard = guard.clone();
                result.ok()
            })
            .throttle(min_interval);

        Ok(throttled)
    }

    /// Subscribe to high-impact dependency events
    ///
    /// When a widely-used package releases a new version, this subscription
    /// notifies about potential downstream impact.
    ///
    /// # Arguments
    /// * `ecosystem` - Filter by ecosystem
    /// * `min_impact_score` - Minimum impact score (0.0 to 1.0, default 0.5)
    ///
    /// Returns a stream of DependencyImpactEvent for high-impact changes
    async fn dependency_impact(
        &self,
        ctx: &Context<'_>,
        ecosystem: Option<Ecosystem>,
        #[graphql(default = 0.5)] min_impact_score: f64,
    ) -> Result<impl Stream<Item = DependencyImpactEvent>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        
        let rx = gql_ctx.channels.dependency_impact_tx.subscribe();
        let guard = Arc::new(gql_ctx.channels.track_subscription());

        info!(
            ecosystem = ?ecosystem,
            min_impact_score = min_impact_score,
            "Client subscribed to dependencyImpact events"
        );

        let stream = tokio_stream::wrappers::BroadcastStream::new(rx);
        
        let filtered = stream.filter_map(move |result| {
            let _guard = guard.clone();
            match result {
                Ok(event) => {
                    let ecosystem_match = ecosystem
                        .map(|e| event.package.ecosystem == e)
                        .unwrap_or(true);
                    
                    let impact_match = event.impact_score >= min_impact_score;

                    if ecosystem_match && impact_match {
                        Some(event)
                    } else {
                        None
                    }
                }
                Err(_) => None,
            }
        });

        Ok(filtered)
    }

    /// Subscribe to all events for a specific package
    ///
    /// Unified subscription for all events related to a package.
    /// This is useful for monitoring a specific package without multiple subscriptions.
    ///
    /// # Arguments
    /// * `package_id` - The package ID to monitor (required)
    ///
    /// Returns a merged stream of all event types for the package
    async fn package_events(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
    ) -> Result<impl Stream<Item = VersionEvent>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        
        let rx = gql_ctx.channels.version_tx.subscribe();
        let target_id = package_id.to_string();
        let guard = Arc::new(gql_ctx.channels.track_subscription());

        info!(
            package_id = %target_id,
            "Client subscribed to all events for package"
        );

        let stream = tokio_stream::wrappers::BroadcastStream::new(rx);
        
        let filtered = stream.filter_map(move |result| {
            let _guard = guard.clone();
            match result {
                Ok(event) if event.package.id.as_str() == target_id => Some(event),
                _ => None,
            }
        });

        Ok(filtered)
    }
}

/// Compare severity levels
fn severity_gte(a: BreakingSeverity, b: BreakingSeverity) -> bool {
    severity_to_int(a) >= severity_to_int(b)
}

fn severity_to_int(s: BreakingSeverity) -> i32 {
    match s {
        BreakingSeverity::Low => 0,
        BreakingSeverity::Medium => 1,
        BreakingSeverity::High => 2,
        BreakingSeverity::Critical => 3,
    }
}

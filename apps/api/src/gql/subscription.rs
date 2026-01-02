//! GraphQL Subscriptions - real-time events for new versions
//!
//! Consumes Kafka events and broadcasts to connected clients

use async_graphql::{Context, Subscription, Result, ID};
use futures::Stream;
use tokio_stream::StreamExt;
use tracing::debug;

use crate::gql::context::GqlContext;
use crate::gql::types::{Ecosystem, VersionEvent};

pub struct SubscriptionRoot;

#[Subscription]
impl SubscriptionRoot {
    /// Subscribe to new version events
    ///
    /// # Arguments
    /// * `ecosystem` - Filter by ecosystem (e.g., "NPM")
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
        
        // Subscribe to the broadcast channel
        let rx = gql_ctx.event_tx.subscribe();

        debug!(
            ecosystem = ?ecosystem,
            package_id = package_id.as_ref().map(|id| id.as_str()),
            "Client subscribed to newVersion events"
        );

        // Wrap in tokio_stream and filter
        let stream = tokio_stream::wrappers::BroadcastStream::new(rx);
        
        // Filter based on criteria
        let filtered = stream.filter_map(move |result| {
            match result {
                Ok(event) => {
                    // Apply filters
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
                Err(_) => None, // Skip lagged messages
            }
        });

        Ok(filtered)
    }
}

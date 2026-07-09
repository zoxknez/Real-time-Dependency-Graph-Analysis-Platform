use anyhow::{Context, Result};
use prost::Message;
use tracing::{debug, instrument};

use crate::graph::{DEFAULT_TENANT_ID, GraphQueries, MemgraphClient};
use crate::proto_gen::domain::package::v1::VersionYanked;

/// Handle VersionYanked event
///
/// Sets yanked=true on the Version node
#[instrument(skip_all, fields(event_id))]
pub async fn handle_version_yanked(client: &MemgraphClient, payload: &[u8]) -> Result<()> {
    // Decode protobuf message
    let event =
        VersionYanked::decode(payload).context("Failed to decode VersionYanked protobuf")?;

    let event_id = event
        .meta
        .as_ref()
        .map(|m| m.event_id.as_str())
        .unwrap_or("unknown");

    tracing::Span::current().record("event_id", event_id);

    debug!(
        ecosystem = %event.ecosystem,
        package = %event.package_name,
        version = %event.version,
        reason = %event.reason,
        "Processing VersionYanked event"
    );

    // Build and execute query
    let query = GraphQueries::version_yanked(
        DEFAULT_TENANT_ID,
        &event.ecosystem,
        &event.package_name,
        &event.version,
    );

    client.run(query).await?;

    debug!(
        version_id = %GraphQueries::version_id(&event.ecosystem, &event.package_name, &event.version),
        "VersionYanked processed successfully"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_version_yanked() {
        let event = VersionYanked {
            meta: None,
            ecosystem: "npm".to_string(),
            package_name: "test-pkg".to_string(),
            version: "1.0.0".to_string(),
            reason: "unpublished".to_string(),
            yanked_at: None,
        };

        let encoded = event.encode_to_vec();
        let decoded = VersionYanked::decode(encoded.as_slice()).unwrap();

        assert_eq!(decoded.package_name, "test-pkg");
        assert_eq!(decoded.reason, "unpublished");
    }
}

use anyhow::{Context, Result};
use prost::Message;
use tracing::{debug, instrument};

use crate::graph::{DEFAULT_TENANT_ID, GraphQueries, MemgraphClient};
use crate::proto_gen::domain::package::v1::PackageDeleted;

/// Handle PackageDeleted event
///
/// Soft-deletes the Package node by setting deleted_at timestamp
#[instrument(skip_all, fields(event_id))]
pub async fn handle_package_deleted(client: &MemgraphClient, payload: &[u8]) -> Result<()> {
    // Decode protobuf message
    let event =
        PackageDeleted::decode(payload).context("Failed to decode PackageDeleted protobuf")?;

    let event_id = event
        .meta
        .as_ref()
        .map(|m| m.event_id.as_str())
        .unwrap_or("unknown");

    tracing::Span::current().record("event_id", event_id);

    debug!(
        ecosystem = %event.ecosystem,
        package = %event.package_name,
        reason = %event.reason,
        "Processing PackageDeleted event"
    );

    // Build and execute query
    let query =
        GraphQueries::package_deleted(DEFAULT_TENANT_ID, &event.ecosystem, &event.package_name);

    client.run(query).await?;

    debug!(
        package_id = %GraphQueries::package_id(&event.ecosystem, &event.package_name),
        "PackageDeleted processed successfully"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_package_deleted() {
        let event = PackageDeleted {
            meta: None,
            ecosystem: "npm".to_string(),
            package_name: "deleted-pkg".to_string(),
            reason: "registry_purge".to_string(),
            deleted_at: None,
            last_version: "1.0.0".to_string(),
        };

        let encoded = event.encode_to_vec();
        let decoded = PackageDeleted::decode(encoded.as_slice()).unwrap();

        assert_eq!(decoded.package_name, "deleted-pkg");
        assert_eq!(decoded.reason, "registry_purge");
    }
}

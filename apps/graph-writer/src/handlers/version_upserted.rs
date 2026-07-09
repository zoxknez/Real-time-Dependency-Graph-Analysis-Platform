use anyhow::{Context, Result};
use prost::Message;
use tracing::{debug, instrument};

use crate::graph::{DEFAULT_TENANT_ID, GraphQueries, MemgraphClient};
use crate::proto_gen::domain::package::v1::VersionUpserted;

/// Handle VersionUpserted event
///
/// Creates/updates Package node, Version node, and DEPENDS_ON edges
#[instrument(skip_all, fields(event_id))]
pub async fn handle_version_upserted(client: &MemgraphClient, payload: &[u8]) -> Result<()> {
    // Decode protobuf message
    let event =
        VersionUpserted::decode(payload).context("Failed to decode VersionUpserted protobuf")?;

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
        deps_count = event.dependencies.len(),
        "Processing VersionUpserted event"
    );

    // Extract timestamp from protobuf
    let published_at = event
        .published_at
        .as_ref()
        .map(|ts| ts.seconds * 1000 + (ts.nanos / 1_000_000) as i64);

    // Convert dependencies to our format (dep_ecosystem, dep_name, version_req)
    // Since we're consuming npm events, dependencies are npm packages
    let dependencies: Vec<(String, String, String)> = event
        .dependencies
        .iter()
        .map(|dep| {
            (
                event.ecosystem.clone(),
                dep.name.clone(),
                dep.version_range.clone(),
            )
        })
        .collect();

    // Build and execute queries
    let queries = GraphQueries::version_upserted(
        DEFAULT_TENANT_ID,
        &event.ecosystem,
        &event.package_name,
        &event.version,
        published_at,
        &dependencies,
    );

    // Execute all queries in a transaction
    client.execute_transaction(queries).await?;

    debug!(
        package_id = %GraphQueries::package_id(&event.ecosystem, &event.package_name),
        version_id = %GraphQueries::version_id(&event.ecosystem, &event.package_name, &event.version),
        "VersionUpserted processed successfully"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_version_upserted() {
        // Create a minimal valid protobuf message
        let event = VersionUpserted {
            meta: None,
            ecosystem: "npm".to_string(),
            package_name: "express".to_string(),
            version: "4.18.2".to_string(),
            yanked: false,
            tarball_url: "https://registry.npmjs.org/express/-/express-4.18.2.tgz".to_string(),
            integrity: "sha512-test".to_string(),
            size_bytes: 12345,
            published_at: None,
            dependencies: vec![],
            dev_dependencies: vec![],
            optional_dependencies: vec![],
        };

        let encoded = event.encode_to_vec();
        let decoded = VersionUpserted::decode(encoded.as_slice()).unwrap();

        assert_eq!(decoded.package_name, "express");
        assert_eq!(decoded.version, "4.18.2");
    }
}

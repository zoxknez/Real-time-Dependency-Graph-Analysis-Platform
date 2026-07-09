//! Graph Database Migrations
//!
//! Handles schema initialization and data backfills.
//! - Creates indexes
//! - Backfills name_lc (lowercase name) for performance

use crate::graph::GraphClient;
use anyhow::Result;
use tracing::{error, info, instrument, warn};

/// Run all migrations
#[instrument(skip(client))]
pub async fn run_migrations(client: &GraphClient) {
    info!("🚀 Starting graph migrations...");

    if let Err(e) = ensure_indexes(client).await {
        error!("Failed to create indexes: {}", e);
    }

    if let Err(e) = backfill_name_lc(client).await {
        error!("Failed to backfill name_lc: {}", e);
    }

    info!("✅ Graph migrations completed");
}

/// Ensure necessary indexes exist
async fn ensure_indexes(client: &GraphClient) -> Result<()> {
    info!("Ensuring indexes...");

    // Create index on Package(name_lc) for fast case-insensitive search
    match client
        .query(neo4rs::query("CREATE INDEX ON :Package(name_lc)"), None)
        .await
    {
        Ok(_) => info!("Index on :Package(name_lc) created/verified"),
        Err(e) => warn!("Index creation note (may already exist): {}", e),
    };

    Ok(())
}

/// Backfill name_lc property for packages that miss it
async fn backfill_name_lc(client: &GraphClient) -> Result<()> {
    // Check if we need to backfill
    let count_query = neo4rs::query(
        "MATCH (p:Package) WHERE p.name_lc IS NULL AND p.deleted_at IS NULL RETURN count(p) as count",
    );

    // client.query_one returns Result<Option<Row>>
    let mut needed = 0;
    if let Some(row) = client.query_one(count_query, None).await? {
        needed = row.get::<i64>("count").unwrap_or(0);
    }

    if needed == 0 {
        info!("No backfill needed for name_lc");
        return Ok(());
    }

    info!("Backfilling name_lc for {} packages...", needed);

    // Update in batches of 1000
    loop {
        let update_query = neo4rs::query(
            r#"
            MATCH (p:Package)
            WHERE p.name_lc IS NULL AND p.deleted_at IS NULL
            WITH p LIMIT 1000
            SET p.name_lc = toLower(p.name)
            RETURN count(p) as updated
            "#,
        );

        let rows = client.query(update_query, None).await?;
        let mut updated = 0;

        if let Some(row) = rows.first() {
            updated = row.get::<i64>("updated").unwrap_or(0);
        }

        if updated == 0 {
            break;
        }

        info!("Backfilled batch of {}", updated);
    }

    Ok(())
}

// Quick test for OutboxRepo and OutboxPublisher
//
// Run with: cargo run --example test_outbox

use anyhow::Result;
use ingestion::store::outbox::{OutboxEvent, OutboxRepo};
use sqlx::PgPool;

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    println!("🔌 Connecting to database...");
    let pool = PgPool::connect(&database_url).await?;

    let repo = OutboxRepo::new(pool.clone());

    // Test 1: Insert event
    println!("\n📝 Test 1: Inserting event into outbox...");
    let event = OutboxEvent {
        event_id: "test-event-123".to_string(),
        event_type: "package.upserted".to_string(),
        topic: "domain.package.events.v1".to_string(),
        partition_key: "test-package".to_string(),
        payload: b"test payload".to_vec(),
        headers: serde_json::json!({"source": "test"}),
    };

    repo.insert(&pool, &event).await?;
    println!("✅ Event inserted");

    // Test 2: Claim batch
    println!("\n📦 Test 2: Claiming batch with SKIP LOCKED...");
    let events = repo.claim_batch("test-worker", 10).await?;
    println!("✅ Claimed {} events", events.len());

    if !events.is_empty() {
        let claimed = &events[0];
        println!("   Event ID: {}", claimed.event_id);
        println!("   Status: {}", claimed.status);
        println!("   Attempts: {}", claimed.attempts);
        println!("   Locked by: {:?}", claimed.locked_by);

        // Test 3: Mark published
        println!("\n✅ Test 3: Marking event as published...");
        repo.mark_published(&claimed.event_id).await?;
        println!("✅ Event marked published");
    }

    // Test 4: Get stats
    println!("\n📊 Test 4: Getting outbox stats...");
    let stats = repo.get_stats().await?;
    for (status, count) in stats {
        println!("   {}: {}", status, count);
    }

    // Test 5: Test idempotency
    println!("\n🔄 Test 5: Testing idempotency (insert same event_id)...");
    repo.insert(&pool, &event).await?;
    println!("✅ Duplicate insert succeeded (ON CONFLICT DO NOTHING)");

    println!("\n🎉 All tests passed!");

    pool.close().await;
    Ok(())
}

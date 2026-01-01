use sqlx::PgPool;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PackageState {
    pub package_name: String,
    pub versions_json: serde_json::Value, // Array of strings ["1.0.0", "1.1.0"]
    pub last_updated_at: chrono::DateTime<chrono::Utc>,
}

pub struct NpmStateStore {
    pool: PgPool,
}

impl NpmStateStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_state(&self, package_name: &str) -> Result<Option<PackageState>> {
        let rec = sqlx::query_as!(
            PackageState,
            r#"
            SELECT package_name, versions_json, last_updated_at 
            FROM npm_package_state 
            WHERE package_name = $1
            "#,
            package_name
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(rec)
    }

    pub async fn save_state(&self, package_name: &str, versions: &[String]) -> Result<()> {
        let versions_json = serde_json::to_value(versions)?;
        
        sqlx::query!(
            r#"
            INSERT INTO npm_package_state (package_name, versions_json, last_updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (package_name) 
            DO UPDATE SET versions_json = $2, last_updated_at = NOW()
            "#,
            package_name,
            versions_json
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

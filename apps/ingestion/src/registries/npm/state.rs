use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

#[derive(Debug, Serialize, Deserialize, FromRow)]
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
        let rec = sqlx::query_as::<_, PackageState>(
            r#"
            SELECT package_name, versions_json, last_updated_at 
            FROM npm_package_state 
            WHERE package_name = $1
            "#,
        )
        .bind(package_name)
        .fetch_optional(&self.pool)
        .await?;

        Ok(rec)
    }

    pub async fn save_state<'a, E>(
        &self,
        executor: E,
        package_name: &str,
        versions: &[String],
    ) -> Result<()>
    where
        E: sqlx::Executor<'a, Database = sqlx::Postgres>,
    {
        let versions_json = serde_json::to_value(versions)?;

        sqlx::query(
            r#"
            INSERT INTO npm_package_state (package_name, versions_json, last_updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (package_name) 
            DO UPDATE SET versions_json = $2, last_updated_at = NOW()
            "#,
        )
        .bind(package_name)
        .bind(&versions_json)
        .execute(executor)
        .await?;

        Ok(())
    }
}

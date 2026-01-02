//! Memgraph sink - Cypher query generator and executor

use anyhow::Result;
use neo4rs::{Graph, Query};
use tracing::{debug, info};

/// Memgraph connection wrapper
pub struct MemgraphSink {
    graph: Graph,
}

impl MemgraphSink {
    /// Connect to Memgraph
    pub async fn new(uri: &str, user: &str, password: &str) -> Result<Self> {
        info!(uri = %uri, "Connecting to Memgraph");
        
        let graph = Graph::new(uri, user, password).await?;
        
        Ok(Self { graph })
    }
    
    /// Create necessary indexes
    pub async fn create_indexes(&self) -> Result<()> {
        let indexes = [
            "CREATE INDEX ON :Package(id)",
            "CREATE INDEX ON :Package(name)",
            "CREATE INDEX ON :Package(ecosystem)",
            "CREATE INDEX ON :Version(version)",
        ];
        
        for index in indexes {
            if let Err(e) = self.graph.run(Query::new(index.to_string())).await {
                debug!(index = %index, error = %e, "Index may already exist");
            }
        }
        
        info!("Created Memgraph indexes");
        Ok(())
    }
    
    /// Upsert a package node
    pub async fn upsert_package(
        &self,
        id: &str,
        name: &str,
        ecosystem: &str,
        description: Option<&str>,
    ) -> Result<()> {
        let query = Query::new(
            "MERGE (p:Package {id: $id})
             SET p.name = $name,
                 p.ecosystem = $ecosystem,
                 p.description = $description,
                 p.updated_at = timestamp()"
            .to_string()
        )
        .param("id", id)
        .param("name", name)
        .param("ecosystem", ecosystem)
        .param("description", description.unwrap_or(""));
        
        self.graph.run(query).await?;
        debug!(id = %id, "Upserted package");
        
        Ok(())
    }
    
    /// Create DEPENDS_ON relationship
    pub async fn create_dependency(
        &self,
        from_id: &str,
        to_id: &str,
        version_constraint: &str,
        dep_type: &str,
    ) -> Result<()> {
        let query = Query::new(
            "MATCH (from:Package {id: $from_id})
             MATCH (to:Package {id: $to_id})
             MERGE (from)-[r:DEPENDS_ON]->(to)
             SET r.version_constraint = $version_constraint,
                 r.dep_type = $dep_type"
            .to_string()
        )
        .param("from_id", from_id)
        .param("to_id", to_id)
        .param("version_constraint", version_constraint)
        .param("dep_type", dep_type);
        
        self.graph.run(query).await?;
        debug!(from = %from_id, to = %to_id, "Created dependency edge");
        
        Ok(())
    }
    
    /// Get all dependents of a package (inverse dependencies)
    #[allow(dead_code)]
    pub async fn get_dependents(&self, package_id: &str, depth: u32) -> Result<Vec<String>> {
        let query = Query::new(format!(
            "MATCH (p:Package {{id: $id}})<-[:DEPENDS_ON*1..{}]-(d:Package)
             RETURN DISTINCT d.id as dependent_id",
            depth
        ))
        .param("id", package_id);
        
        let mut result = self.graph.execute(query).await?;
        let mut dependents = vec![];
        
        while let Some(row) = result.next().await? {
            if let Ok(id) = row.get::<String>("dependent_id") {
                dependents.push(id);
            }
        }
        
        Ok(dependents)
    }
}

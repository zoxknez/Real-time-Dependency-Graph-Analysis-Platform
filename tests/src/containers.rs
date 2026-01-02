//! Testcontainers setup for platform services
//!
//! Custom container definitions for services not available in testcontainers-modules

use testcontainers::{
    core::{WaitFor, IntoContainerPort},
    runners::AsyncRunner,
    ContainerAsync, GenericImage, ImageExt,
};

/// Create and start a Memgraph container
pub async fn start_memgraph() -> anyhow::Result<(ContainerAsync<GenericImage>, String)> {
    let container = GenericImage::new("memgraph/memgraph-platform", "2.19.0")
        .with_wait_for(WaitFor::message_on_stderr("Bolt server is fully up and running"))
        .with_exposed_port(7687.tcp())
        .with_exposed_port(7444.tcp())
        .start()
        .await?;
    
    let port = container.get_host_port_ipv4(7687).await?;
    let url = format!("bolt://localhost:{}", port);
    
    Ok((container, url))
}

/// Create and start a Qdrant container
pub async fn start_qdrant() -> anyhow::Result<(ContainerAsync<GenericImage>, String)> {
    let container = GenericImage::new("qdrant/qdrant", "v1.12.4")
        .with_wait_for(WaitFor::message_on_stdout("Qdrant HTTP listening"))
        .with_exposed_port(6333.tcp())
        .with_exposed_port(6334.tcp())
        .start()
        .await?;
    
    let port = container.get_host_port_ipv4(6334).await?;
    let url = format!("http://localhost:{}", port);
    
    Ok((container, url))
}

/// Create and start a Redpanda container
pub async fn start_redpanda() -> anyhow::Result<(ContainerAsync<GenericImage>, String)> {
    let container = GenericImage::new("docker.redpanda.com/redpandadata/redpanda", "v24.3.1")
        .with_wait_for(WaitFor::message_on_stderr("Successfully started Redpanda!"))
        .with_exposed_port(9092.tcp())
        .with_exposed_port(8081.tcp())
        .with_exposed_port(8082.tcp())
        .with_exposed_port(9644.tcp())
        .with_cmd(vec![
            "redpanda".to_string(),
            "start".to_string(),
            "--smp".to_string(), "1".to_string(),
            "--memory".to_string(), "512M".to_string(),
            "--reserve-memory".to_string(), "0M".to_string(),
            "--overprovisioned".to_string(),
            "--node-id".to_string(), "0".to_string(),
            "--kafka-addr".to_string(), "PLAINTEXT://0.0.0.0:9092".to_string(),
            "--advertise-kafka-addr".to_string(), "PLAINTEXT://localhost:9092".to_string(),
        ])
        .start()
        .await?;
    
    let port = container.get_host_port_ipv4(9092).await?;
    let url = format!("localhost:{}", port);
    
    Ok((container, url))
}

/// Create and start a RisingWave container
pub async fn start_risingwave() -> anyhow::Result<(ContainerAsync<GenericImage>, String)> {
    let container = GenericImage::new("risingwavelabs/risingwave", "v2.1.4-single")
        .with_wait_for(WaitFor::message_on_stdout("ready to accept connections"))
        .with_exposed_port(4566.tcp())
        .with_exposed_port(5505.tcp())
        .start()
        .await?;
    
    let port = container.get_host_port_ipv4(4566).await?;
    let url = format!("postgres://root@localhost:{}/dev", port);
    
    Ok((container, url))
}

/// Test infrastructure that manages all containers
pub struct TestInfrastructure {
    pub memgraph_url: String,
    pub qdrant_url: String,
    pub kafka_url: String,
    pub risingwave_url: String,
    // Keep containers alive
    _memgraph: ContainerAsync<GenericImage>,
    _qdrant: ContainerAsync<GenericImage>,
    _redpanda: ContainerAsync<GenericImage>,
    _risingwave: ContainerAsync<GenericImage>,
}

impl TestInfrastructure {
    /// Start all containers and return connection strings
    pub async fn start() -> anyhow::Result<Self> {
        use tracing::info;
        
        info!("Starting test infrastructure...");
        
        // Start containers
        let (memgraph, memgraph_url) = start_memgraph().await?;
        let (qdrant, qdrant_url) = start_qdrant().await?;
        let (redpanda, kafka_url) = start_redpanda().await?;
        let (risingwave, risingwave_url) = start_risingwave().await?;
        
        let infra = Self {
            memgraph_url: memgraph_url.clone(),
            qdrant_url: qdrant_url.clone(),
            kafka_url: kafka_url.clone(),
            risingwave_url: risingwave_url.clone(),
            _memgraph: memgraph,
            _qdrant: qdrant,
            _redpanda: redpanda,
            _risingwave: risingwave,
        };
        
        info!(
            memgraph = %infra.memgraph_url,
            qdrant = %infra.qdrant_url,
            kafka = %infra.kafka_url,
            risingwave = %infra.risingwave_url,
            "Test infrastructure started"
        );
        
        Ok(infra)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_module_compiles() {
        // Just verify the module compiles
    }
}

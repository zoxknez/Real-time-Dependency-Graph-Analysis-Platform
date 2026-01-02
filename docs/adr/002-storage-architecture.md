# ADR-002: Storage Layer Architecture

## Status
Accepted

## Date
2026-01-01

## Context

The Real-time Dependency Graph Analysis Platform requires storage for:
1. **Graph data**: Package relationships, dependencies, maintainers
2. **Vector embeddings**: Semantic search for packages and code
3. **Streaming data**: Real-time event processing and materialized views

We need to choose databases that can handle:
- Millions of packages with complex dependency relationships
- Sub-second graph traversal queries
- Vector similarity search across embeddings
- Real-time data ingestion and processing

## Decision

We chose a polyglot persistence approach with specialized databases:

### 1. Memgraph for Graph Storage

**Why Memgraph over Neo4j:**
- In-memory storage for faster queries (10-100x faster for traversals)
- Native Cypher support with compatible syntax
- Lower memory footprint for same dataset
- Built-in MAGE library for graph algorithms
- Better suited for real-time workloads
- Open source with permissive license

**Trade-offs:**
- Less mature ecosystem than Neo4j
- Fewer enterprise features
- Smaller community

### 2. Qdrant for Vector Storage

**Why Qdrant over alternatives:**
- Purpose-built for vector similarity search
- Supports filtering during search (hybrid search)
- Rust implementation for performance
- gRPC and REST APIs
- Built-in quantization for memory efficiency
- Horizontal scaling support

**Alternatives considered:**
- Pinecone: Managed only, vendor lock-in
- Milvus: More complex, heavier weight
- Weaviate: GraphQL-first, different paradigm
- pgvector: Good for small scale, but limited features

### 3. RisingWave for Streaming SQL

**Why RisingWave:**
- PostgreSQL-compatible streaming database
- Materialized views with automatic updates
- Kafka/Redpanda source connectors
- SQL-based processing (lower learning curve)
- Scales horizontally

**Alternatives considered:**
- Apache Flink: More powerful but complex
- ksqlDB: Tied to Confluent ecosystem
- Materialize: Similar approach, commercial focus

## Consequences

### Positive
- Each database optimized for its use case
- Clear separation of concerns
- Can scale components independently
- Leverage specialized features of each system

### Negative
- Operational complexity (3+ databases to manage)
- Data synchronization between stores required
- Multiple query languages/APIs to learn
- More complex deployment and monitoring

### Mitigations
- Syncer service handles data synchronization
- Shared storage client library abstracts connections
- Comprehensive monitoring via Grafana dashboards
- Docker Compose and Helm charts for deployment

## References

- [Memgraph Documentation](https://memgraph.com/docs)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [RisingWave Documentation](https://docs.risingwave.com/)

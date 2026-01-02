# ADR-003: Graph vs Vector Writer Separation

## Status
Accepted

## Date
2026-01-01

## Context

When processing package metadata from registries, we need to write data to multiple storage systems:
1. **Memgraph**: Graph nodes and relationships
2. **Qdrant**: Vector embeddings for semantic search

We considered two approaches:
1. **Unified Writer**: Single service writes to both databases
2. **Separate Writers**: Dedicated services for each database

## Decision

We chose to implement **separate writer services**:
- `graph-writer`: Consumes events and writes to Memgraph
- `vector-writer`: Consumes events and writes to Qdrant

## Rationale

### 1. Independent Scaling
Graph operations (Cypher writes) have different performance characteristics than vector operations (embedding upserts). Separating allows:
- Scale graph-writer based on Memgraph write capacity
- Scale vector-writer based on embedding generation load
- Independent resource allocation (CPU vs memory)

### 2. Fault Isolation
- Memgraph issues don't affect vector storage
- Qdrant downtime doesn't block graph updates
- Easier to debug and monitor each component

### 3. Independent Evolution
- Can update embedding model without touching graph logic
- Can optimize Cypher queries without vector concerns
- Different release cycles if needed

### 4. Technology Flexibility
- Could swap vector database without affecting graph writer
- Could add additional vector stores (e.g., Memgraph's own vector index)

## Implementation

```
                    ┌─────────────────┐
                    │     Kafka       │
                    │  package.events │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
      ┌───────────┐  ┌───────────┐  ┌───────────┐
      │  Graph    │  │  Vector   │  │  Analysis │
      │  Writer   │  │  Writer   │  │  Service  │
      └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
            │              │              │
            ▼              ▼              ▼
      ┌───────────┐  ┌───────────┐  ┌───────────┐
      │  Memgraph │  │   Qdrant  │  │   Kafka   │
      └───────────┘  └───────────┘  │  analysis │
                                    └───────────┘
```

### Consumer Groups
Each writer uses a separate Kafka consumer group:
- `graph-writer-group`: For graph-writer instances
- `vector-writer-group`: For vector-writer instances

This ensures:
- Both writers process every event
- Multiple instances of same writer share load
- At-least-once delivery guarantees

### Idempotency
Both writers implement idempotent operations:
- **Graph Writer**: MERGE operations in Cypher
- **Vector Writer**: Upsert with package ID as point ID

## Consequences

### Positive
- Clear separation of concerns
- Independent scaling and deployment
- Fault isolation
- Easier testing and debugging
- Can pause one writer without affecting other

### Negative
- More services to operate
- Potential data inconsistency window between stores
- Duplicate Kafka consumption overhead

### Mitigations
- Docker Compose bundles all services
- Syncer service periodically reconciles data
- Monitoring alerts for consumer lag

## Alternatives Considered

### Unified Writer Service
Single service that writes to both databases in one transaction.

**Rejected because:**
- No distributed transaction support across Memgraph and Qdrant
- Coupling reduces flexibility
- Single point of failure

### Database Triggers/CDC
Use Change Data Capture from Memgraph to populate Qdrant.

**Rejected because:**
- Memgraph doesn't support CDC natively
- Would require additional infrastructure
- Adds latency to vector updates

## References

- [Microservices Patterns - Database per Service](https://microservices.io/patterns/data/database-per-service.html)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)

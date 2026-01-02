# ADR-005: GraphQL as Primary API

## Status
Accepted

## Date
2025-12-01

## Context

The Dependency Graph Analysis Platform exposes APIs for:
- Package metadata queries
- Dependency graph traversals
- Semantic search
- Real-time updates via subscriptions

We needed to choose between REST, GraphQL, and gRPC for the primary API.

## Decision

We chose **GraphQL** as the primary API interface using the `async-graphql` library.

## Rationale

### 1. Flexible Querying

Our data model is a graph with complex relationships. GraphQL naturally expresses:
```graphql
query {
  package(id: "npm:react") {
    name
    latestVersion
    dependencies(depth: 2) {
      name
      version
      hasBreakingChanges
    }
    dependents(limit: 10) {
      name
      downloadCount
    }
  }
}
```

With REST, this would require:
- Multiple API calls, or
- Complex query parameter schemes, or
- Multiple endpoints for different use cases

### 2. Over-fetching Prevention

Clients request exactly what they need:
- Mobile app: minimal fields for list views
- Desktop app: full detail views
- CI integrations: specific fields for checks

### 3. Strong Typing

GraphQL schema provides:
- Self-documenting API
- Type-safe client generation
- Compile-time validation
- IDE autocomplete support

### 4. Real-time Subscriptions

Native subscription support for:
```graphql
subscription {
  newVersion(ecosystems: [NPM, CARGO]) {
    packageId
    version
    publishedAt
  }
}
```

Alternatives with REST:
- Polling (inefficient)
- WebSocket with custom protocol (more work)
- SSE (limited browser support)

### 5. Graph Data Model Fit

Our domain is literally a graph:
- Packages, versions, dependencies, maintainers
- Natural fit for GraphQL's graph traversal

## Implementation

### Schema Structure
```graphql
type Query {
  # Single package lookup
  package(id: ID!): Package
  
  # Search and discovery
  searchPackages(query: String!, limit: Int): PackageConnection!
  
  # Graph traversals
  reverseDependents(packageId: ID!, depth: Int): DependencyGraph!
  dependencyPath(from: ID!, to: ID!): [Package!]
  impactRadius(packageId: ID!): ImpactAnalysis!
  
  # Statistics
  graphStats: GraphStats!
}

type Subscription {
  newVersion(ecosystems: [Ecosystem!]): VersionEvent!
  breakingChangeDetected(ecosystems: [Ecosystem!]): BreakingChangeEvent!
  liveStats: StatsSnapshot!
  packageEvents(packageId: ID!): PackageEvent!
}
```

### Security Measures
- Query depth limiting (max 12 levels)
- Query complexity limiting (max 1000)
- Rate limiting per client
- Field-level authorization

### Caching Strategy
- DataLoader for N+1 prevention
- Redis caching for expensive queries
- Response-level caching headers

## Consequences

### Positive
- Excellent developer experience
- Self-documenting API
- Efficient data fetching
- Native subscription support
- Strong typing with codegen
- Perfect fit for graph domain

### Negative
- More complex caching than REST
- Query complexity attacks possible
- Learning curve for GraphQL newcomers
- HTTP caching less effective

### Mitigations
- Comprehensive query limits
- DataLoader batching
- Response caching where applicable
- Interactive GraphQL playground for learning

## Alternatives Considered

### REST
**Pros:**
- Simpler to understand
- Native HTTP caching
- Wider tooling support

**Rejected because:**
- Over-fetching/under-fetching problems
- Multiple round trips for related data
- Custom solutions needed for real-time

### gRPC
**Pros:**
- Very fast (binary protocol)
- Strong typing with Protobuf
- Streaming support

**Rejected because:**
- Not browser-native (requires proxy)
- Less flexible queries
- Higher complexity for our use case

### tRPC
**Pros:**
- TypeScript native
- Simple setup
- Full-stack type safety

**Rejected because:**
- TypeScript-only ecosystem
- Less standardized
- Not suitable for Rust backend

## Code Examples

### Query Implementation (Rust)
```rust
#[Object]
impl Query {
    async fn package(&self, ctx: &Context<'_>, id: ID) -> Result<Option<Package>> {
        let loader = ctx.data::<DataLoader<PackageLoader>>()?;
        loader.load_one(id.to_string()).await
    }
    
    async fn reverse_dependents(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        depth: Option<i32>,
    ) -> Result<DependencyGraph> {
        let graph = ctx.data::<GraphQueries>()?;
        graph.reverse_dependents(&package_id, depth.unwrap_or(2)).await
    }
}
```

### Subscription Implementation
```rust
#[Subscription]
impl Subscription {
    async fn new_version(
        &self,
        ecosystems: Option<Vec<Ecosystem>>,
    ) -> impl Stream<Item = VersionEvent> {
        let rx = VERSION_EVENTS.subscribe();
        
        BroadcastStream::new(rx)
            .filter_map(move |result| {
                let ecosystems = ecosystems.clone();
                async move {
                    match result {
                        Ok(event) if matches_filter(&event, &ecosystems) => Some(event),
                        _ => None,
                    }
                }
            })
    }
}
```

## References

- [async-graphql Documentation](https://async-graphql.github.io/async-graphql/)
- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)
- [Why GraphQL](https://www.howtographql.com/basics/1-graphql-is-the-better-rest/)

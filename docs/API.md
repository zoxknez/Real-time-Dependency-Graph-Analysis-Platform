# Inverse Dependency Platform - API Documentation

> Enterprise-grade GraphQL API for dependency graph intelligence

## Overview

The IDP API provides a comprehensive GraphQL interface for querying dependency relationships, analyzing impact of changes, and subscribing to real-time updates across package ecosystems.

## Quick Start

### GraphQL Endpoint

```
POST /graphql
```

### GraphQL Playground

```
GET /graphql
```

Opens GraphiQL interactive playground for exploring the API.

### WebSocket Subscriptions

```
ws://[host]/graphql/ws
```

## Authentication

The API supports JWT-based authentication. Include the token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

For development/testing, authentication may be disabled.

## Core Concepts

### Package Identification

Packages are identified by `ecosystem:name` format:
- `npm:react`
- `pypi:django`
- `cargo:serde`
- `maven:org.springframework:spring-core`

### Ecosystems

| Ecosystem | Description |
|-----------|-------------|
| `NPM` | Node.js packages from npmjs.com |
| `PYPI` | Python packages from PyPI |
| `CARGO` | Rust crates from crates.io |
| `MAVEN` | Java/JVM packages |
| `NUGET` | .NET packages |
| `GO` | Go modules |

## Queries

### reverseDependents

Find all packages that depend on a given package (inverse dependency lookup).

```graphql
query ReverseDependents($packageId: ID!, $first: Int, $after: String, $depth: Int) {
  reverseDependents(
    packageId: $packageId
    first: $first
    after: $after
    depth: $depth
  ) {
    edges {
      node {
        id
        ecosystem
        name
      }
      depth
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `packageId` | `ID!` | Yes | - | Package ID (e.g., "npm:lodash") |
| `first` | `Int` | No | 20 | Number of results per page |
| `after` | `String` | No | - | Cursor for pagination |
| `depth` | `Int` | No | 3 | Maximum depth of transitive dependents |

**Example:**
```graphql
query {
  reverseDependents(packageId: "npm:lodash", first: 10, depth: 2) {
    totalCount
    edges {
      node {
        name
        ecosystem
      }
      depth
    }
  }
}
```

### dependencyPath

Find the shortest path between two packages in the dependency graph.

```graphql
query DependencyPath($from: ID!, $to: ID!, $maxDepth: Int) {
  dependencyPath(from: $from, to: $to, maxDepth: $maxDepth) {
    found
    hops
    packages {
      id
      name
      ecosystem
    }
  }
}
```

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `from` | `ID!` | Yes | - | Source package ID |
| `to` | `ID!` | Yes | - | Target package ID |
| `maxDepth` | `Int` | No | 10 | Maximum path length |

### impactRadius

Simulate a CVE impact analysis - find all packages affected by a vulnerability.

```graphql
query ImpactRadius($packageId: ID!, $versionRange: String, $maxDepth: Int) {
  impactRadius(
    packageId: $packageId
    versionRange: $versionRange
    maxDepth: $maxDepth
  ) {
    packageId
    vulnerableVersionRange
    maxDepth
    impactedPackages
    impactedVersions
    topImpacted {
      package {
        name
        ecosystem
      }
      depth
      estimatedAffectedVersions
    }
  }
}
```

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `packageId` | `ID!` | Yes | - | Vulnerable package ID |
| `versionRange` | `String` | No | "*" | Semver range (e.g., "<2.0.0") |
| `maxDepth` | `Int` | No | 5 | Maximum traversal depth |

### package

Get details for a specific package.

```graphql
query Package($id: ID!) {
  package(id: $id) {
    id
    ecosystem
    name
    versions {
      version
      publishedAt
      yanked
    }
  }
}
```

### search

Search for packages by name with optional ecosystem filter.

```graphql
query Search($query: String!, $ecosystem: Ecosystem, $first: Int) {
  search(query: $query, ecosystem: $ecosystem, first: $first) {
    edges {
      node {
        id
        name
        ecosystem
      }
      cursor
    }
    totalCount
  }
}
```

### stats

Get platform statistics.

```graphql
query Stats {
  stats {
    totalPackages
    totalVersions
    totalDependencies
    ecosystemBreakdown {
      ecosystem
      count
    }
  }
}
```

## Subscriptions

Real-time event streams via WebSocket connection.

### newVersion

Subscribe to new package version events.

```graphql
subscription NewVersion($ecosystem: Ecosystem, $packageId: ID) {
  newVersion(ecosystem: $ecosystem, packageId: $packageId) {
    meta {
      eventId
      occurredAt
      source
    }
    package {
      id
      name
      ecosystem
    }
    version {
      version
      publishedAt
    }
  }
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `ecosystem` | `Ecosystem` | No | Filter by ecosystem |
| `packageId` | `ID` | No | Filter by specific package |

### breakingChangeDetected

Subscribe to breaking change detection events.

```graphql
subscription BreakingChanges($ecosystem: Ecosystem, $minSeverity: BreakingSeverity) {
  breakingChangeDetected(ecosystem: $ecosystem, minSeverity: $minSeverity) {
    meta {
      eventId
      occurredAt
    }
    package {
      name
      ecosystem
    }
    oldVersion
    newVersion
    severity
    changes {
      changeType
      description
      symbol
      migrationHint
    }
    affectedDependents
  }
}
```

**Severity Levels:**
- `LOW` - Minor changes (deprecations)
- `MEDIUM` - API signature changes
- `HIGH` - Removed exports, incompatible types
- `CRITICAL` - Security-related changes

### liveStats

Subscribe to platform statistics updates.

```graphql
subscription LiveStats($intervalMs: Int) {
  liveStats(intervalMs: $intervalMs) {
    timestamp
    totalPackages
    totalVersions
    packagesLastHour
    versionsLastHour
    activeSubscriptions
    ecosystemActivity {
      ecosystem
      packagesAdded
      versionsAdded
    }
  }
}
```

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `intervalMs` | `Int` | No | 5000 | Minimum interval between updates (min: 1000ms) |

### dependencyImpact

Subscribe to high-impact dependency events.

```graphql
subscription DependencyImpact($ecosystem: Ecosystem, $minImpactScore: Float) {
  dependencyImpact(ecosystem: $ecosystem, minImpactScore: $minImpactScore) {
    meta {
      eventId
      occurredAt
    }
    package {
      name
      ecosystem
    }
    version
    impactScore
    directDependents
    transitiveDependents
    notableDependents {
      name
    }
  }
}
```

### packageEvents

Subscribe to all events for a specific package.

```graphql
subscription PackageEvents($packageId: ID!) {
  packageEvents(packageId: $packageId) {
    package {
      name
    }
    version {
      version
      publishedAt
    }
  }
}
```

## Types

### Package

```graphql
type Package {
  id: ID!
  ecosystem: Ecosystem!
  name: String!
}
```

### Version

```graphql
type Version {
  id: ID!
  packageId: ID!
  version: String!
  publishedAt: String
  yanked: Boolean!
}
```

### PageInfo (Relay-style pagination)

```graphql
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

## Error Handling

Errors follow the GraphQL specification:

```json
{
  "errors": [
    {
      "message": "Package not found: npm:nonexistent",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["package"],
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": null
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Resource not found |
| `RATE_LIMITED` | Too many requests |
| `COMPLEXITY_EXCEEDED` | Query too complex |
| `DEPTH_EXCEEDED` | Query too deep |
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |

## Rate Limiting

- Default: 100 requests per minute per IP
- Subscription connections: 10 concurrent per IP
- Query complexity limit: 1000 points

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## Query Complexity

Queries are analyzed for complexity to prevent abuse:

| Operation | Cost |
|-----------|------|
| Field access | 1 |
| Nested object | 2 |
| List field | 5 × items |
| Transitive query | 10 × depth |

Maximum complexity: **1000**

## Examples

### Find all packages affected by a lodash vulnerability

```graphql
query LodashImpact {
  impactRadius(
    packageId: "npm:lodash"
    versionRange: "<4.17.21"
    maxDepth: 3
  ) {
    impactedPackages
    topImpacted(first: 5) {
      package {
        name
      }
      depth
    }
  }
}
```

### Monitor React ecosystem for new versions

```graphql
subscription ReactVersions {
  newVersion(ecosystem: NPM, packageId: "npm:react") {
    version {
      version
      publishedAt
    }
  }
}
```

### Find path from your app to a vulnerable package

```graphql
query FindVulnPath {
  dependencyPath(
    from: "npm:my-app"
    to: "npm:vulnerable-pkg"
    maxDepth: 10
  ) {
    found
    hops
    packages {
      name
    }
  }
}
```

## Health Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "version": "0.1.0"
}
```

### Readiness Check

```
GET /ready
```

Response:
```json
{
  "status": "ready",
  "memgraph": true,
  "redis": true
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:8080/graphql/ws',
});

// Subscribe to new versions
const unsubscribe = client.subscribe(
  {
    query: `
      subscription {
        newVersion(ecosystem: NPM) {
          package { name }
          version { version }
        }
      }
    `,
  },
  {
    next: (data) => console.log('New version:', data),
    error: (err) => console.error('Error:', err),
    complete: () => console.log('Complete'),
  }
);
```

### Python

```python
from gql import gql, Client
from gql.transport.aiohttp import AIOHTTPTransport

transport = AIOHTTPTransport(url="http://localhost:8080/graphql")
client = Client(transport=transport, fetch_schema_from_transport=True)

query = gql("""
    query ReverseDeps($pkg: ID!) {
        reverseDependents(packageId: $pkg, first: 10) {
            totalCount
            edges {
                node { name }
            }
        }
    }
""")

result = client.execute(query, variable_values={"pkg": "npm:lodash"})
print(result)
```

### Rust

```rust
use graphql_client::{GraphQLQuery, Response};

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "schema.graphql",
    query_path = "queries.graphql",
    response_derives = "Debug"
)]
struct ReverseDependents;

async fn query_dependents(client: &reqwest::Client, package_id: &str) {
    let variables = reverse_dependents::Variables {
        package_id: package_id.to_string(),
        first: Some(10),
    };
    
    let response: Response<reverse_dependents::ResponseData> = client
        .post("http://localhost:8080/graphql")
        .json(&ReverseDependents::build_query(variables))
        .send()
        .await?
        .json()
        .await?;
    
    println!("{:?}", response.data);
}
```

## Changelog

### v0.1.0
- Initial release
- Core queries: reverseDependents, dependencyPath, impactRadius
- Subscriptions: newVersion, breakingChangeDetected, liveStats, dependencyImpact
- JWT authentication support
- Rate limiting

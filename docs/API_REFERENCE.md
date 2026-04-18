# 📚 IDP Platform - API Reference

> **Version**: 1.0.0  
> **Last Updated**: 2026-04-18  
> **GraphQL Endpoint**: `http://localhost:8000/graphql`  
> **WebSocket Endpoint**: `ws://localhost:8000/graphql/ws`

---

## 🎯 Table of Contents

1. [Authentication](#authentication)
2. [GraphQL Schema](#graphql-schema)
3. [Queries](#queries)
4. [Mutations](#mutations)
5. [Subscriptions](#subscriptions)
6. [Types](#types)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)
9. [Examples](#examples)

---

## 🔐 Authentication

### JWT Token

All authenticated requests require a JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### Token Structure

```json
{
  "sub": "user-id",
  "exp": 1735689600,
  "iat": 1735603200,
  "roles": ["user", "admin"],
  "tier": "pro",
  "tenant_id": "tenant-uuid",
  "org_id": "org-uuid"
}
```

### API Tiers

| Tier | Rate Limit | Features |
|------|------------|----------|
| **Free** | 100 req/min | Basic queries |
| **Pro** | 1,000 req/min | Semantic search, subscriptions |
| **Enterprise** | 10,000 req/min | All features, priority support |

---

## 📊 GraphQL Schema

### Introspection Query

```graphql
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name
      kind
      description
    }
  }
}
```

---

## 🔍 Queries

### searchPackages

Search for packages by name or pattern.

**Signature:**
```graphql
searchPackages(
  query: String!
  ecosystem: Ecosystem
  first: Int = 20
  after: String
): PackageConnection!
```

**Example:**
```graphql
query SearchReact {
  searchPackages(query: "react", ecosystem: NPM, first: 10) {
    edges {
      node {
        id
        name
        ecosystem
        description
        latestVersion
      }
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

**Response:**
```json
{
  "data": {
    "searchPackages": {
      "edges": [
        {
          "node": {
            "id": "npm:react",
            "name": "react",
            "ecosystem": "NPM",
            "description": "React is a JavaScript library for building user interfaces.",
            "latestVersion": "18.2.0"
          },
          "cursor": "Y3Vyc29yOjE="
        }
      ],
      "pageInfo": {
        "hasNextPage": true,
        "endCursor": "Y3Vyc29yOjEw"
      },
      "totalCount": 1523
    }
  }
}
```

---

### semanticSearchPackages

AI-powered semantic search using natural language.

**Signature:**
```graphql
semanticSearchPackages(
  query: String!
  ecosystem: Ecosystem
  first: Int = 20
  after: String
): SemanticPackageConnection!
```

**Example:**
```graphql
query SemanticSearch {
  semanticSearchPackages(
    query: "http client with automatic retries and timeout"
    ecosystem: NPM
    first: 5
  ) {
    edges {
      node {
        id
        name
        description
      }
      score
    }
    totalCount
  }
}
```

**Response:**
```json
{
  "data": {
    "semanticSearchPackages": {
      "edges": [
        {
          "node": {
            "id": "npm:axios",
            "name": "axios",
            "description": "Promise based HTTP client for the browser and node.js"
          },
          "score": 0.92
        },
        {
          "node": {
            "id": "npm:got",
            "name": "got",
            "description": "Human-friendly and powerful HTTP request library for Node.js"
          },
          "score": 0.87
        }
      ],
      "totalCount": 45
    }
  }
}
```

---

### package

Get detailed information about a specific package.

**Signature:**
```graphql
package(id: ID!): Package
```

**Example:**
```graphql
query GetPackage {
  package(id: "npm:lodash") {
    id
    name
    ecosystem
    description
    homepage
    repository
    license
    latestVersion
    versions {
      version
      publishedAt
      yanked
    }
    maintainers {
      name
      email
    }
  }
}
```

---

### reverseDependents

Find packages that depend on a given package.

**Signature:**
```graphql
reverseDependents(
  packageId: ID!
  maxDepth: Int = 3
  first: Int = 20
  after: String
): DependentConnection!
```

**Example:**
```graphql
query FindDependents {
  reverseDependents(
    packageId: "npm:lodash"
    maxDepth: 2
    first: 10
  ) {
    edges {
      node {
        id
        name
        ecosystem
      }
      depth
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}
```

---

### dependencyPath

Find the shortest path between two packages in the dependency graph.

**Signature:**
```graphql
dependencyPath(
  fromPackageId: ID!
  toPackageId: ID!
  maxHops: Int = 10
): DependencyPath
```

**Example:**
```graphql
query FindPath {
  dependencyPath(
    fromPackageId: "npm:express"
    toPackageId: "npm:lodash"
    maxHops: 5
  ) {
    path {
      id
      name
      ecosystem
    }
    length
    exists
  }
}
```

---

### impactRadius

Analyze the impact of changes to a package.

**Signature:**
```graphql
impactRadius(
  packageId: ID!
  maxDepth: Int = 3
  limit: Int = 100
): ImpactAnalysis!
```

**Example:**
```graphql
query AnalyzeImpact {
  impactRadius(
    packageId: "npm:lodash"
    maxDepth: 3
    limit: 100
  ) {
    packageId
    impactedPackages
    impactedVersions
    topImpacted {
      package {
        id
        name
      }
      depth
      dependencyCount
    }
  }
}
```

---

### vulnerabilities

Get known vulnerabilities for a package.

**Signature:**
```graphql
vulnerabilities(
  packageId: ID!
  severity: VulnerabilitySeverity
): [Vulnerability!]!
```

**Example:**
```graphql
query GetVulnerabilities {
  vulnerabilities(
    packageId: "npm:lodash@4.17.20"
    severity: HIGH
  ) {
    id
    cveId
    severity
    title
    description
    publishedAt
    fixedIn
    references {
      type
      url
    }
  }
}
```

---

## ✏️ Mutations

### trackPackage

Add a package to your watchlist.

**Signature:**
```graphql
trackPackage(packageId: ID!): TrackingResult!
```

**Example:**
```graphql
mutation TrackReact {
  trackPackage(packageId: "npm:react") {
    success
    message
    package {
      id
      name
    }
  }
}
```

---

### untrackPackage

Remove a package from your watchlist.

**Signature:**
```graphql
untrackPackage(packageId: ID!): TrackingResult!
```

---

### reportVulnerability

Report a security vulnerability.

**Signature:**
```graphql
reportVulnerability(input: VulnerabilityInput!): VulnerabilityReport!
```

**Example:**
```graphql
mutation ReportVuln {
  reportVulnerability(input: {
    packageId: "npm:example@1.0.0"
    severity: HIGH
    title: "SQL Injection vulnerability"
    description: "Allows arbitrary SQL execution..."
    affectedVersions: ["1.0.0", "1.0.1"]
  }) {
    id
    status
    createdAt
  }
}
```

---

## 📡 Subscriptions

### packageUpdated

Subscribe to updates for specific packages.

**Signature:**
```graphql
packageUpdated(packageIds: [ID!]!): PackageUpdate!
```

**Example:**
```graphql
subscription WatchReact {
  packageUpdated(packageIds: ["npm:react"]) {
    package {
      id
      name
      latestVersion
    }
    updateType
    timestamp
  }
}
```

**WebSocket Connection:**
```javascript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:8000/graphql/ws',
  connectionParams: {
    authorization: 'Bearer <token>',
  },
});

client.subscribe(
  {
    query: `
      subscription {
        packageUpdated(packageIds: ["npm:react"]) {
          package { id name latestVersion }
          updateType
          timestamp
        }
      }
    `,
  },
  {
    next: (data) => console.log('Update:', data),
    error: (error) => console.error('Error:', error),
    complete: () => console.log('Complete'),
  }
);
```

---

### breakingChangeDetected

Subscribe to breaking change notifications.

**Signature:**
```graphql
breakingChangeDetected(ecosystems: [Ecosystem!]): BreakingChange!
```

**Example:**
```graphql
subscription WatchBreakingChanges {
  breakingChangeDetected(ecosystems: [NPM, PYPI]) {
    package {
      id
      name
    }
    oldVersion
    newVersion
    changes {
      type
      description
      severity
    }
    timestamp
  }
}
```

---

## 📦 Types

### Package

```graphql
type Package {
  id: ID!
  name: String!
  ecosystem: Ecosystem!
  description: String
  homepage: String
  repository: String
  license: String
  latestVersion: String
  versions: [Version!]!
  maintainers: [Maintainer!]!
  dependencies(version: String): [Dependency!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### Ecosystem

```graphql
enum Ecosystem {
  NPM
  PYPI
  CARGO
  GO
  MAVEN
  NUGET
}
```

### VulnerabilitySeverity

```graphql
enum VulnerabilitySeverity {
  CRITICAL
  HIGH
  MEDIUM
  LOW
  INFO
}
```

---

## ⚠️ Error Handling

### Error Response Format

```json
{
  "errors": [
    {
      "message": "Package not found",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["package"],
      "extensions": {
        "code": "PACKAGE_NOT_FOUND",
        "packageId": "npm:nonexistent"
      }
    }
  ],
  "data": null
}
```

### Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHENTICATED` | Missing or invalid JWT token | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `PACKAGE_NOT_FOUND` | Package does not exist | 404 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `INTERNAL_ERROR` | Server error | 500 |
| `INVALID_INPUT` | Validation error | 400 |

---

## 🚦 Rate Limiting

### Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1735603260
Retry-After: 60
```

### Rate Limit Exceeded Response

```json
{
  "errors": [
    {
      "message": "Rate limit exceeded. Please retry after 60 seconds.",
      "extensions": {
        "code": "RATE_LIMIT_EXCEEDED",
        "retryAfter": 60
      }
    }
  ]
}
```

---

## 💡 Examples

### Complete Query Example

```graphql
query CompleteExample {
  # Search for packages
  packages: searchPackages(query: "react", first: 5) {
    edges {
      node {
        id
        name
        description
      }
    }
  }
  
  # Get specific package
  react: package(id: "npm:react") {
    id
    name
    latestVersion
    license
  }
  
  # Find dependents
  dependents: reverseDependents(packageId: "npm:react", first: 10) {
    edges {
      node {
        id
        name
      }
      depth
    }
    totalCount
  }
}
```

### Pagination Example

```graphql
query PaginatedSearch($after: String) {
  searchPackages(
    query: "http"
    first: 20
    after: $after
  ) {
    edges {
      node {
        id
        name
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Variables:
```json
{
  "after": "Y3Vyc29yOjIw"
}
```

---

## 🔗 Additional Resources

- [GraphQL Playground](http://localhost:8000/graphql) - Interactive API explorer
- [Architecture Documentation](./ARCHITECTURE.md)
- [Security Guide](./SECURITY.md)
- [Runbook](./RUNBOOK.md)

---

## 📝 Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-18 | 1.0.0 | Initial API documentation |
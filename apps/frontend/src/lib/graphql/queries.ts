import { gql } from "@apollo/client";

export const ASK_GEMINI = gql`
  query AskGemini($question: String!, $contextPackages: [ID!]!) {
    askGemini(question: $question, contextPackages: $contextPackages)
  }
`;

export const EXPLAIN_DEPENDENCY_GRAPH = gql`
  query ExplainDependencyGraph($packageId: ID!) {
    explainDependencyGraph(packageId: $packageId)
  }
`;


// ═══════════════════════════════════════════════════════════════
// FRAGMENTS
// ═══════════════════════════════════════════════════════════════

export const PACKAGE_FRAGMENT = gql`
  fragment PackageFields on Package {
    id
    name
    ecosystem
  }
`;

export const PACKAGE_EDGE_FRAGMENT = gql`
  fragment PackageEdgeFields on PackageEdge {
    node {
      ...PackageFields
    }
    cursor
    depth
  }
  ${PACKAGE_FRAGMENT}
`;

// ═══════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════

export const GET_PACKAGE = gql`
  query GetPackage($id: ID!) {
    package(id: $id) {
      ...PackageFields
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_REVERSE_DEPENDENTS = gql`
  query GetReverseDependents(
    $packageId: ID!
    $maxDepth: Int = 2
    $first: Int = 50
    $after: String
  ) {
    reverseDependents(
      packageId: $packageId
      maxDepth: $maxDepth
      first: $first
      after: $after
    ) {
      edges {
        ...PackageEdgeFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
  ${PACKAGE_EDGE_FRAGMENT}
`;

export const GET_DEPENDENCY_PATH = gql`
  query GetDependencyPath(
    $fromPackageId: ID!
    $toPackageId: ID!
    $maxHops: Int = 6
  ) {
    dependencyPath(
      fromPackageId: $fromPackageId
      toPackageId: $toPackageId
      maxHops: $maxHops
    ) {
      found
      hops
      packages {
        ...PackageFields
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_IMPACT_RADIUS = gql`
  query GetImpactRadius(
    $packageId: ID!
    $vulnerableVersionRange: String
    $maxDepth: Int = 3
    $limit: Int = 100
  ) {
    impactRadius(
      packageId: $packageId
      vulnerableVersionRange: $vulnerableVersionRange
      maxDepth: $maxDepth
      limit: $limit
    ) {
      packageId
      vulnerableVersionRange
      maxDepth
      impactedPackages
      impactedVersions
      topImpacted {
        package {
          ...PackageFields
        }
        depth
        estimatedAffectedVersions
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

export const GET_GRAPH_STATS = gql`
  query GetGraphStats {
    graphStats {
      totalPackages
      totalVersions
      totalDependencies
      totalPackageDependencies
      ecosystemBreakdown {
        ecosystem
        count
      }
    }
  }
`;

// Search packages by name (fuzzy search)
export const SEARCH_PACKAGES = gql`
  query SearchPackages(
    $query: String!
    $ecosystem: Ecosystem
    $first: Int = 20
    $after: String
  ) {
    searchPackages(
      query: $query
      ecosystem: $ecosystem
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...PackageFields
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
  ${PACKAGE_FRAGMENT}
`;

// Semantic search packages by meaning (vector search)
export const SEMANTIC_SEARCH_PACKAGES = gql`
  query SemanticSearchPackages(
    $query: String!
    $ecosystem: Ecosystem
    $first: Int = 20
    $after: String
  ) {
    semanticSearchPackages(
      query: $query
      ecosystem: $ecosystem
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...PackageFields
        }
        cursor
        score
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Get package with versions and dependencies count
export const GET_PACKAGE_DETAILS = gql`
  query GetPackageDetails($id: ID!) {
    package(id: $id) {
      ...PackageFields
    }
    reverseDependents(packageId: $id, maxDepth: 1, first: 1) {
      totalCount
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTIONS (if WebSocket available)
// ═══════════════════════════════════════════════════════════════

export const VERSION_EVENTS_SUBSCRIPTION = gql`
  subscription OnVersionEvent($ecosystems: [Ecosystem!]) {
    versionEvents(ecosystems: $ecosystems) {
      meta {
        eventId
        occurredAt
        source
      }
      package {
        ...PackageFields
      }
      version {
        id
        packageId
        version
        publishedAt
        yanked
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Real-time package activity subscription (matches backend newVersion)
export const NEW_VERSION_SUBSCRIPTION = gql`
  subscription OnNewVersion(
    $ecosystem: Ecosystem
    $packageId: ID
  ) {
    newVersion(ecosystem: $ecosystem, packageId: $packageId) {
      meta {
        eventId
        occurredAt
        source
      }
      package {
        ...PackageFields
      }
      version {
        id
        packageId
        version
        publishedAt
        yanked
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Alias for backwards compatibility
export const LIVE_PACKAGE_ACTIVITY = NEW_VERSION_SUBSCRIPTION;

// Breaking change detection subscription
export const BREAKING_CHANGE_DETECTED = gql`
  subscription OnBreakingChangeDetected(
    $ecosystem: Ecosystem
    $packageId: ID
    $minSeverity: BreakingSeverity
  ) {
    breakingChangeDetected(
      ecosystem: $ecosystem
      packageId: $packageId
      minSeverity: $minSeverity
    ) {
      timestamp
      package {
        ...PackageFields
      }
      fromVersion
      toVersion
      severity
      changes {
        changeType
        description
        path
        oldSignature
        newSignature
      }
      affectedDependents
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Live platform statistics subscription
export const LIVE_STATS = gql`
  subscription OnLiveStats {
    liveStats {
      timestamp
      packagesIndexed
      versionsIndexed
      dependenciesTracked
      eventsPerMinute
      activeConnections
      topEcosystems {
        ecosystem
        count
        change24h
      }
    }
  }
`;

// Dependency impact subscription
export const DEPENDENCY_IMPACT = gql`
  subscription OnDependencyImpact(
    $ecosystem: Ecosystem
    $minImpactScore: Float
  ) {
    dependencyImpact(ecosystem: $ecosystem, minImpactScore: $minImpactScore) {
      timestamp
      package {
        ...PackageFields
      }
      version
      impactScore
      affectedPackages
      affectedVersions
      criticalPath
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Watch specific packages for updates (alias for newVersion with packageId)
export const WATCH_PACKAGES = gql`
  subscription OnWatchPackages($packageId: ID!) {
    newVersion(packageId: $packageId) {
      meta {
        eventId
        occurredAt
        source
      }
      package {
        ...PackageFields
      }
      version {
        id
        packageId
        version
        publishedAt
        yanked
      }
    }
  }
  ${PACKAGE_FRAGMENT}
`;

// Dependency graph update subscription (for live graph updates)
export const DEPENDENCY_GRAPH_UPDATES = DEPENDENCY_IMPACT;

import { gql } from "@apollo/client";

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
    }
  }
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

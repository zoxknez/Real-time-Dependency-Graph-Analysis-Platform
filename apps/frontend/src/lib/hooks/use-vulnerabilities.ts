/**
 * Vulnerability & Reachability Hooks (P0 Features)
 * 
 * Custom hooks for vulnerability data fetching with:
 * - Apollo Client integration
 * - Optimistic updates
 * - Error handling
 * - Loading states
 */

import { useQuery, useLazyQuery } from "@apollo/client";
import { useMemo, useCallback, useState } from "react";
import {
  GET_TRANSITIVE_PATHS,
  GET_REVERSE_DEPENDENTS_EXTENDED,
  GET_VULNERABILITY_COUNTS,
  GET_VULNERABILITIES,
} from "../graphql/queries";
import type {
  GetTransitivePathsVariables,
  GetTransitivePathsResponse,
  GetReverseDependentsExtendedVariables,
  GetReverseDependentsExtendedResponse,
  GetVulnerabilityCountsVariables,
  GetVulnerabilityCountsResponse,
  GetVulnerabilitiesVariables,
  GetVulnerabilitiesResponse,
  VulnerabilityFinding,
  SeverityCounts,
  DependencyRelationship,
} from "../graphql/types";

/**
 * Hook for fetching transitive paths between packages
 * Shows how a dependency was introduced (GitHub-style)
 */
export function useTransitivePaths(
  packageId: string | undefined,
  targetPackageId: string | undefined,
  options?: { maxDepth?: number; first?: number }
) {
  const { data, loading, error, refetch } = useQuery<
    GetTransitivePathsResponse,
    GetTransitivePathsVariables
  >(GET_TRANSITIVE_PATHS, {
    variables: {
      packageId: packageId || "",
      targetPackageId: targetPackageId || "",
      maxDepth: options?.maxDepth ?? 6,
      first: options?.first ?? 10,
    },
    skip: !packageId || !targetPackageId,
    fetchPolicy: "cache-first",
  });

  const paths = useMemo(() => data?.transitivePaths ?? [], [data]);

  return {
    paths,
    loading,
    error,
    refetch,
    hasData: paths.length > 0,
  };
}

/**
 * Hook for extended reverse dependents with relationship info
 * Shows DIRECT vs TRANSITIVE badges and introduced_by info
 */
export function useReverseDependentsExtended(
  packageId: string | undefined,
  options?: {
    maxDepth?: number;
    relationship?: DependencyRelationship;
    first?: number;
  }
) {
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, loading, error, fetchMore, refetch } = useQuery<
    GetReverseDependentsExtendedResponse,
    GetReverseDependentsExtendedVariables
  >(GET_REVERSE_DEPENDENTS_EXTENDED, {
    variables: {
      packageId: packageId || "",
      maxDepth: options?.maxDepth ?? 2,
      relationship: options?.relationship,
      first: options?.first ?? 50,
      after: cursor,
    },
    skip: !packageId,
    fetchPolicy: "cache-first",
  });

  const edges = useMemo(
    () => data?.reverseDependentsExtended.edges ?? [],
    [data]
  );
  const pageInfo = data?.reverseDependentsExtended.pageInfo;
  const totalCount = data?.reverseDependentsExtended.totalCount ?? 0;

  const loadMore = useCallback(() => {
    if (pageInfo?.hasNextPage && pageInfo.endCursor) {
      setCursor(pageInfo.endCursor);
      fetchMore({
        variables: { after: pageInfo.endCursor },
      });
    }
  }, [pageInfo, fetchMore]);

  // Separate direct and transitive
  const { directDeps, transitiveDeps } = useMemo(() => {
    const direct = edges.filter((e) => e.relationship === "DIRECT");
    const transitive = edges.filter((e) => e.relationship === "TRANSITIVE");
    return { directDeps: direct, transitiveDeps: transitive };
  }, [edges]);

  return {
    edges,
    directDeps,
    transitiveDeps,
    totalCount,
    loading,
    error,
    hasNextPage: pageInfo?.hasNextPage ?? false,
    loadMore,
    refetch,
  };
}

/**
 * Hook for vulnerability severity counts (for filter badges)
 */
export function useVulnerabilityCounts(
  packageId: string | undefined,
  includeTransitive = true
) {
  const { data, loading, error, refetch } = useQuery<
    GetVulnerabilityCountsResponse,
    GetVulnerabilityCountsVariables
  >(GET_VULNERABILITY_COUNTS, {
    variables: {
      packageId: packageId || "",
      includeTransitive,
    },
    skip: !packageId,
    fetchPolicy: "cache-first",
  });

  const counts: SeverityCounts = useMemo(
    () =>
      data?.vulnerabilityCounts ?? {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    [data]
  );

  const total = useMemo(
    () => counts.critical + counts.high + counts.medium + counts.low,
    [counts]
  );

  return {
    counts,
    total,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching vulnerabilities with filters
 * Supports severity, reachability, and exploit filters
 */
export function useVulnerabilities(
  packageId: string | undefined,
  options?: {
    filter?: GetVulnerabilitiesVariables["filter"];
    first?: number;
  }
) {
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, loading, error, fetchMore, refetch } = useQuery<
    GetVulnerabilitiesResponse,
    GetVulnerabilitiesVariables
  >(GET_VULNERABILITIES, {
    variables: {
      packageId: packageId || "",
      filter: options?.filter,
      first: options?.first ?? 20,
      after: cursor,
    },
    skip: !packageId,
    fetchPolicy: "cache-first",
  });

  const vulnerabilities = useMemo(
    () => data?.vulnerabilities.edges.map((e) => e.node) ?? [],
    [data]
  );
  const pageInfo = data?.vulnerabilities.pageInfo;
  const totalCount = data?.vulnerabilities.totalCount ?? 0;

  const loadMore = useCallback(() => {
    if (pageInfo?.hasNextPage && pageInfo.endCursor) {
      setCursor(pageInfo.endCursor);
      fetchMore({
        variables: { after: pageInfo.endCursor },
      });
    }
  }, [pageInfo, fetchMore]);

  // Group by severity for quick access
  const bySeverity = useMemo(() => {
    const groups: Record<string, VulnerabilityFinding[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };
    for (const vuln of vulnerabilities) {
      groups[vuln.severity]?.push(vuln);
    }
    return groups;
  }, [vulnerabilities]);

  // Reachable vulnerabilities
  const reachableVulns = useMemo(
    () => vulnerabilities.filter((v) => v.reachability.status === "REACHABLE"),
    [vulnerabilities]
  );

  return {
    vulnerabilities,
    bySeverity,
    reachableVulns,
    totalCount,
    loading,
    error,
    hasNextPage: pageInfo?.hasNextPage ?? false,
    loadMore,
    refetch,
  };
}

/**
 * Lazy query hook for on-demand path discovery
 * Used for "Show paths" button in vulnerability details
 */
export function useLazyTransitivePaths() {
  const [getPaths, { data, loading, error }] = useLazyQuery<
    GetTransitivePathsResponse,
    GetTransitivePathsVariables
  >(GET_TRANSITIVE_PATHS);

  const fetchPaths = useCallback(
    (packageId: string, targetPackageId: string, maxDepth = 6) => {
      return getPaths({
        variables: { packageId, targetPackageId, maxDepth, first: 10 },
      });
    },
    [getPaths]
  );

  const paths = useMemo(() => data?.transitivePaths ?? [], [data]);

  return {
    fetchPaths,
    paths,
    loading,
    error,
  };
}

/**
 * Combined hook for vulnerability dashboard
 * Fetches counts and vulnerabilities in one go
 */
export function useVulnerabilityDashboard(packageId: string | undefined) {
  const countsQuery = useVulnerabilityCounts(packageId);
  const vulnsQuery = useVulnerabilities(packageId);

  return {
    counts: countsQuery.counts,
    total: countsQuery.total,
    vulnerabilities: vulnsQuery.vulnerabilities,
    reachableVulns: vulnsQuery.reachableVulns,
    loading: countsQuery.loading || vulnsQuery.loading,
    error: countsQuery.error || vulnsQuery.error,
    refetch: () => {
      countsQuery.refetch();
      vulnsQuery.refetch();
    },
  };
}

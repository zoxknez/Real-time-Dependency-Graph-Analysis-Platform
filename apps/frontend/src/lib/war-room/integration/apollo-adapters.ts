/**
 * War Room Apollo Client Integration Adapters
 *
 * Implements PackageCatalogPort and GraphQueryPort using existing Apollo queries (WMCP-2C).
 */

import {
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
} from "../application/ports";
import {
  WarRoomSecurityContext,
  SearchPackagesRequest,
  InspectPackageRequest,
  TraceDependencyPathRequest,
  OpenPackageGraphRequest,
  WarRoomServiceResult,
  WarRoomPackageSearchResult,
  WarRoomPackageInspection,
  WarRoomDependencyPath,
} from "../application/types";
import {
  WarRoomGraphContext,
  WarRoomPackageRef,
  PackageEcosystem,
} from "../domain/types";
import {
  createDomainError,
  notFoundError,
} from "../domain/errors";
import { WarRoomApolloClient } from "./apollo-client-port";
import {
  WarRoomGraphProjectionStore,
  WarRoomProjectionNode,
  WarRoomProjectionLink,
} from "./graph-projection";
import {
  GET_PACKAGE,
  GET_REVERSE_DEPENDENTS,
  GET_DEPENDENCY_PATH,
  SEARCH_PACKAGES,
} from "../../graphql/queries";
import {
  GetPackageResponse,
  GetReverseDependentsResponse,
  GetDependencyPathResponse,
  SearchPackagesResponse,
} from "../../graphql/types";

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "AbortError"
  );
}

export function createApolloPackageCatalogPort(
  client: WarRoomApolloClient
): WarRoomPackageCatalogPort {
  return {
    async searchPackages(
      _sec: WarRoomSecurityContext,
      request: SearchPackagesRequest,
      signal?: AbortSignal
    ): Promise<WarRoomServiceResult<WarRoomPackageSearchResult>> {
      try {
        const result = await client.query<SearchPackagesResponse>({
          query: SEARCH_PACKAGES,
          variables: {
            query: request.query,
            ecosystem: request.ecosystem,
            first: request.limit ?? 20,
          },
          context: {
            fetchOptions: {
              signal,
            },
          },
          errorPolicy: "all",
        });

        if (signal?.aborted) {
          return { ok: false, error: createDomainError("CANCELLED", "Search operation was cancelled") };
        }

        if (result.error && !result.data?.searchPackages) {
          return {
            ok: false,
            error: createDomainError("UNAVAILABLE", "Package search service encountered transport error"),
          };
        }

        const edges = result.data?.searchPackages?.edges || [];
        const packages: WarRoomPackageRef[] = [];

        for (const edge of edges) {
          if (edge?.node?.id && edge.node.name) {
            packages.push({
              id: edge.node.id,
              name: edge.node.name,
              ecosystem: (edge.node.ecosystem || "UNKNOWN") as PackageEcosystem,
            });
          }
        }

        return {
          ok: true,
          data: {
            packages,
            totalCount: result.data?.searchPackages?.totalCount ?? packages.length,
          },
        };
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) {
          return { ok: false, error: createDomainError("CANCELLED", "Search operation was cancelled") };
        }
        return {
          ok: false,
          error: createDomainError("UNAVAILABLE", "Failed to query package search service"),
        };
      }
    },

    async inspectPackage(
      _sec: WarRoomSecurityContext,
      _request: InspectPackageRequest,
      _signal?: AbortSignal
    ): Promise<WarRoomServiceResult<WarRoomPackageInspection>> {
      return {
        ok: false,
        error: createDomainError(
          "UNAVAILABLE",
          "Complete package inspection with direct dependencies is not available in baseline GraphQL query surface"
        ),
      };
    },
  };
}

export function createApolloGraphQueryPort(
  client: WarRoomApolloClient,
  projectionStore?: WarRoomGraphProjectionStore
): WarRoomGraphQueryPort {
  return {
    async loadPackageGraph(
      _sec: WarRoomSecurityContext,
      request: OpenPackageGraphRequest,
      signal?: AbortSignal
    ): Promise<WarRoomServiceResult<WarRoomGraphContext>> {
      const depth = request.depth ?? 2;
      const graphId = `reverse:${request.rootPackageId}:depth:${depth}`;
      const sequence = projectionStore?.nextSequence(graphId) ?? 0;

      try {
        // 1. Query root package truth
        const rootRes = await client.query<GetPackageResponse>({
          query: GET_PACKAGE,
          variables: { id: request.rootPackageId },
          context: { fetchOptions: { signal } },
          errorPolicy: "all",
        });

        if (signal?.aborted) {
          return { ok: false, error: createDomainError("CANCELLED", "Graph query cancelled") };
        }

        if (!rootRes.data?.package || !rootRes.data.package.id || !rootRes.data.package.name) {
          return { ok: false, error: notFoundError(`Root package ${request.rootPackageId} not found`) };
        }

        const rootPackage: WarRoomPackageRef = {
          id: rootRes.data.package.id,
          name: rootRes.data.package.name,
          ecosystem: (rootRes.data.package.ecosystem || "UNKNOWN") as PackageEcosystem,
        };

        // 2. Query reverse dependents
        const revRes = await client.query<GetReverseDependentsResponse>({
          query: GET_REVERSE_DEPENDENTS,
          variables: {
            packageId: request.rootPackageId,
            maxDepth: depth,
            first: 100,
          },
          context: { fetchOptions: { signal } },
          errorPolicy: "all",
        });

        if (signal?.aborted) {
          return { ok: false, error: createDomainError("CANCELLED", "Graph query cancelled") };
        }

        if (revRes.error && !revRes.data?.reverseDependents) {
          return {
            ok: false,
            error: createDomainError("UNAVAILABLE", "Failed to retrieve reverse dependents from graph service"),
          };
        }

        const edges = revRes.data?.reverseDependents?.edges || [];
        const totalCount = revRes.data?.reverseDependents?.totalCount ?? edges.length;

        // 3. Build canonical package IDs & projection
        const packageIdSet = new Set<string>([rootPackage.id]);
        const nodesMap = new Map<string, WarRoomProjectionNode>();
        const links: WarRoomProjectionLink[] = [];

        nodesMap.set(rootPackage.id, {
          id: rootPackage.id,
          name: rootPackage.name,
          ecosystem: rootPackage.ecosystem,
          depth: 0,
          isRoot: true,
        });

        for (const edge of edges) {
          const node = edge?.node;
          if (node?.id && node.name) {
            packageIdSet.add(node.id);

            if (!nodesMap.has(node.id)) {
              nodesMap.set(node.id, {
                id: node.id,
                name: node.name,
                ecosystem: (node.ecosystem || "UNKNOWN") as PackageEcosystem,
                depth: edge.depth || 1,
                isRoot: false,
              });
            }

            links.push({
              source: node.id,
              target: rootPackage.id,
              kind: "REVERSE_REACHABILITY",
            });
          }
        }

        const projectionNodes = Array.from(nodesMap.values());

        // 4. Update projection store if provided
        if (projectionStore) {
          projectionStore.setProjection(
            {
              graphId,
              rootPackageId: rootPackage.id,
              depth,
              nodes: projectionNodes,
              links,
              loadedCount: projectionNodes.length,
              totalCount,
              truncated: totalCount > projectionNodes.length,
            },
            sequence
          );
        }

        // 5. Return canonical WarRoomGraphContext
        return {
          ok: true,
          data: {
            id: graphId,
            rootPackage,
            packageIds: Array.from(packageIdSet),
          },
        };
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) {
          return { ok: false, error: createDomainError("CANCELLED", "Graph query cancelled") };
        }
        return {
          ok: false,
          error: createDomainError("UNAVAILABLE", "Failed to query graph backend"),
        };
      }
    },

    async traceDependencyPath(
      _sec: WarRoomSecurityContext,
      request: TraceDependencyPathRequest,
      signal?: AbortSignal
    ): Promise<WarRoomServiceResult<WarRoomDependencyPath>> {
      try {
        const res = await client.query<GetDependencyPathResponse>({
          query: GET_DEPENDENCY_PATH,
          variables: {
            fromPackageId: request.fromPackageId,
            toPackageId: request.toPackageId,
            maxHops: request.maxHops ?? 6,
          },
          context: { fetchOptions: { signal } },
          errorPolicy: "all",
        });

        if (signal?.aborted) {
          return { ok: false, error: createDomainError("CANCELLED", "Dependency path query cancelled") };
        }

        if (!res.data?.dependencyPath || !res.data.dependencyPath.found) {
          return {
            ok: false,
            error: notFoundError(`Dependency path from ${request.fromPackageId} to ${request.toPackageId} not found`),
          };
        }

        const pathData = res.data.dependencyPath;
        const packageIds = (pathData.packages || [])
          .map((p: { id?: string | null } | null) => p?.id)
          .filter((id: string | null | undefined): id is string => typeof id === "string");

        return {
          ok: true,
          data: {
            fromPackageId: request.fromPackageId,
            toPackageId: request.toPackageId,
            packageIds,
            hopCount: pathData.hops ?? packageIds.length,
          },
        };
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) {
          return { ok: false, error: createDomainError("CANCELLED", "Dependency path query cancelled") };
        }
        return {
          ok: false,
          error: createDomainError("UNAVAILABLE", "Failed to trace dependency path"),
        };
      }
    },
  };
}

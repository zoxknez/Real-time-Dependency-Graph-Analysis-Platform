/**
 * War Room Apollo Client Integration Adapters
 *
 * Implements PackageCatalogPort and GraphQueryPort using existing Apollo queries (WMCP-2C-R2).
 * Enforces strict Apollo error normalization, strict canonical ecosystem validation, and staged projection lifecycle.
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
  DirectDependentRecord,
} from "../domain/types";
import {
  createDomainError,
  notFoundError,
} from "../domain/errors";
import {
  WarRoomApolloClient,
  WarRoomApolloQueryResult,
} from "./apollo-client-port";
import {
  WarRoomGraphProjectionStore,
  WarRoomProjectionNode,
  WarRoomProjectionLink,
  WarRoomGraphProjection,
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

export function hasApolloExecutionError(result: WarRoomApolloQueryResult<unknown>): boolean {
  if (result.error != null) {
    return true;
  }
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    return true;
  }
  return false;
}

/**
 * Strict canonical ecosystem parser (WMCP-2C-R2).
 * Accepts ONLY exact canonical GraphQL enum strings.
 * Disallows normalization, lowercasing, whitespace trimming, or aliases.
 */
export function parsePackageEcosystem(value: unknown): PackageEcosystem | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "NPM":
    case "PY_PI":
    case "CARGO":
    case "MAVEN":
    case "NU_GET":
    case "GO":
      return value;
    default:
      return null;
  }
}

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

        if (hasApolloExecutionError(result)) {
          return {
            ok: false,
            error: createDomainError("UNAVAILABLE", "Package search service encountered transport error"),
          };
        }

        if (!result.data || typeof result.data !== "object" || !result.data.searchPackages || typeof result.data.searchPackages !== "object") {
          return {
            ok: false,
            error: createDomainError("INTERNAL_ERROR", "Search packages response missing or malformed"),
          };
        }

        const edges = result.data.searchPackages.edges;
        if (!Array.isArray(edges)) {
          return {
            ok: false,
            error: createDomainError("INTERNAL_ERROR", "Search packages edges field is not an array"),
          };
        }

        const packages: WarRoomPackageRef[] = [];
        for (const edge of edges) {
          const node = edge?.node;
          if (!node || typeof node !== "object") {
            return {
              ok: false,
              error: createDomainError("INTERNAL_ERROR", "Search packages edge contains malformed node"),
            };
          }

          const id = typeof node.id === "string" ? node.id.trim() : "";
          const name = typeof node.name === "string" ? node.name.trim() : "";
          const ecosystem = parsePackageEcosystem(node.ecosystem);

          if (!id || !name || !ecosystem) {
            return {
              ok: false,
              error: createDomainError("INTERNAL_ERROR", "Search packages node has invalid identity or ecosystem"),
            };
          }

          packages.push({ id, name, ecosystem });
        }

        return {
          ok: true,
          data: {
            packages,
            totalCount: result.data.searchPackages.totalCount ?? packages.length,
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

        if (hasApolloExecutionError(rootRes)) {
          return {
            ok: false,
            error: createDomainError("UNAVAILABLE", "Root package service encountered transport error"),
          };
        }

        if (rootRes.data?.package === null) {
          return { ok: false, error: notFoundError(`Root package ${request.rootPackageId} not found`) };
        }

        if (!rootRes.data || typeof rootRes.data !== "object" || !rootRes.data.package || typeof rootRes.data.package !== "object") {
          return { ok: false, error: createDomainError("INTERNAL_ERROR", "Root package payload missing or malformed") };
        }

        const rawRoot = rootRes.data.package;
        const rootId = typeof rawRoot.id === "string" ? rawRoot.id.trim() : "";
        const rootName = typeof rawRoot.name === "string" ? rawRoot.name.trim() : "";
        const rootEcosystem = parsePackageEcosystem(rawRoot.ecosystem);

        if (!rootId || !rootName || !rootEcosystem) {
          return { ok: false, error: createDomainError("INTERNAL_ERROR", "Root package has invalid identity or ecosystem") };
        }

        if (rootId !== request.rootPackageId.trim()) {
          return {
            ok: false,
            error: createDomainError("INTERNAL_ERROR", "Returned root package ID does not match requested root package ID"),
          };
        }

        const rootPackage: WarRoomPackageRef = {
          id: rootId,
          name: rootName,
          ecosystem: rootEcosystem,
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

        // Strict partial-data rule: if Apollo reports ANY execution error, reject entire reverse dependents
        if (hasApolloExecutionError(revRes)) {
          return {
            ok: false,
            error: createDomainError("UNAVAILABLE", "Failed to retrieve reverse dependents from graph service"),
          };
        }

        if (!revRes.data || typeof revRes.data !== "object" || !revRes.data.reverseDependents || typeof revRes.data.reverseDependents !== "object") {
          return {
            ok: false,
            error: createDomainError("INTERNAL_ERROR", "Reverse dependents response missing or malformed"),
          };
        }

        const edges = revRes.data.reverseDependents.edges;
        if (!Array.isArray(edges)) {
          return {
            ok: false,
            error: createDomainError("INTERNAL_ERROR", "Reverse dependents edges field is not an array"),
          };
        }

        const totalCount = typeof revRes.data.reverseDependents.totalCount === "number"
          ? revRes.data.reverseDependents.totalCount
          : edges.length;

        // 3. Build canonical package IDs & projection
        const packageIdSet = new Set<string>([rootPackage.id]);
        const dependentIdSet = new Set<string>();
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
          if (!node || typeof node !== "object") {
            return {
              ok: false,
              error: createDomainError("INTERNAL_ERROR", "Reverse dependents edge contains malformed node"),
            };
          }

          const nodeId = typeof node.id === "string" ? node.id.trim() : "";
          const nodeName = typeof node.name === "string" ? node.name.trim() : "";
          const nodeEcosystem = parsePackageEcosystem(node.ecosystem);

          if (!nodeId || !nodeName || !nodeEcosystem) {
            return {
              ok: false,
              error: createDomainError("INTERNAL_ERROR", "Reverse dependents node has invalid identity or ecosystem"),
            };
          }

          packageIdSet.add(nodeId);
          if (nodeId !== rootPackage.id) {
            dependentIdSet.add(nodeId);
          }

          if (!nodesMap.has(nodeId)) {
            nodesMap.set(nodeId, {
              id: nodeId,
              name: nodeName,
              ecosystem: nodeEcosystem,
              depth: edge.depth || 1,
              isRoot: false,
            });
          }

          links.push({
            source: nodeId,
            target: rootPackage.id,
            kind: "REVERSE_REACHABILITY",
          });
        }

        const projectionNodes = Array.from(nodesMap.values());
        const loadedCount = dependentIdSet.size;

        const projection: WarRoomGraphProjection = {
          graphId,
          rootPackageId: rootPackage.id,
          depth,
          nodes: projectionNodes,
          links,
          loadedCount,
          totalCount,
          truncated: totalCount > loadedCount,
        };

        // 4. STAGE projection candidate if signal is provided (No immediate publication!)
        if (signal && projectionStore) {
          projectionStore.stageProjection(signal, projection, sequence);
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

        if (hasApolloExecutionError(res)) {
          return {
            ok: false,
            error: createDomainError("UNAVAILABLE", "Dependency path service encountered transport error"),
          };
        }

        if (!res.data || typeof res.data !== "object" || !res.data.dependencyPath || typeof res.data.dependencyPath !== "object") {
          return {
            ok: false,
            error: createDomainError("INTERNAL_ERROR", "Dependency path response missing or malformed"),
          };
        }

        if (res.data.dependencyPath.found === false) {
          return {
            ok: false,
            error: notFoundError(`Dependency path from ${request.fromPackageId} to ${request.toPackageId} not found`),
          };
        }

        const pathData = res.data.dependencyPath;
        if (!Array.isArray(pathData.packages)) {
          return {
            ok: false,
            error: createDomainError("INTERNAL_ERROR", "Dependency path packages field is not an array"),
          };
        }

        const packageIds: string[] = [];
        for (const pkg of pathData.packages) {
          const pkgId = typeof pkg?.id === "string" ? pkg.id.trim() : "";
          if (!pkgId) {
            return {
              ok: false,
              error: createDomainError("INTERNAL_ERROR", "Dependency path package item has invalid ID"),
            };
          }
          packageIds.push(pkgId);
        }

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

    getDirectDependents: async (
      _securityContext: WarRoomSecurityContext,
      request: import("../application/ports").GetDirectDependentsRequest,
      signal?: AbortSignal
    ): Promise<WarRoomServiceResult<readonly DirectDependentRecord[]>> => {
      try {
        if (signal?.aborted) {
          return { ok: false, error: createDomainError("CANCELLED", "Graph query cancelled") };
        }

        const revRes = await client.query<GetReverseDependentsResponse>({
          query: GET_REVERSE_DEPENDENTS,
          variables: {
            packageId: request.packageId,
            maxDepth: 1,
            first: 100,
          },
          context: { fetchOptions: { signal } },
          errorPolicy: "all",
        });

        if (signal?.aborted) {
          return { ok: false, error: createDomainError("CANCELLED", "Graph query cancelled") };
        }

        if (hasApolloExecutionError(revRes)) {
          return {
            ok: false,
            error: createDomainError("UNAVAILABLE", "Failed to retrieve reverse dependents from graph service"),
          };
        }

        if (!revRes.data?.reverseDependents?.edges) {
          return { ok: true, data: [] };
        }

        const records: DirectDependentRecord[] = [];
        for (const edge of revRes.data.reverseDependents.edges) {
          const node = edge?.node;
          if (!node || !node.id) continue;
          const ecosystem = parsePackageEcosystem(node.ecosystem);
          if (!ecosystem) continue;
          records.push({
            dependentPackageId: node.id,
            name: node.name ?? node.id,
            ecosystem,
            rawRequirement: (edge as unknown as { rawRequirement?: string })?.rawRequirement,
            depth: edge.depth ?? 1,
          });
        }

        return { ok: true, data: records };
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) {
          return { ok: false, error: createDomainError("CANCELLED", "Query cancelled") };
        }
        return {
          ok: false,
          error: createDomainError("UNAVAILABLE", "Failed to query direct dependents"),
        };
      }
    },
  };
}

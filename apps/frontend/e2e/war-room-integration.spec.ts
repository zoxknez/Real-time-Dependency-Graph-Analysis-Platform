/**
 * War Room Integration Layer Verification Tests
 *
 * Deterministic tests for Apollo adapters, public workspace security/auth,
 * projection store, and provider composition (WMCP-2C, Section 66, 67, 113).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  createPublicWorkspaceSecurityContextPort,
  createPublicWorkspaceAuthorizationPort,
  createGraphProjectionStore,
  createApolloPackageCatalogPort,
  createApolloGraphQueryPort,
  createUnavailableScenarioAnalysisPort,
  createUnavailableMigrationPlanningPort,
  createWarRoomStore,
  createWarRoomStatePort,
  createWarRoomActions,
  WarRoomApolloClient,
  WarRoomApolloQueryOptions,
} from "../src/lib/war-room";

function getOperationName(query: any): string | undefined {
  return query?.definitions?.[0]?.name?.value;
}

function createMockApolloClient(
  handler: (options: WarRoomApolloQueryOptions<any>) => Promise<any>
): { client: WarRoomApolloClient; queriedOptions: WarRoomApolloQueryOptions<any>[] } {
  const queriedOptions: WarRoomApolloQueryOptions<any>[] = [];
  const client: WarRoomApolloClient = {
    async query<TData = unknown, TVariables = any>(options: WarRoomApolloQueryOptions<TVariables>) {
      queriedOptions.push(options);
      return handler(options);
    },
  };
  return { client, queriedOptions };
}

test.describe("War Room Integration Layer (WMCP-2C)", () => {
  test("1. Public workspace security adapter returns explicit sentinel", async () => {
    const secPort = createPublicWorkspaceSecurityContextPort();
    const result = await secPort.getSecurityContext();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tenantId).toBe("public");
      expect(result.data.userId).toBe("public");
      expect(result.data.organizationId).toBeUndefined();
    }
  });

  test("2. Sentinel is not placed in GraphQL variables or auth headers", async () => {
    const { client, queriedOptions } = createMockApolloClient(async () => ({
      data: {
        searchPackages: {
          edges: [
            { node: { id: "npm:react", name: "react", ecosystem: "NPM" }, cursor: "c1" },
          ],
          totalCount: 1,
        },
      },
    }));

    const catalogPort = createApolloPackageCatalogPort(client);
    const sec = { tenantId: "public", userId: "public" };
    await catalogPort.searchPackages(sec, { query: "react", limit: 10 });

    expect(queriedOptions.length).toBe(1);
    const vars = queriedOptions[0].variables;
    expect(vars).not.toHaveProperty("tenantId");
    expect(vars).not.toHaveProperty("userId");
    expect(vars).not.toHaveProperty("tenant_id");
  });

  test("3. Authorization adapter receives no invocation channel and permits public actions", async () => {
    const authPort = createPublicWorkspaceAuthorizationPort();
    const sec = { tenantId: "public", userId: "public" };

    const result = await authPort.authorize({
      securityContext: sec,
      action: "OPEN_PACKAGE_GRAPH",
      resource: { rootPackageId: "cargo:tokio" },
    });

    expect(result.ok).toBe(true);
  });

  test("4. SEARCH_PACKAGES maps DTOs to WarRoomPackageRef", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: {
        searchPackages: {
          edges: [
            { node: { id: "npm:react", name: "react", ecosystem: "NPM" }, cursor: "c1" },
            { node: { id: "npm:react-dom", name: "react-dom", ecosystem: "NPM" }, cursor: "c2" },
          ],
          totalCount: 2,
        },
      },
    }));

    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "react" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.packages.length).toBe(2);
      expect(res.data.packages[0]).toEqual({ id: "npm:react", name: "react", ecosystem: "NPM" });
      expect(res.data.totalCount).toBe(2);
    }
  });

  test("5. Invalid/missing search data maps to typed failure", async () => {
    const { client } = createMockApolloClient(async () => ({
      errors: [{ message: "Search service unavailable" } as any],
    }));

    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
    }
  });

  test("6. inspectPackage returns truthful UNAVAILABLE if complete contract cannot be supplied", async () => {
    const { client } = createMockApolloClient(async () => ({ data: {} }));
    const catalogPort = createApolloPackageCatalogPort(client);

    const res = await catalogPort.inspectPackage({ tenantId: "public", userId: "public" }, { packageId: "npm:react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
      expect(res.error.message).toContain("Complete package inspection");
    }
  });

  test("7. GET_PACKAGE null maps NOT_FOUND", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: { package: null },
    }));

    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "cargo:missing-pkg" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("NOT_FOUND");
    }
  });

  test("8. Graph adapter maps root package and reverse dependents correctly", async () => {
    const projectionStore = createGraphProjectionStore();
    const { client } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "npm:react", name: "react", ecosystem: "NPM" } } };
      }
      if (op === "GetReverseDependents" || ("packageId" in (opt.variables || {}))) {
        return {
          data: {
            reverseDependents: {
              edges: [
                { node: { id: "npm:react-dom", name: "react-dom", ecosystem: "NPM" }, depth: 1 },
                { node: { id: "npm:next", name: "next", ecosystem: "NPM" }, depth: 2 },
              ],
              totalCount: 2,
            },
          },
        };
      }
      return { data: null };
    });

    const graphPort = createApolloGraphQueryPort(client, projectionStore);
    const res = await graphPort.loadPackageGraph(
      { tenantId: "public", userId: "public" },
      { rootPackageId: "npm:react", depth: 2 }
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe("reverse:npm:react:depth:2");
      expect(res.data.rootPackage).toEqual({ id: "npm:react", name: "react", ecosystem: "NPM" });
      expect(res.data.packageIds).toEqual(["npm:react", "npm:react-dom", "npm:next"]);
    }
  });

  test("9. Graph adapter deduplicates package IDs and canonical graph contains root ID", async () => {
    const { client } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "cargo:tokio", name: "tokio", ecosystem: "CARGO" } } };
      }
      if (op === "GetReverseDependents" || ("packageId" in (opt.variables || {}))) {
        return {
          data: {
            reverseDependents: {
              edges: [
                { node: { id: "cargo:tokio", name: "tokio", ecosystem: "CARGO" }, depth: 1 },
                { node: { id: "cargo:axum", name: "axum", ecosystem: "CARGO" }, depth: 1 },
                { node: { id: "cargo:axum", name: "axum", ecosystem: "CARGO" }, depth: 2 },
              ],
              totalCount: 3,
            },
          },
        };
      }
      return { data: null };
    });

    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph(
      { tenantId: "public", userId: "public" },
      { rootPackageId: "cargo:tokio" }
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.packageIds).toHaveLength(2);
      expect(res.data.packageIds).toContain("cargo:tokio");
      expect(res.data.packageIds).toContain("cargo:axum");
    }
  });

  test("10. Canonical graph ID is deterministic by root + depth", async () => {
    const { client } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "npm:vue", name: "vue", ecosystem: "NPM" } } };
      }
      return { data: { reverseDependents: { edges: [], totalCount: 0 } } };
    });

    const graphPort = createApolloGraphQueryPort(client);
    const res1 = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "npm:vue", depth: 3 });
    const res2 = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "npm:vue", depth: 3 });

    expect(res1.ok && res2.ok).toBe(true);
    if (res1.ok && res2.ok) {
      expect(res1.data.id).toBe("reverse:npm:vue:depth:3");
      expect(res1.data.id).toBe(res2.data.id);
    }
  });

  test("11. Graph projection contains no Apollo/THREE/D3 objects and records depth/truncation", async () => {
    const projectionStore = createGraphProjectionStore();
    const { client } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "npm:react", name: "react", ecosystem: "NPM" } } };
      }
      return {
        data: {
          reverseDependents: {
            edges: [
              { node: { id: "npm:react-dom", name: "react-dom", ecosystem: "NPM" }, depth: 1 },
            ],
            totalCount: 50, // total > loaded count => truncated
          },
        },
      };
    });

    const graphPort = createApolloGraphQueryPort(client, projectionStore);
    await graphPort.loadPackageGraph(
      { tenantId: "public", userId: "public" },
      { rootPackageId: "npm:react", depth: 2 }
    );

    const projection = projectionStore.getProjection("reverse:npm:react:depth:2");
    expect(projection).not.toBeNull();
    if (projection) {
      expect(projection.depth).toBe(2);
      expect(projection.loadedCount).toBe(2); // root + 1 dependent
      expect(projection.totalCount).toBe(50);
      expect(projection.truncated).toBe(true);
      expect(projection.links[0].kind).toBe("REVERSE_REACHABILITY");

      // Verify clean serializability
      expect(() => JSON.parse(JSON.stringify(projection))).not.toThrow();
    }
  });

  test("12. Trace path success maps correctly and found=false maps NOT_FOUND", async () => {
    const { client } = createMockApolloClient(async (opt) => {
      if (opt.variables.toPackageId === "npm:found") {
        return {
          data: {
            dependencyPath: {
              found: true,
              hops: 2,
              packages: [
                { id: "npm:root", name: "root", ecosystem: "NPM" },
                { id: "npm:mid", name: "mid", ecosystem: "NPM" },
                { id: "npm:found", name: "found", ecosystem: "NPM" },
              ],
            },
          },
        };
      }
      return { data: { dependencyPath: { found: false, hops: 0, packages: [] } } };
    });

    const graphPort = createApolloGraphQueryPort(client);
    const successRes = await graphPort.traceDependencyPath(
      { tenantId: "public", userId: "public" },
      { fromPackageId: "npm:root", toPackageId: "npm:found" }
    );
    expect(successRes.ok).toBe(true);
    if (successRes.ok) {
      expect(successRes.data.hopCount).toBe(2);
      expect(successRes.data.packageIds).toEqual(["npm:root", "npm:mid", "npm:found"]);
    }

    const notFoundRes = await graphPort.traceDependencyPath(
      { tenantId: "public", userId: "public" },
      { fromPackageId: "npm:root", toPackageId: "npm:missing" }
    );
    expect(notFoundRes.ok).toBe(false);
    if (!notFoundRes.ok) {
      expect(notFoundRes.error.code).toBe("NOT_FOUND");
    }
  });

  test("13. Scenario analysis and migration planning production ports return UNAVAILABLE", async () => {
    const analysisPort = createUnavailableScenarioAnalysisPort();
    const planPort = createUnavailableMigrationPlanningPort();

    const analysisRes = await analysisPort.recalculateScenario({ tenantId: "public", userId: "public" }, {} as any);
    expect(analysisRes.ok).toBe(false);
    if (analysisRes.error) {
      expect(analysisRes.error.code).toBe("UNAVAILABLE");
    }

    const planRes = await planPort.generateMigrationPlan({ tenantId: "public", userId: "public" }, {} as any);
    expect(planRes.ok).toBe(false);
    if (planRes.error) {
      expect(planRes.error.code).toBe("UNAVAILABLE");
    }
  });

  test("14. Same-key older projection cannot overwrite newer projection", () => {
    const projectionStore = createGraphProjectionStore();
    const graphKey = "reverse:npm:react:depth:2";

    const seq1 = projectionStore.nextSequence(graphKey); // 1
    const seq2 = projectionStore.nextSequence(graphKey); // 2

    // Commit newer sequence 2 first
    projectionStore.setProjection(
      {
        graphId: graphKey,
        rootPackageId: "npm:react",
        depth: 2,
        nodes: [{ id: "npm:react", name: "react", ecosystem: "NPM", depth: 0, isRoot: true }],
        links: [],
        loadedCount: 1,
        totalCount: 1,
        truncated: false,
      },
      seq2
    );

    // Attempt to commit older sequence 1
    projectionStore.setProjection(
      {
        graphId: graphKey,
        rootPackageId: "npm:react",
        depth: 2,
        nodes: [],
        links: [],
        loadedCount: 0,
        totalCount: 0,
        truncated: false,
      },
      seq1
    );

    // Projection should still be seq2
    const current = projectionStore.getProjection(graphKey);
    expect(current?.loadedCount).toBe(1);
  });

  test("15. Provider runtime composition: store, state port, actions, BOOTSTRAP -> IDLE initialization", () => {
    const store = createWarRoomStore();
    const statePort = createWarRoomStatePort(store);
    const actions = createWarRoomActions({
      statePort,
      securityContextPort: createPublicWorkspaceSecurityContextPort(),
      authorizationPort: createPublicWorkspaceAuthorizationPort(),
      packageCatalogPort: createApolloPackageCatalogPort({ query: async () => ({ data: null }) }),
      graphQueryPort: createApolloGraphQueryPort({ query: async () => ({ data: null }) }),
      scenarioAnalysisPort: createUnavailableScenarioAnalysisPort(),
      migrationPlanningPort: createUnavailableMigrationPlanningPort(),
    });

    expect(statePort.getState().phase).toBe("BOOTSTRAP");
    expect(statePort.getState().contextRevision).toBe(0);

    // Initialize
    const initRes = actions.initialize();
    expect(initRes.ok).toBe(true);
    expect(statePort.getState().phase).toBe("IDLE");
    expect(statePort.getState().contextRevision).toBe(1);

    // Repeated initialize does not reset or corrupt state
    const repeated = actions.initialize();
    expect(repeated.ok).toBe(false);
    expect(statePort.getState().phase).toBe("IDLE");
    expect(statePort.getState().contextRevision).toBe(1);
  });

  test("16. Static scan of graph/page.tsx: verify semantic Apollo queries removed and War Room actions used", () => {
    const pagePath = path.resolve(__dirname, "../src/app/graph/page.tsx");
    const content = fs.readFileSync(pagePath, "utf8");

    // Semantic query hooks must NOT be used for graph loading
    expect(content).not.toContain("useLazyQuery");
    expect(content).not.toContain("GET_REVERSE_DEPENDENTS");
    expect(content).not.toContain("getReverseDeps(");

    // Canonical direct mutations must NOT exist
    expect(content).not.toContain("statePort.transition(");
    expect(content).not.toContain("commitContextBound(");
    expect(content).not.toContain("store.setState(");

    // Hard-coded Impact High claim must NOT exist
    expect(content).not.toMatch(/Impact\s*<\/span>\s*<span[^>]*>\s*High\s*<\/span>/i);
    expect(content).not.toContain(">High<");

    // War Room actions and custom provider hooks must be used
    expect(content).toContain("useWarRoomActions");
    expect(content).toContain("useWarRoomSelector");
    expect(content).toContain("useHumanWarRoomInvocation");
    expect(content).toContain("useWarRoomGraphProjection");
  });
});

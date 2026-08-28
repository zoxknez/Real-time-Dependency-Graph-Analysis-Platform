/**
 * War Room Integration Layer Verification Tests (WMCP-2C-R2)
 *
 * Deterministic test suite covering Apollo error normalization, strict canonical ecosystem contract,
 * two-phase projection staging/activation lifecycle, sequence guards, and security isolation.
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
  hasApolloExecutionError,
  parsePackageEcosystem,
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

test.describe("War Room Integration Layer (WMCP-2C-R2)", () => {
  // ─── 1. Apollo Result Failure Helper & Strict Ecosystem Parsing ───
  test("1. hasApolloExecutionError correctly identifies both error and errors[] shapes", () => {
    expect(hasApolloExecutionError({ error: new Error("Network error") })).toBe(true);
    expect(hasApolloExecutionError({ errors: [{ message: "GraphQL resolver error" }] })).toBe(true);
    expect(hasApolloExecutionError({ errors: [] })).toBe(false);
    expect(hasApolloExecutionError({ data: { test: true } })).toBe(false);
  });

  test("2. parsePackageEcosystem accepts ONLY exact canonical enum values and rejects all lowercase/alias/untrimmed strings (WMCP-2C-R2)", () => {
    // Exact accepted values
    expect(parsePackageEcosystem("NPM")).toBe("NPM");
    expect(parsePackageEcosystem("PY_PI")).toBe("PY_PI");
    expect(parsePackageEcosystem("CARGO")).toBe("CARGO");
    expect(parsePackageEcosystem("MAVEN")).toBe("MAVEN");
    expect(parsePackageEcosystem("NU_GET")).toBe("NU_GET");
    expect(parsePackageEcosystem("GO")).toBe("GO");

    // Rejected: Lowercase, aliases, untrimmed, hyphens, and unknown
    expect(parsePackageEcosystem("npm")).toBeNull();
    expect(parsePackageEcosystem("pypi")).toBeNull();
    expect(parsePackageEcosystem("PYPI")).toBeNull();
    expect(parsePackageEcosystem("cargo")).toBeNull();
    expect(parsePackageEcosystem("nuget")).toBeNull();
    expect(parsePackageEcosystem("NUGET")).toBeNull();
    expect(parsePackageEcosystem("go")).toBeNull();
    expect(parsePackageEcosystem(" CARGO ")).toBeNull();
    expect(parsePackageEcosystem("py-pi")).toBeNull();
    expect(parsePackageEcosystem("UNKNOWN")).toBeNull();
    expect(parsePackageEcosystem("unknown")).toBeNull();
    expect(parsePackageEcosystem(null)).toBeNull();
    expect(parsePackageEcosystem(undefined)).toBeNull();
    expect(parsePackageEcosystem(123)).toBeNull();
  });

  // ─── 2. Search Packages Error Normalization & Truth ───
  test("3. searchPackages: Apollo singular error returns UNAVAILABLE", async () => {
    const { client } = createMockApolloClient(async () => ({
      error: new Error("Network failure"),
    }));
    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
    }
  });

  test("4. searchPackages: Apollo errors[] array returns UNAVAILABLE", async () => {
    const { client } = createMockApolloClient(async () => ({
      errors: [{ message: "Search service unavailable" }],
    }));
    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
    }
  });

  test("5. searchPackages: missing or malformed payload returns INTERNAL_ERROR", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: {},
    }));
    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INTERNAL_ERROR");
    }
  });

  test("6. searchPackages: non-canonical ecosystem (e.g. lowercase npm, PYPI alias) returns INTERNAL_ERROR", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: {
        searchPackages: {
          edges: [
            { node: { id: "npm:react", name: "react", ecosystem: "npm" } }, // lowercase forbidden
          ],
          totalCount: 1,
        },
      },
    }));
    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INTERNAL_ERROR");
    }
  });

  test("7. searchPackages: legitimate empty search returns SUCCESS with 0 packages", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: {
        searchPackages: {
          edges: [],
          totalCount: 0,
        },
      },
    }));
    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "nonexistent" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.packages).toEqual([]);
      expect(res.data.totalCount).toBe(0);
    }
  });

  test("8. searchPackages: valid exact canonical DTOs map to WarRoomPackageRef", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: {
        searchPackages: {
          edges: [
            { node: { id: "npm:react", name: "react", ecosystem: "NPM" } },
            { node: { id: "cargo:tokio", name: "tokio", ecosystem: "CARGO" } },
          ],
          totalCount: 2,
        },
      },
    }));
    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "test" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.packages).toEqual([
        { id: "npm:react", name: "react", ecosystem: "NPM" },
        { id: "cargo:tokio", name: "tokio", ecosystem: "CARGO" },
      ]);
      expect(res.data.totalCount).toBe(2);
    }
  });

  test("9. inspectPackage returns truthful UNAVAILABLE stub", async () => {
    const { client } = createMockApolloClient(async () => ({ data: {} }));
    const catalogPort = createApolloPackageCatalogPort(client);
    const res = await catalogPort.inspectPackage({ tenantId: "public", userId: "public" }, { packageId: "npm:react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
    }
  });

  // ─── 3. Graph Root & Reverse Dependents Error Normalization ───
  test("10. GET_PACKAGE: Apollo error returns UNAVAILABLE", async () => {
    const { client } = createMockApolloClient(async () => ({
      error: new Error("DB down"),
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "npm:react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
    }
  });

  test("11. GET_PACKAGE: package=null returns NOT_FOUND", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: { package: null },
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "npm:missing" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("NOT_FOUND");
    }
  });

  test("12. GET_PACKAGE: non-canonical root ecosystem (e.g. cargo lowercase) returns INTERNAL_ERROR", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: { package: { id: "cargo:tokio", name: "tokio", ecosystem: "cargo" } }, // lowercase forbidden
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "cargo:tokio" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INTERNAL_ERROR");
    }
  });

  test("13. GET_PACKAGE: returned root ID mismatch returns INTERNAL_ERROR", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: { package: { id: "npm:vue", name: "vue", ecosystem: "NPM" } },
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "npm:react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INTERNAL_ERROR");
      expect(res.error.message).toContain("does not match");
    }
  });

  test("14. GET_REVERSE_DEPENDENTS: Apollo error returns UNAVAILABLE even with partial data", async () => {
    const { client } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "npm:react", name: "react", ecosystem: "NPM" } } };
      }
      return {
        data: { reverseDependents: { edges: [{ node: { id: "npm:react-dom", name: "react-dom", ecosystem: "NPM" } }], totalCount: 1 } },
        errors: [{ message: "Partial transport error" }],
      };
    });

    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "npm:react" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
    }
  });

  test("15. GET_REVERSE_DEPENDENTS: non-canonical dependent ecosystem (e.g. NUGET alias) returns INTERNAL_ERROR", async () => {
    const { client } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "nuget:pkg", name: "pkg", ecosystem: "NU_GET" } } };
      }
      return {
        data: {
          reverseDependents: {
            edges: [{ node: { id: "nuget:dep", name: "dep", ecosystem: "NUGET" } }], // alias forbidden
            totalCount: 1,
          },
        },
      };
    });

    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.loadPackageGraph({ tenantId: "public", userId: "public" }, { rootPackageId: "nuget:pkg" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INTERNAL_ERROR");
    }
  });

  // ─── 4. Dependency Path Error Normalization ───
  test("16. traceDependencyPath: Apollo error returns UNAVAILABLE", async () => {
    const { client } = createMockApolloClient(async () => ({
      error: new Error("Path service down"),
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.traceDependencyPath({ tenantId: "public", userId: "public" }, { fromPackageId: "npm:a", toPackageId: "npm:b" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("UNAVAILABLE");
    }
  });

  test("17. traceDependencyPath: found=false returns NOT_FOUND", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: { dependencyPath: { found: false, hops: 0, packages: [] } },
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.traceDependencyPath({ tenantId: "public", userId: "public" }, { fromPackageId: "npm:a", toPackageId: "npm:b" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("NOT_FOUND");
    }
  });

  test("18. traceDependencyPath: malformed payload returns INTERNAL_ERROR", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: {},
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.traceDependencyPath({ tenantId: "public", userId: "public" }, { fromPackageId: "npm:a", toPackageId: "npm:b" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INTERNAL_ERROR");
    }
  });

  test("19. traceDependencyPath: valid payload maps hopCount and packageIds", async () => {
    const { client } = createMockApolloClient(async () => ({
      data: {
        dependencyPath: {
          found: true,
          hops: 2,
          packages: [
            { id: "npm:a", name: "a", ecosystem: "NPM" },
            { id: "npm:b", name: "b", ecosystem: "NPM" },
            { id: "npm:c", name: "c", ecosystem: "NPM" },
          ],
        },
      },
    }));
    const graphPort = createApolloGraphQueryPort(client);
    const res = await graphPort.traceDependencyPath({ tenantId: "public", userId: "public" }, { fromPackageId: "npm:a", toPackageId: "npm:c" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.hopCount).toBe(2);
      expect(res.data.packageIds).toEqual(["npm:a", "npm:b", "npm:c"]);
    }
  });

  // ─── 5. Security & Authorization Sentinel Isolation ───
  test("20. Public workspace security context returns explicit sentinel", async () => {
    const secPort = createPublicWorkspaceSecurityContextPort();
    const res = await secPort.getSecurityContext();

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.tenantId).toBe("public");
      expect(res.data.userId).toBe("public");
    }
  });

  test("21. Public sentinel is not added to GraphQL variables or context headers", async () => {
    const { client, queriedOptions } = createMockApolloClient(async () => ({
      data: { searchPackages: { edges: [], totalCount: 0 } },
    }));
    const catalogPort = createApolloPackageCatalogPort(client);
    await catalogPort.searchPackages({ tenantId: "public", userId: "public" }, { query: "react" });

    expect(queriedOptions.length).toBe(1);
    const opts = queriedOptions[0];
    expect(opts.variables).not.toHaveProperty("tenantId");
    expect(opts.variables).not.toHaveProperty("userId");
    expect(opts.context).not.toHaveProperty("headers");
  });

  test("22. Public authorization permits workspace actions without channel credentials", async () => {
    const authPort = createPublicWorkspaceAuthorizationPort();
    const res = await authPort.authorize({
      securityContext: { tenantId: "public", userId: "public" },
      action: "OPEN_PACKAGE_GRAPH",
      resource: { rootPackageId: "cargo:tokio" },
    });

    expect(res.ok).toBe(true);
  });

  test("23. AbortSignal is forwarded to Apollo query context fetchOptions.signal", async () => {
    const { client, queriedOptions } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "npm:react", name: "react", ecosystem: "NPM" } } };
      }
      return { data: { reverseDependents: { edges: [], totalCount: 0 } } };
    });
    const graphPort = createApolloGraphQueryPort(client);
    const controller = new AbortController();

    await graphPort.loadPackageGraph(
      { tenantId: "public", userId: "public" },
      { rootPackageId: "npm:react" },
      controller.signal
    );

    expect(queriedOptions.length).toBe(2);
    expect(queriedOptions[0].context?.fetchOptions?.signal).toBe(controller.signal);
    expect(queriedOptions[1].context?.fetchOptions?.signal).toBe(controller.signal);
  });

  // ─── 6. Projection Count Semantics & Deduplication ───
  test("24. Projection loadedCount counts unique non-root dependents only and totalCount matches backend", async () => {
    const projectionStore = createGraphProjectionStore();
    const controller = new AbortController();

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
              { node: { id: "npm:next", name: "next", ecosystem: "NPM" }, depth: 2 },
              { node: { id: "npm:next", name: "next", ecosystem: "NPM" }, depth: 2 }, // duplicate edge
            ],
            totalCount: 50,
          },
        },
      };
    });

    const graphPort = createApolloGraphQueryPort(client, projectionStore);
    const res = await graphPort.loadPackageGraph(
      { tenantId: "public", userId: "public" },
      { rootPackageId: "npm:react", depth: 2 },
      controller.signal
    );

    expect(res.ok).toBe(true);

    // Candidate is staged, not visible yet
    expect(projectionStore.getProjection("reverse:npm:react:depth:2")).toBeNull();

    // Activate candidate
    const activated = projectionStore.activateProjection(controller.signal, "reverse:npm:react:depth:2");
    expect(activated).toBe(true);

    const proj = projectionStore.getProjection("reverse:npm:react:depth:2");
    expect(proj).not.toBeNull();
    if (proj) {
      expect(proj.loadedCount).toBe(2); // unique dependents: react-dom, next (excluding root)
      expect(proj.totalCount).toBe(50);
      expect(proj.truncated).toBe(true);
      expect(proj.nodes.length).toBe(3); // root + 2 unique dependents
    }
  });

  // ─── 7. Two-Phase Staging & Sequence Guard Rules (Findings 2 & 3) ───
  test("25. Latest-request sequence rule: older request cannot become visible even if it finishes first", () => {
    const projectionStore = createGraphProjectionStore();
    const graphKey = "reverse:npm:react:depth:2";

    const ctrlA = new AbortController();
    const ctrlB = new AbortController();

    const seqA = projectionStore.nextSequence(graphKey); // 1
    const seqB = projectionStore.nextSequence(graphKey); // 2

    // Request A finishes first and stages seq 1
    projectionStore.stageProjection(
      ctrlA.signal,
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
      seqA
    );

    // Attempt to activate A -> must FAIL because seqA (1) !== latestRequested (2)
    const activatedA = projectionStore.activateProjection(ctrlA.signal, graphKey);
    expect(activatedA).toBe(false);
    expect(projectionStore.getProjection(graphKey)).toBeNull();

    // Request B finishes and stages seq 2
    projectionStore.stageProjection(
      ctrlB.signal,
      {
        graphId: graphKey,
        rootPackageId: "npm:react",
        depth: 2,
        nodes: [
          { id: "npm:react", name: "react", ecosystem: "NPM", depth: 0, isRoot: true },
          { id: "npm:react-dom", name: "react-dom", ecosystem: "NPM", depth: 1, isRoot: false },
        ],
        links: [],
        loadedCount: 2,
        totalCount: 2,
        truncated: false,
      },
      seqB
    );

    // Activate B -> succeeds
    const activatedB = projectionStore.activateProjection(ctrlB.signal, graphKey);
    expect(activatedB).toBe(true);
    expect(projectionStore.getProjection(graphKey)?.loadedCount).toBe(2);
  });

  test("26. Same-graph stale commit: stale reload rejected with STALE_CONTEXT leaves visible projection unchanged", async () => {
    const store = createWarRoomStore();
    const statePort = createWarRoomStatePort(store);
    const projectionStore = createGraphProjectionStore();

    let resolvePendingGraphQuery: (() => void) | null = null;
    const pendingQueryPromise = new Promise<void>((resolve) => {
      resolvePendingGraphQuery = resolve;
    });

    const { client } = createMockApolloClient(async (opt) => {
      const op = getOperationName(opt.query);
      if (op === "GetPackage" || ("id" in (opt.variables || {}))) {
        return { data: { package: { id: "npm:react", name: "react", ecosystem: "NPM" } } };
      }
      // Wait on reload
      await pendingQueryPromise;
      return {
        data: {
          reverseDependents: {
            edges: [{ node: { id: "npm:new-dep", name: "new-dep", ecosystem: "NPM" }, depth: 1 }],
            totalCount: 1,
          },
        },
      };
    });

    const graphPort = createApolloGraphQueryPort(client, projectionStore);
    const actions = createWarRoomActions({
      statePort,
      securityContextPort: createPublicWorkspaceSecurityContextPort(),
      authorizationPort: createPublicWorkspaceAuthorizationPort(),
      packageCatalogPort: createApolloPackageCatalogPort(client),
      graphQueryPort: graphPort,
      scenarioAnalysisPort: createUnavailableScenarioAnalysisPort(),
      migrationPlanningPort: createUnavailableMigrationPlanningPort(),
    });

    // 1. Initialize store
    actions.initialize();
    expect(statePort.getState().phase).toBe("IDLE");

    // 2. Set initial visible projection for graph
    const initialSignal = new AbortController().signal;
    const initSeq = projectionStore.nextSequence("reverse:npm:react:depth:2");
    projectionStore.stageProjection(
      initialSignal,
      {
        graphId: "reverse:npm:react:depth:2",
        rootPackageId: "npm:react",
        depth: 2,
        nodes: [{ id: "npm:react", name: "react", ecosystem: "NPM", depth: 0, isRoot: true }],
        links: [],
        loadedCount: 0,
        totalCount: 0,
        truncated: false,
      },
      initSeq
    );
    projectionStore.activateProjection(initialSignal, "reverse:npm:react:depth:2");
    expect(projectionStore.getProjection("reverse:npm:react:depth:2")?.loadedCount).toBe(0);

    // Also transition canonical state to GRAPH_READY at revision 1
    statePort.commitContextBound(1, {
      type: "GRAPH_OPENED",
      payload: {
        graph: {
          id: "reverse:npm:react:depth:2",
          rootPackage: { id: "npm:react", name: "react", ecosystem: "NPM" },
          packageIds: ["npm:react"],
        },
      },
    });
    expect(statePort.getState().phase).toBe("GRAPH_READY");
    const revBeforeReload = statePort.getState().contextRevision; // 2

    // 3. Start reload with invocation capturing revBeforeReload
    const reloadCtrl = new AbortController();
    const reloadInvocation = { channel: "HUMAN" as const, capturedContextRevision: revBeforeReload, signal: reloadCtrl.signal };
    const reloadPromise = actions.openPackageGraph(reloadInvocation, { rootPackageId: "npm:react", depth: 2 });

    // 4. Concurrently, user selects a node advancing canonical revision to revBeforeReload + 1
    statePort.commitContextBound(revBeforeReload, {
      type: "NODE_SELECTED",
      payload: { selection: { package: { id: "npm:react", name: "react", ecosystem: "NPM" } } },
    });
    expect(statePort.getState().phase).toBe("NODE_SELECTED");
    expect(statePort.getState().contextRevision).toBe(revBeforeReload + 1);

    // 5. Now resolve pending reload query
    resolvePendingGraphQuery?.();
    const reloadResult = await reloadPromise;

    // Canonical action must be rejected due to stale context
    expect(reloadResult.ok).toBe(false);
    if (!reloadResult.ok) {
      expect(reloadResult.error.code).toBe("STALE_CONTEXT");
    }

    // Attempting to activate stale candidate must fail or be discarded
    projectionStore.discardProjection(reloadCtrl.signal);
    expect(projectionStore.activateProjection(reloadCtrl.signal, "reverse:npm:react:depth:2")).toBe(false);

    // Visible projection remains the original initial projection
    expect(projectionStore.getProjection("reverse:npm:react:depth:2")?.loadedCount).toBe(0);
  });

  test("27. Failed new graph load preserves previous visible projection", async () => {
    const projectionStore = createGraphProjectionStore();
    const initialSignal = new AbortController().signal;
    const seqA = projectionStore.nextSequence("reverse:npm:react:depth:2");

    projectionStore.stageProjection(
      initialSignal,
      {
        graphId: "reverse:npm:react:depth:2",
        rootPackageId: "npm:react",
        depth: 2,
        nodes: [{ id: "npm:react", name: "react", ecosystem: "NPM", depth: 0, isRoot: true }],
        links: [],
        loadedCount: 0,
        totalCount: 0,
        truncated: false,
      },
      seqA
    );
    projectionStore.activateProjection(initialSignal, "reverse:npm:react:depth:2");

    // Attempt graph B which fails with NOT_FOUND
    const { client } = createMockApolloClient(async () => ({
      data: { package: null },
    }));
    const graphPort = createApolloGraphQueryPort(client, projectionStore);
    const failCtrl = new AbortController();

    const res = await graphPort.loadPackageGraph(
      { tenantId: "public", userId: "public" },
      { rootPackageId: "npm:missing" },
      failCtrl.signal
    );

    expect(res.ok).toBe(false);
    projectionStore.discardProjection(failCtrl.signal);

    // Visible projection for previous graph A is completely intact
    expect(projectionStore.getProjection("reverse:npm:react:depth:2")).not.toBeNull();
    expect(projectionStore.getProjection("reverse:npm:missing:depth:2")).toBeNull();
  });

  test("28. Human invocation factory captures latest revision at CALL TIME", () => {
    const store = createWarRoomStore();
    const statePort = createWarRoomStatePort(store);

    expect(statePort.getState().contextRevision).toBe(0);

    // Invocation factory function
    const createInvocation = (signal?: AbortSignal) => ({
      channel: "HUMAN" as const,
      capturedContextRevision: statePort.getState().contextRevision,
      signal,
    });

    const inv0 = createInvocation();
    expect(inv0.capturedContextRevision).toBe(0);

    // Advance revision with APP_INITIALIZED (0 -> 1)
    statePort.transition({ type: "APP_INITIALIZED" });
    expect(statePort.getState().phase).toBe("IDLE");
    expect(statePort.getState().contextRevision).toBe(1);

    const inv1 = createInvocation();
    expect(inv1.capturedContextRevision).toBe(1);

    // Advance revision with GRAPH_OPENED (1 -> 2)
    statePort.commitContextBound(1, {
      type: "GRAPH_OPENED",
      payload: {
        graph: {
          id: "g1",
          rootPackage: { id: "npm:react", name: "react", ecosystem: "NPM" },
          packageIds: ["npm:react"],
        },
      },
    });
    expect(statePort.getState().phase).toBe("GRAPH_READY");
    expect(statePort.getState().contextRevision).toBe(2);

    const inv2 = createInvocation();
    expect(inv2.capturedContextRevision).toBe(2);

    // Advance again with NODE_SELECTED (2 -> 3)
    statePort.commitContextBound(2, {
      type: "NODE_SELECTED",
      payload: { selection: { package: { id: "npm:react", name: "react", ecosystem: "NPM" } } },
    });
    expect(statePort.getState().phase).toBe("NODE_SELECTED");
    expect(statePort.getState().contextRevision).toBe(3);

    const inv3 = createInvocation();
    expect(inv3.capturedContextRevision).toBe(3);
  });

  // ─── 8. Production Unavailable Ports & Static Guard ───
  test("29. Scenario analysis and migration planning production ports return UNAVAILABLE", async () => {
    const analysisPort = createUnavailableScenarioAnalysisPort();
    const planPort = createUnavailableMigrationPlanningPort();

    const aRes = await analysisPort.recalculateScenario({ tenantId: "public", userId: "public" }, {} as any);
    expect(aRes.ok).toBe(false);
    if (!aRes.ok) expect(aRes.error.code).toBe("UNAVAILABLE");

    const pRes = await planPort.generateMigrationPlan({ tenantId: "public", userId: "public" }, {} as any);
    expect(pRes.ok).toBe(false);
    if (!pRes.ok) expect(pRes.error.code).toBe("UNAVAILABLE");
  });

  test("30. Static scan of graph/page.tsx: semantic Apollo queries and direct canonical mutations absent", () => {
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

    // No UNKNOWN casts
    expect(content).not.toContain('"UNKNOWN" as PackageEcosystem');
    expect(content).not.toContain('as PackageEcosystem');

    // War Room actions and custom provider hooks must be used
    expect(content).toContain("useWarRoomActions");
    expect(content).toContain("useWarRoomSelector");
    expect(content).toContain("useHumanWarRoomInvocation");
    expect(content).toContain("useWarRoomGraphProjection");
    expect(content).toContain("useWarRoomProjectionLifecycle");
  });
});

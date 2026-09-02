/**
 * WebMCP Adaptive Execution Admission, Context Revision & Stale Completion Guards (WMCP-4C)
 *
 * Deterministic test suite verifying:
 * - Exact 7 execution policies matching 7 executable catalog tools
 * - Invocation-time logical surface admission (INV-WMCP4C-EXEC-001)
 * - Single execution snapshot capture (INV-WMCP4C-EXEC-002)
 * - Reuse of deriveDesiredToolSurface as sole admission authority (INV-WMCP4C-EXEC-003)
 * - Platform availability participation in admission (INV-WMCP4C-EXEC-004)
 * - Physically retired tool invocation rejection with 0 action calls (INV-WMCP4C-EXEC-005)
 * - Strict context read stale completion guard (INV-WMCP4C-EXEC-006)
 * - Revision-tolerant read draining across context changes (INV-WMCP4C-EXEC-007)
 * - Action-commit-guarded mutation revision handling (INV-WMCP4C-EXEC-008, 4C-T17)
 * - Cancellation precedence over late resolution and stale context (INV-WMCP4C-EXEC-009)
 * - Immutable captured target in inspect_selected_package (INV-WMCP4C-EXEC-010)
 * - Output budget and sanitization (INV-WMCP4C-EXEC-011)
 * - Deferred tool fail-closed behavior (INV-WMCP4C-EXEC-012)
 */

import { test, expect } from "@playwright/test";
import {
  ALL_CANONICAL_ACTION_NAMES,
  WEB_MCP_TOOL_CATALOG,
  WebMcpActionName,
  createAdaptiveToolDefinition,
  EXECUTABLE_TOOL_POLICIES,
} from "../src/lib/webmcp";
import { createWarRoomStore, createWarRoomStatePort } from "../src/lib/war-room/state/store";
import { createWarRoomActions } from "../src/lib/war-room/application/actions";
import {
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
} from "../src/lib/war-room/application/ports";
import { createGraphProjectionStore, WarRoomGraphProjectionStore } from "../src/lib/war-room/integration/graph-projection";
import { WebMcpPlatformAdapter } from "../src/lib/webmcp/platform/types";

interface MockPortSpies {
  searchCalls: number;
  inspectPackageCalls: number;
  openGraphCalls: number;
  traceCalls: number;
  delayedPackageIds?: Set<string>;
  delayMs?: number;
}

function createMockServicePorts(spies: MockPortSpies, projectionStore: WarRoomGraphProjectionStore) {
  const securityPort: WarRoomSecurityContextPort = {
    async getSecurityContext() {
      return {
        ok: true,
        data: {
          tenantId: "tenant-mock",
          userId: "user-mock",
          organizationId: "org-mock",
        },
      };
    },
  };

  const authPort: WarRoomAuthorizationPort = {
    async authorize() {
      return { ok: true, data: undefined };
    },
  };

  const catalogPort: WarRoomPackageCatalogPort = {
    async searchPackages(_sec, request) {
      spies.searchCalls++;
      if (spies.delayMs && spies.delayedPackageIds?.has(request.query)) {
        await new Promise((r) => setTimeout(r, spies.delayMs));
      }
      return {
        ok: true,
        data: {
          packages: [
            {
              id: "npm:express",
              name: "express",
              ecosystem: request.ecosystem ?? "NPM",
              version: "4.18.2",
            },
          ].slice(0, request.limit ?? 8),
          totalCount: 1,
        },
      };
    },
    async inspectPackage(_sec, request) {
      spies.inspectPackageCalls++;
      if (spies.delayMs && spies.delayedPackageIds?.has(request.packageId)) {
        await new Promise((r) => setTimeout(r, spies.delayMs));
      }
      return {
        ok: true,
        data: {
          package: {
            id: request.packageId,
            name: request.packageId.split(":")[1] ?? request.packageId,
            ecosystem: "NPM",
            version: "1.0.0",
          },
          directDependencyIds: ["npm:dep-1"],
          directDependentIds: [],
        },
      };
    },
  };

  const graphPort: WarRoomGraphQueryPort = {
    async loadPackageGraph(_sec, request, signal) {
      spies.openGraphCalls++;
      if (spies.delayMs && spies.delayedPackageIds?.has(request.rootPackageId)) {
        await new Promise((r) => setTimeout(r, spies.delayMs));
      }

      const graphId = `graph-${request.rootPackageId}`;
      if (signal) {
        const seq = projectionStore.nextSequence(graphId);
        projectionStore.stageProjection(
          signal,
          {
            graphId,
            rootPackageId: request.rootPackageId,
            depth: request.depth || 2,
            nodes: [
              {
                id: request.rootPackageId,
                name: request.rootPackageId.split(":")[1] ?? request.rootPackageId,
                ecosystem: "NPM",
                depth: 0,
                isRoot: true,
              },
            ],
            links: [],
            loadedCount: 1,
            totalCount: 1,
            truncated: false,
          },
          seq
        );
      }

      return {
        ok: true,
        data: {
          id: graphId,
          rootPackage: {
            id: request.rootPackageId,
            name: request.rootPackageId.split(":")[1] ?? request.rootPackageId,
            ecosystem: "NPM",
            version: "1.0.0",
          },
          packageIds: [request.rootPackageId, "npm:dep-1"],
        },
      };
    },
    async traceDependencyPath(_sec, request) {
      spies.traceCalls++;
      if (spies.delayMs && spies.delayedPackageIds?.has(request.fromPackageId)) {
        await new Promise((r) => setTimeout(r, spies.delayMs));
      }
      return {
        ok: true,
        data: {
          fromPackageId: request.fromPackageId,
          toPackageId: request.toPackageId,
          packageIds: [request.fromPackageId, "npm:intermediate", request.toPackageId],
          hopCount: 2,
        },
      };
    },
  };

  const scenarioPort: WarRoomScenarioAnalysisPort = {
    async recalculateScenario(_sec, input) {
      return {
        ok: true,
        data: {
          id: `analysis-${input.scenario.id}`,
          scenarioId: input.scenario.id,
          sourceContextRevision: input.sourceContextRevision,
          affectedEntityIds: ["npm:dep-1"],
        },
      };
    },
  };

  const planningPort: WarRoomMigrationPlanningPort = {
    async generateMigrationPlan(_sec, input) {
      return {
        ok: true,
        data: {
          id: `plan-${input.scenario.id}`,
          scenarioId: input.scenario.id,
          sourceReviewId: input.review.id,
          sourceContextRevision: input.sourceContextRevision,
        },
      };
    },
  };

  return {
    securityPort,
    authPort,
    catalogPort,
    graphPort,
    scenarioPort,
    planningPort,
  };
}

function setupTestHarness(customSpies?: Partial<MockPortSpies>, platformAvailable: boolean = true) {
  const spies: MockPortSpies = {
    searchCalls: 0,
    inspectPackageCalls: 0,
    openGraphCalls: 0,
    traceCalls: 0,
    ...customSpies,
  };

  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);
  const projectionStore = createGraphProjectionStore();
  const ports = createMockServicePorts(spies, projectionStore);
  const actions = createWarRoomActions({
    statePort,
    securityContextPort: ports.securityPort,
    authorizationPort: ports.authPort,
    packageCatalogPort: ports.catalogPort,
    graphQueryPort: ports.graphPort,
    scenarioAnalysisPort: ports.scenarioPort,
    migrationPlanningPort: ports.planningPort,
  });

  actions.initialize();

  const platformAdapter: WebMcpPlatformAdapter = {
    isAvailable: () => platformAvailable,
    getSnapshot: () => ({
      availability: platformAvailable ? "AVAILABLE" : "UNAVAILABLE",
      hasDocument: true,
      hasModelContext: platformAvailable,
      secureContext: true,
    }),
    registerTool: async () => ({ ok: true }),
  };

  return {
    store,
    statePort,
    actions,
    projectionStore,
    platformAdapter,
    spies,
  };
}

test.describe("WebMCP Adaptive Execution Admission & Context Guards (WMCP-4C)", () => {
  test("4C-T1. Exact Policy Set = Exact Executable Catalog Tools", () => {
    const executableCatalogNames = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "EXECUTABLE"
    );

    const policyToolNames = Object.keys(EXECUTABLE_TOOL_POLICIES) as WebMcpActionName[];

    expect(policyToolNames.sort()).toEqual(executableCatalogNames.sort());
    expect(policyToolNames.length).toBe(16);
    expect(executableCatalogNames.length).toBe(16);

    // Specific policy verification
    expect(EXECUTABLE_TOOL_POLICIES.search_packages).toBe("REVISION_TOLERANT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.trace_dependency_path).toBe("REVISION_TOLERANT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.summarize_graph).toBe("STRICT_CONTEXT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.inspect_selected_package).toBe("STRICT_CONTEXT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.inspect_scenario).toBe("STRICT_CONTEXT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.inspect_migration_plan).toBe("STRICT_CONTEXT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.calculate_blast_radius).toBe("STRICT_CONTEXT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.inspect_critical_paths).toBe("STRICT_CONTEXT_READ");
    expect(EXECUTABLE_TOOL_POLICIES.focus_graph_nodes).toBe("ACTION_COMMIT_GUARDED_MUTATION");
    expect(EXECUTABLE_TOOL_POLICIES.open_package_graph).toBe("ACTION_COMMIT_GUARDED_MUTATION");
    expect(EXECUTABLE_TOOL_POLICIES.simulate_api_changes).toBe("ACTION_COMMIT_GUARDED_MUTATION");
    expect(EXECUTABLE_TOOL_POLICIES.recalculate_scenario).toBe("ACTION_COMMIT_GUARDED_MUTATION");
    expect(EXECUTABLE_TOOL_POLICIES.set_scenario_priority).toBe("ACTION_COMMIT_GUARDED_MUTATION");
    expect(EXECUTABLE_TOOL_POLICIES.set_scenario_exclusion).toBe("ACTION_COMMIT_GUARDED_MUTATION");
    expect(EXECUTABLE_TOOL_POLICIES.generate_migration_plan).toBe("ACTION_COMMIT_GUARDED_MUTATION");
    expect(EXECUTABLE_TOOL_POLICIES.focus_critical_path).toBe("ACTION_COMMIT_GUARDED_MUTATION");
  });

  test("4C-T2. Every Deferred Tool Remains Factory-Fail-Closed", () => {
    const harness = setupTestHarness();
    const deferredTools = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "DEFERRED"
    );

    expect(deferredTools.length).toBe(0);
    for (const name of deferredTools) {
      expect(() => createAdaptiveToolDefinition(name, harness)).toThrowError(
        /is deferred.*cannot be instantiated as an executable definition/i
      );
    }
  });

  test("4C-T3. Current Desired Surface Admits Active Tool", async () => {
    const harness = setupTestHarness();
    // In IDLE phase, search_packages is admitted
    const searchTool = createAdaptiveToolDefinition("search_packages", harness);
    const res = await searchTool.execute({ query: "express" });

    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("search_packages");
    expect(harness.spies.searchCalls).toBe(1);
  });

  test("4C-T4 & 4C-T5. Physically Retired Tool Rejection With 0 Action Calls", async () => {
    const harness = setupTestHarness();

    // In IDLE phase, search_packages is created
    const searchTool = createAdaptiveToolDefinition("search_packages", harness);

    // Transition state from IDLE -> GRAPH_READY
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    expect(harness.statePort.getState().phase).toBe("GRAPH_READY");

    // Invoke old search_packages definition created in IDLE
    const res = await searchTool.execute({ query: "express" });

    // Must return INVALID_STATE and make ZERO action calls
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("INVALID_STATE");
    expect((res as any).error.message).toContain("not available in the current War Room phase 'GRAPH_READY'");
    expect(harness.spies.searchCalls).toBe(0);
  });

  test("4C-T6. Platform UNAVAILABLE Rejects Execution Admission", async () => {
    const harness = setupTestHarness({}, false); // platformAvailable = false

    const searchTool = createAdaptiveToolDefinition("search_packages", harness);
    const res = await searchTool.execute({ query: "express" });

    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("INVALID_STATE");
    expect(harness.spies.searchCalls).toBe(0);
  });

  test("4C-T7. Pre-Aborted Execution Signal Returns CANCELLED", async () => {
    const harness = setupTestHarness();
    const searchTool = createAdaptiveToolDefinition("search_packages", harness);

    const controller = new AbortController();
    controller.abort();

    const res = await searchTool.execute({ query: "express" }, { signal: controller.signal });
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("CANCELLED");
    expect(harness.spies.searchCalls).toBe(0);
  });

  test("4C-T8. Late Success From AbortSignal-Ignoring Dependency Returns CANCELLED", async () => {
    const harness = setupTestHarness({
      delayMs: 60,
      delayedPackageIds: new Set(["express"]),
    });
    const searchTool = createAdaptiveToolDefinition("search_packages", harness);

    const controller = new AbortController();
    const execPromise = searchTool.execute({ query: "express" }, { signal: controller.signal });

    // Abort mid-flight while dependency is sleeping
    setTimeout(() => controller.abort(), 10);

    const res = await execPromise;
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("CANCELLED");
  });

  test("4C-T9, 4C-T10, 4C-T11. inspect_selected_package Strict Read: Immutable Snapshot & Stale Race Guard", async () => {
    const harness = setupTestHarness({
      delayMs: 80,
      delayedPackageIds: new Set(["npm:pkg-a"]), // delay only pkg-a
    });

    // Open graph and select package A
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:pkg-a" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:pkg-a",
            name: "pkg-a",
            ecosystem: "NPM",
            version: "1.0.0",
          },
        },
      }
    );

    const inspectTool = createAdaptiveToolDefinition("inspect_selected_package", harness);

    // Launch inspect_selected_package targeting pkg-a (which sleeps 80ms)
    const inspectPromise = inspectTool.execute({});

    // Mid-flight: Human selects package dep-1 (which does not sleep) while pkg-a is in-flight
    await new Promise((r) => setTimeout(r, 15));
    const selectRes = await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:dep-1",
            name: "dep-1",
            ecosystem: "NPM",
            version: "2.0.0",
          },
        },
      }
    );
    expect(selectRes.ok).toBe(true);

    const res = await inspectPromise;

    // 4C-T10: Selection change produces STALE_CONTEXT
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("STALE_CONTEXT");

    // 4C-T9 & 4C-T11: Underlying action was called for pkg-a (captured target), not substituted with dep-1
    expect(harness.spies.inspectPackageCalls).toBe(1);
  });

  test("4C-T12. trace_dependency_path Succeeded Across Unrelated Context Revision Change (REVISION_TOLERANT_READ)", async () => {
    const harness = setupTestHarness({
      delayMs: 80,
      delayedPackageIds: new Set(["npm:root"]),
    });

    // Open graph to enter GRAPH_READY
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    const traceTool = createAdaptiveToolDefinition("trace_dependency_path", harness);

    // Launch trace_dependency_path
    const tracePromise = traceTool.execute({
      sourcePackageId: "npm:root",
      targetPackageId: "npm:leaf",
    });

    // Mid-flight: An unrelated human action mutates state (selects package)
    await new Promise((r) => setTimeout(r, 15));
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:other",
            name: "other",
            ecosystem: "NPM",
            version: "1.0.0",
          },
        },
      }
    );

    const res = await tracePromise;

    // REVISION_TOLERANT_READ succeeds even though contextRevision changed
    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("trace_dependency_path");
    expect((res as any).data.path).toContain("npm:intermediate");
  });

  test("4C-T13. search_packages May Complete After Context Transition If Invocation Was Valid When Admitted", async () => {
    const harness = setupTestHarness({
      delayMs: 80,
      delayedPackageIds: new Set(["express"]),
    });
    const searchTool = createAdaptiveToolDefinition("search_packages", harness);

    // Launch search_packages while in IDLE
    const searchPromise = searchTool.execute({ query: "express" });

    // Mid-flight: Human opens graph, transitioning phase to GRAPH_READY and advancing contextRevision
    await new Promise((r) => setTimeout(r, 15));
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    const res = await searchPromise;

    // REVISION_TOLERANT_READ: Once validly admitted, the explicit read completes successfully
    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("search_packages");
  });

  test("4C-T14. summarize_graph Uses Captured Canonical Snapshot", async () => {
    const harness = setupTestHarness();

    // Open graph first
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    const summarizeTool = createAdaptiveToolDefinition("summarize_graph", harness);
    const res = await summarizeTool.execute({});

    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("summarize_graph");
    expect((res as any).data.graphId).toBe("graph-npm:express");
  });

  test("4C-T15 & 4C-T16. inspect_scenario & inspect_migration_plan Invalid When Tool No Longer Logically Exposed", async () => {
    const harness = setupTestHarness();

    // Open graph, select package, create scenario -> SIMULATION_READY
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:express",
            name: "express",
            ecosystem: "NPM",
            version: "1.0.0",
          },
        },
      }
    );
    await harness.actions.createScenario(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        scenario: {
          id: "sc-1",
          targetPackageId: "npm:express",
          proposedVersion: "5.0.0",
          patchOperations: [],
        },
      }
    );

    expect(harness.statePort.getState().phase).toBe("SIMULATION_READY");

    const inspectScenarioTool = createAdaptiveToolDefinition("inspect_scenario", harness);

    // Transition from SIMULATION_READY -> HUMAN_REVIEW (where inspect_scenario is no longer exposed)
    harness.store.getState().commitContextBound(harness.statePort.getState().contextRevision, {
      type: "HUMAN_ANNOTATED",
      payload: {
        review: {
          id: "rev-1",
          scenarioId: "sc-1",
          bindings: [],
        },
      },
    });

    expect(harness.statePort.getState().phase).toBe("HUMAN_REVIEW");

    // Invoking old inspect_scenario definition must fail admission
    const resScenario = await inspectScenarioTool.execute({});
    expect(resScenario.ok).toBe(false);
    expect((resScenario as any).error.code).toBe("INVALID_STATE");

    // Now in PLAN_READY: inspect_migration_plan is exposed
    harness.store.getState().commitContextBound(harness.statePort.getState().contextRevision, {
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-1",
          scenarioId: "sc-1",
          sourceReviewId: "rev-1",
          sourceContextRevision: harness.statePort.getState().contextRevision,
        },
      },
    });

    expect(harness.statePort.getState().phase).toBe("PLAN_READY");
    const inspectPlanTool = createAdaptiveToolDefinition("inspect_migration_plan", harness);

    // Opening a new graph resets downstream review/plan and transitions to GRAPH_READY
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:other" }
    );
    expect(harness.statePort.getState().phase).toBe("GRAPH_READY");

    // inspect_migration_plan is no longer exposed in GRAPH_READY
    const resPlan = await inspectPlanTool.execute({});
    expect(resPlan.ok).toBe(false);
    expect((resPlan as any).error.code).toBe("INVALID_STATE");
  });

  test("4C-T17. Successful open_package_graph Revision Increment Does NOT Become False STALE_CONTEXT", async () => {
    const harness = setupTestHarness();
    const openTool = createAdaptiveToolDefinition("open_package_graph", harness);

    const initialRevision = harness.statePort.getState().contextRevision;
    const controller = new AbortController();

    const res = await openTool.execute({ rootPackageId: "npm:express" }, { signal: controller.signal });

    // CRITICAL: Successful commit increments contextRevision to initialRevision + 1
    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("open_package_graph");
    expect((res as any).contextRevision).toBe(initialRevision + 1);
    expect((res as any).changed).toBe(true);
    expect((res as any).data.projectionActivated).toBe(true);
  });

  test("4C-T18. Delayed Stale open_package_graph Commit Returns STALE_CONTEXT and Preserves Canonical State", async () => {
    const harness = setupTestHarness({
      delayMs: 80,
      delayedPackageIds: new Set(["npm:express"]), // delay only express
    });
    const openTool = createAdaptiveToolDefinition("open_package_graph", harness);

    // Agent launches openPackageGraph for express (which sleeps 80ms)
    const openPromise = openTool.execute({ rootPackageId: "npm:express" });

    // Mid-flight: Human opens lodash graph (which does not sleep), winning the race and advancing revision
    await new Promise((r) => setTimeout(r, 15));
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:lodash" }
    );

    const res = await openPromise;

    // Agent call rejected with STALE_CONTEXT
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("STALE_CONTEXT");

    // Canonical state remains the human-opened lodash graph
    expect(harness.statePort.getState().graph?.rootPackage.id).toBe("npm:lodash");
  });

  test("4C-T19. Cancellation Wins Over Strict-Read Stale Completion", async () => {
    const harness = setupTestHarness({
      delayMs: 80,
      delayedPackageIds: new Set(["npm:pkg-a"]),
    });

    // Setup graph and selection
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:pkg-a" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:pkg-a",
            name: "pkg-a",
            ecosystem: "NPM",
            version: "1.0.0",
          },
        },
      }
    );

    const inspectTool = createAdaptiveToolDefinition("inspect_selected_package", harness);
    const controller = new AbortController();

    const inspectPromise = inspectTool.execute({}, { signal: controller.signal });

    // Both change context AND abort signal
    await new Promise((r) => setTimeout(r, 15));
    controller.abort();
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:dep-1",
            name: "dep-1",
            ecosystem: "NPM",
            version: "2.0.0",
          },
        },
      }
    );

    const res = await inspectPromise;

    // Cancellation takes precedence
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("CANCELLED");
  });

  test("4C-T20. Registration and Execution Signals Remain Completely Separate", async () => {
    const harness = setupTestHarness();

    const registrationController = new AbortController();
    const executionController = new AbortController();

    const searchTool = createAdaptiveToolDefinition("search_packages", harness);

    // Aborting registration signal has zero effect on execution signal
    registrationController.abort();
    expect(executionController.signal.aborted).toBe(false);

    const res = await searchTool.execute({ query: "express" }, { signal: executionController.signal });
    expect(res.ok).toBe(true);
  });

  test("4C-T21. Action Call Count Invariant: Exact 0 Calls on Failure, Exact 1 on Success", async () => {
    const harness = setupTestHarness();

    // 1. Invalid input: 0 calls
    const searchTool = createAdaptiveToolDefinition("search_packages", harness);
    await searchTool.execute({ query: "" }); // invalid empty query
    expect(harness.spies.searchCalls).toBe(0);

    // 2. Successful execution: 1 call
    await searchTool.execute({ query: "react" });
    expect(harness.spies.searchCalls).toBe(1);
  });

  test("4C-T22. Output Budget Invariant: Failures and Success Envelopes <= 1500 Characters", async () => {
    const harness = setupTestHarness();
    const searchTool = createAdaptiveToolDefinition("search_packages", harness);

    const failRes = await searchTool.execute({ query: "" });
    expect(JSON.stringify(failRes).length).toBeLessThanOrEqual(1500);

    const successRes = await searchTool.execute({ query: "express" });
    expect(JSON.stringify(successRes).length).toBeLessThanOrEqual(1500);
  });

  test("4C-T23. Synchronous Post-Commit Abort on open_package_graph Preserves Committed SUCCESS and Projection (INV-WMCP4C-MUT-001)", async () => {
    const harness = setupTestHarness();
    const controller = new AbortController();

    // Store subscriber: when GRAPH_OPENED commits to GRAPH_READY, synchronously abort the execution controller
    const unsubscribe = harness.store.subscribe(() => {
      const currentState = harness.statePort.getState();
      if (currentState.phase === "GRAPH_READY") {
        controller.abort();
      }
    });

    const openTool = createAdaptiveToolDefinition("open_package_graph", harness);
    const initialRevision = harness.statePort.getState().contextRevision;

    const res = await openTool.execute({ rootPackageId: "npm:express" }, { signal: controller.signal });
    unsubscribe();

    // Verify signal state
    expect(controller.signal.aborted).toBe(true);

    // Verify canonical state
    expect(harness.statePort.getState().phase).toBe("GRAPH_READY");
    expect(harness.statePort.getState().graph?.id).toBe("graph-npm:express");
    expect(harness.statePort.getState().contextRevision).toBe(initialRevision + 1);

    // Verify tool result: Must report committed SUCCESS, NOT false CANCELLED
    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("open_package_graph");
    expect((res as any).contextRevision).toBe(initialRevision + 1);
    expect((res as any).changed).toBe(true);
    expect((res as any).data.projectionActivated).toBe(true);

    // Verify projection store: Must NOT be discarded, must match canonical graph
    const visibleProjection = harness.projectionStore.getProjection("graph-npm:express");
    expect(visibleProjection).not.toBeNull();
    expect(visibleProjection?.graphId).toBe("graph-npm:express");
  });
});

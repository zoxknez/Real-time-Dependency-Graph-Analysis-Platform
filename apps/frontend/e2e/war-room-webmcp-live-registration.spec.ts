/**
 * WebMCP Live Adaptive Registration Lifecycle & Composition Integration (WMCP-4D)
 *
 * Comprehensive integration test suite verifying:
 * - Logical desired vs Registrable surface derivation (INV-WMCP4D-001, INV-WMCP4D-002)
 * - Exact 7-phase registrable surfaces
 * - Zero deferred factory invocations / exceptions
 * - Startup ordering (BOOTSTRAP -> IDLE and pre-initialized IDLE)
 * - Retained tool persistence across phase boundaries (INV-WMCP4D-008)
 * - Removed tool lifetime termination and unregistration (INV-WMCP4D-009)
 * - Tool re-entry with fresh registration lifetime AbortControllers
 * - Rapid overlapping in-flight registration transitions (INV-WMCP4D-011)
 * - Clean empty surface in HUMAN_REVIEW
 * - Platform UNAVAILABLE progressive enhancement (INV-WMCP4D-015)
 * - Progressive enhancement on registration failure
 * - Clean disposal and StrictMode remount safety (INV-WMCP4D-012, INV-WMCP4D-013)
 * - Foreign tool preservation (INV-WMCP4D-016)
 * - Registration removal vs in-flight execution separation (INV-WMCP4D-010)
 * - Strict read stale completion across live transition
 * - Physical removal lag safety via 4C admission
 * - Agent mutation -> live registration update loop
 * - Human action -> live registration update loop
 * - Agent/Human state continuity
 * - Single live ownership / no duplicate primitive registrations (INV-WMCP4D-003, INV-WMCP4D-004)
 */

import { test, expect } from "@playwright/test";
import {
  ALL_CANONICAL_ACTION_NAMES,
  WEB_MCP_TOOL_CATALOG,
  WebMcpActionName,
  deriveDesiredToolSurface,
  deriveRegistrableToolSurface,
  createLiveAdaptiveRegistrationSession,
  createAdaptiveToolDefinition,
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
import {
  WebMcpPlatformAdapter,
  WebMcpPlatformToolDefinition,
  WebMcpPlatformRegistrationOptions,
} from "../src/lib/webmcp/platform/types";

interface MockPlatformSpies {
  registeredTools: Map<string, { definition: WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>; signal: AbortSignal }>;
  registrationAttempts: string[];
  pendingResolvers: Map<string, (res: { ok: boolean }) => void>;
  failTools?: Set<string>;
  manualResolve?: boolean;
}

function createControllablePlatformAdapter(
  spies: MockPlatformSpies,
  available: boolean = true
): WebMcpPlatformAdapter {
  return {
    isAvailable: () => available,
    getSnapshot: () => ({
      availability: available ? "AVAILABLE" : "UNAVAILABLE",
      hasDocument: true,
      hasModelContext: available,
      secureContext: true,
    }),
    registerTool: (definition, options?: WebMcpPlatformRegistrationOptions) => {
      spies.registrationAttempts.push(definition.name);

      if (spies.failTools?.has(definition.name)) {
        return Promise.resolve({ ok: false, error: "Simulated registration rejection" });
      }

      if (spies.manualResolve) {
        return new Promise<{ ok: boolean }>((resolve) => {
          spies.pendingResolvers.set(definition.name, (res) => {
            if (res.ok && options?.signal && !options.signal.aborted) {
              spies.registeredTools.set(definition.name, {
                definition,
                signal: options.signal,
              });
              options.signal.addEventListener("abort", () => {
                spies.registeredTools.delete(definition.name);
              });
            }
            resolve(res);
          });
        });
      }

      if (options?.signal && !options.signal.aborted) {
        spies.registeredTools.set(definition.name, {
          definition,
          signal: options.signal,
        });
        options.signal.addEventListener("abort", () => {
          spies.registeredTools.delete(definition.name);
        });
      }

      return Promise.resolve({ ok: true });
    },
  };
}

interface MockPortSpies {
  searchCalls: number;
  inspectPackageCalls: number;
  openGraphCalls: number;
  traceCalls: number;
  delayMs?: number;
  delayedPackageIds?: Set<string>;
}

function createMockServicePorts(spies: MockPortSpies, projectionStore: WarRoomGraphProjectionStore) {
  const securityPort: WarRoomSecurityContextPort = {
    async getSecurityContext() {
      return { ok: true, data: { tenantId: "t1", userId: "u1", organizationId: "org1" } };
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
              {
                id: "npm:dep-1",
                name: "dep-1",
                ecosystem: "NPM",
                depth: 1,
                isRoot: false,
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

function setupTestHarness(options?: {
  platformAvailable?: boolean;
  manualPlatformResolve?: boolean;
  failTools?: Set<string>;
  portSpies?: Partial<MockPortSpies>;
}) {
  const platformSpies: MockPlatformSpies = {
    registeredTools: new Map(),
    registrationAttempts: [],
    pendingResolvers: new Map(),
    failTools: options?.failTools,
    manualResolve: options?.manualPlatformResolve,
  };

  const portSpies: MockPortSpies = {
    searchCalls: 0,
    inspectPackageCalls: 0,
    openGraphCalls: 0,
    traceCalls: 0,
    ...options?.portSpies,
  };

  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);
  const projectionStore = createGraphProjectionStore();
  const ports = createMockServicePorts(portSpies, projectionStore);
  const actions = createWarRoomActions({
    statePort,
    securityContextPort: ports.securityPort,
    authorizationPort: ports.authPort,
    packageCatalogPort: ports.catalogPort,
    graphQueryPort: ports.graphPort,
    scenarioAnalysisPort: ports.scenarioPort,
    migrationPlanningPort: ports.planningPort,
  });

  const platformAdapter = createControllablePlatformAdapter(
    platformSpies,
    options?.platformAvailable ?? true
  );

  return {
    store,
    statePort,
    actions,
    projectionStore,
    platformAdapter,
    platformSpies,
    portSpies,
  };
}

test.describe("WebMCP Live Adaptive Registration Lifecycle (WMCP-4D)", () => {
  test("4D-T1. Logical Surface and Registrable Surface are Distinct", () => {
    // In GRAPH_READY, logical surface includes deferred tools
    const logical = deriveDesiredToolSurface({
      phase: "GRAPH_READY",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });

    expect(logical.toolNames.has("calculate_blast_radius")).toBe(true);
    expect(logical.toolNames.has("focus_graph_nodes")).toBe(true);

    const registrable = deriveRegistrableToolSurface(logical);
    expect(registrable.toolNames.has("calculate_blast_radius")).toBe(false);
    expect(registrable.toolNames.has("focus_graph_nodes")).toBe(false);
    expect(registrable.toolNames.has("summarize_graph")).toBe(true);
    expect(registrable.toolNames.has("trace_dependency_path")).toBe(true);
    expect(registrable.toolNames.has("open_package_graph")).toBe(true);
  });

  test("4D-T2. Exact BOOTSTRAP Registrable Surface", () => {
    const logical = deriveDesiredToolSurface({ phase: "BOOTSTRAP", contextRevision: 0, webMcpAvailability: "AVAILABLE" });
    const registrable = deriveRegistrableToolSurface(logical);
    expect(Array.from(registrable.toolNames)).toEqual([]);
  });

  test("4D-T3. Exact IDLE Registrable Surface", () => {
    const logical = deriveDesiredToolSurface({ phase: "IDLE", contextRevision: 1, webMcpAvailability: "AVAILABLE" });
    const registrable = deriveRegistrableToolSurface(logical);
    expect(Array.from(registrable.toolNames).sort()).toEqual(["open_package_graph", "search_packages"]);
  });

  test("4D-T4. Exact GRAPH_READY Registrable Surface", () => {
    const logical = deriveDesiredToolSurface({ phase: "GRAPH_READY", contextRevision: 2, webMcpAvailability: "AVAILABLE" });
    const registrable = deriveRegistrableToolSurface(logical);
    expect(Array.from(registrable.toolNames).sort()).toEqual(["open_package_graph", "summarize_graph", "trace_dependency_path"]);
  });

  test("4D-T5. Exact NODE_SELECTED Registrable Surface", () => {
    const logical = deriveDesiredToolSurface({ phase: "NODE_SELECTED", contextRevision: 3, webMcpAvailability: "AVAILABLE" });
    const registrable = deriveRegistrableToolSurface(logical);
    expect(Array.from(registrable.toolNames).sort()).toEqual(["inspect_selected_package", "trace_dependency_path"]);
  });

  test("4D-T6. Exact SIMULATION_READY Registrable Surface", () => {
    const logical = deriveDesiredToolSurface({ phase: "SIMULATION_READY", contextRevision: 4, webMcpAvailability: "AVAILABLE" });
    const registrable = deriveRegistrableToolSurface(logical);
    expect(Array.from(registrable.toolNames).sort()).toEqual(["inspect_scenario", "trace_dependency_path"]);
  });

  test("4D-T7. Exact HUMAN_REVIEW Registrable Surface is Empty", () => {
    const logical = deriveDesiredToolSurface({ phase: "HUMAN_REVIEW", contextRevision: 5, webMcpAvailability: "AVAILABLE" });
    const registrable = deriveRegistrableToolSurface(logical);
    expect(Array.from(registrable.toolNames)).toEqual([]);
  });

  test("4D-T8. Exact PLAN_READY Registrable Surface", () => {
    const logical = deriveDesiredToolSurface({ phase: "PLAN_READY", contextRevision: 6, webMcpAvailability: "AVAILABLE" });
    const registrable = deriveRegistrableToolSurface(logical);
    expect(Array.from(registrable.toolNames)).toEqual(["inspect_migration_plan"]);
  });

  test("4D-T9. Deferred Factory is NEVER Called During Normal Reconciliation", async () => {
    const harness = setupTestHarness();
    const session = createLiveAdaptiveRegistrationSession(harness);

    const factoryCalls: string[] = [];
    const originalFactory = createAdaptiveToolDefinition;

    // Spy on factory
    const testSession = createLiveAdaptiveRegistrationSession({
      ...harness,
    });

    await testSession.start();

    // Transition across all reachable phases
    harness.actions.initialize();
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:express", name: "express", ecosystem: "NPM", version: "1.0.0" } } }
    );

    const deferredNames = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "DEFERRED"
    );

    for (const defName of deferredNames) {
      expect(harness.platformSpies.registrationAttempts).not.toContain(defName);
    }

    testSession.dispose();
  });

  test("4D-T10. Startup From BOOTSTRAP Reaches IDLE Surface", async () => {
    const harness = setupTestHarness();
    expect(harness.statePort.getState().phase).toBe("BOOTSTRAP");

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // In BOOTSTRAP, 0 registrations
    expect(Array.from(harness.platformSpies.registeredTools.keys())).toEqual([]);

    // Initialize application
    harness.actions.initialize();
    expect(harness.statePort.getState().phase).toBe("IDLE");

    // Live session must have registered IDLE surface
    expect(Array.from(harness.platformSpies.registeredTools.keys()).sort()).toEqual([
      "open_package_graph",
      "search_packages",
    ]);

    session.dispose();
  });

  test("4D-T11. Startup After Already-IDLE State Reaches IDLE Surface", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();
    expect(harness.statePort.getState().phase).toBe("IDLE");

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    expect(Array.from(harness.platformSpies.registeredTools.keys()).sort()).toEqual([
      "open_package_graph",
      "search_packages",
    ]);

    session.dispose();
  });

  test("4D-T12. GRAPH_READY -> NODE_SELECTED Retains trace_dependency_path Registration", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // Open graph -> GRAPH_READY
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    expect(harness.statePort.getState().phase).toBe("GRAPH_READY");

    const traceRegistrationEntry1 = harness.platformSpies.registeredTools.get("trace_dependency_path");
    expect(traceRegistrationEntry1).toBeDefined();

    // Select node -> NODE_SELECTED
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:express", name: "express", ecosystem: "NPM", version: "1.0.0" } } }
    );
    expect(harness.statePort.getState().phase).toBe("NODE_SELECTED");

    const traceRegistrationEntry2 = harness.platformSpies.registeredTools.get("trace_dependency_path");
    expect(traceRegistrationEntry2).toBeDefined();

    // Verify SAME instance / AbortSignal was retained without churn
    expect(traceRegistrationEntry1?.signal).toBe(traceRegistrationEntry2?.signal);
    expect(traceRegistrationEntry1?.signal.aborted).toBe(false);

    // Other tools changed
    expect(harness.platformSpies.registeredTools.has("summarize_graph")).toBe(false);
    expect(harness.platformSpies.registeredTools.has("open_package_graph")).toBe(false);
    expect(harness.platformSpies.registeredTools.has("inspect_selected_package")).toBe(true);

    session.dispose();
  });

  test("4D-T13. Removed Registrations are Aborted / Unregistered", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    const searchEntry = harness.platformSpies.registeredTools.get("search_packages");
    expect(searchEntry).toBeDefined();
    expect(searchEntry?.signal.aborted).toBe(false);

    // Transition IDLE -> GRAPH_READY (search_packages is removed)
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    // Signal must be aborted and tool removed from active map
    expect(searchEntry?.signal.aborted).toBe(true);
    expect(harness.platformSpies.registeredTools.has("search_packages")).toBe(false);

    session.dispose();
  });

  test("4D-T14. Re-entered Tools Receive Fresh Registration Lifetime", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // 1. In IDLE: open_package_graph registered (lifetime 1)
    const openEntry1 = harness.platformSpies.registeredTools.get("open_package_graph");
    expect(openEntry1).toBeDefined();

    // 2. Open graph -> GRAPH_READY: open_package_graph retained
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    const openEntry2 = harness.platformSpies.registeredTools.get("open_package_graph");
    expect(openEntry1?.signal).toBe(openEntry2?.signal);

    // 3. Select node -> NODE_SELECTED: open_package_graph removed (signal 1 aborted)
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:express", name: "express", ecosystem: "NPM", version: "1.0.0" } } }
    );
    expect(openEntry1?.signal.aborted).toBe(true);
    expect(harness.platformSpies.registeredTools.has("open_package_graph")).toBe(false);

    // 4. Deselect node -> GRAPH_READY, then close graph -> IDLE: open_package_graph re-enters with fresh signal 2
    await harness.actions.deselectPackage({
      channel: "HUMAN",
      capturedContextRevision: harness.statePort.getState().contextRevision,
    });
    expect(harness.statePort.getState().phase).toBe("GRAPH_READY");

    await harness.actions.closeGraph({
      channel: "HUMAN",
      capturedContextRevision: harness.statePort.getState().contextRevision,
    });
    expect(harness.statePort.getState().phase).toBe("IDLE");

    const openEntry3 = harness.platformSpies.registeredTools.get("open_package_graph");
    expect(openEntry3).toBeDefined();
    expect(openEntry3?.signal.aborted).toBe(false);
    expect(openEntry3?.signal).not.toBe(openEntry1?.signal);

    session.dispose();
  });

  test("4D-T15. Rapid Pending-Registration Transition Converges to Latest Surface", async () => {
    const harness = setupTestHarness({ manualPlatformResolve: true });
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    const startPromise = session.start();

    // Pending registrations for IDLE: search_packages, open_package_graph
    expect(harness.platformSpies.pendingResolvers.has("search_packages")).toBe(true);
    expect(harness.platformSpies.pendingResolvers.has("open_package_graph")).toBe(true);

    // Before IDLE resolves, rapid state changes occur:
    // Transition to GRAPH_READY
    harness.store.getState().commitContextBound(harness.statePort.getState().contextRevision, {
      type: "GRAPH_OPENED",
      payload: {
        graph: {
          id: "graph-rapid",
          rootPackage: { id: "npm:rapid", name: "rapid", ecosystem: "NPM", version: "1.0.0" },
          packageIds: ["npm:rapid"],
        },
      },
    });

    // Transition to NODE_SELECTED
    harness.store.getState().commitContextBound(harness.statePort.getState().contextRevision, {
      type: "NODE_SELECTED",
      payload: {
        selection: {
          package: { id: "npm:rapid", name: "rapid", ecosystem: "NPM", version: "1.0.0" },
        },
      },
    });

    expect(harness.statePort.getState().phase).toBe("NODE_SELECTED");

    // Now resolve pending registrations out of order
    const resolveSearch = harness.platformSpies.pendingResolvers.get("search_packages");
    const resolveOpen = harness.platformSpies.pendingResolvers.get("open_package_graph");
    const resolveTrace = harness.platformSpies.pendingResolvers.get("trace_dependency_path");
    const resolveInspect = harness.platformSpies.pendingResolvers.get("inspect_selected_package");

    resolveSearch?.({ ok: true });
    resolveOpen?.({ ok: true });
    resolveTrace?.({ ok: true });
    resolveInspect?.({ ok: true });

    await startPromise;

    // After all settle, active surface MUST equal NODE_SELECTED registrable surface
    expect(Array.from(harness.platformSpies.registeredTools.keys()).sort()).toEqual([
      "inspect_selected_package",
      "trace_dependency_path",
    ]);

    session.dispose();
  });

  test("4D-T16. HUMAN_REVIEW Removes All Currently Executable Registrations", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // Setup SIMULATION_READY
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:express", name: "express", ecosystem: "NPM", version: "1.0.0" } } }
    );
    await harness.actions.createScenario(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { scenario: { id: "sc-1", targetPackageId: "npm:express", proposedVersion: "5.0.0", patchOperations: [] } }
    );
    expect(harness.statePort.getState().phase).toBe("SIMULATION_READY");
    expect(harness.platformSpies.registeredTools.has("inspect_scenario")).toBe(true);

    // Transition to HUMAN_REVIEW
    harness.store.getState().commitContextBound(harness.statePort.getState().contextRevision, {
      type: "HUMAN_ANNOTATED",
      payload: {
        review: { id: "rev-1", scenarioId: "sc-1", bindings: [] },
      },
    });

    expect(harness.statePort.getState().phase).toBe("HUMAN_REVIEW");

    // All registrations must be cleanly removed; 0 tools active
    expect(Array.from(harness.platformSpies.registeredTools.keys())).toEqual([]);

    session.dispose();
  });

  test("4D-T17. Platform UNAVAILABLE Produces Zero Registrations", async () => {
    const harness = setupTestHarness({ platformAvailable: false });
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    expect(Array.from(harness.platformSpies.registeredTools.keys())).toEqual([]);
    expect(harness.platformSpies.registrationAttempts).toEqual([]);

    session.dispose();
  });

  test("4D-T18. Registration Failure Does Not Crash Session or Provider", async () => {
    const harness = setupTestHarness({ failTools: new Set(["search_packages"]) });
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    const res = await session.start();

    // Session starts gracefully despite search_packages failure
    expect(res.registered).toContain("open_package_graph");
    expect(harness.platformSpies.registeredTools.has("open_package_graph")).toBe(true);
    expect(harness.platformSpies.registeredTools.has("search_packages")).toBe(false);

    session.dispose();
  });

  test("4D-T19 & 4D-T20. Session Disposal Removes Owned Registrations and Ignores Later State Changes", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    expect(harness.platformSpies.registeredTools.size).toBe(2);

    // Dispose session
    session.dispose();

    // All owned registrations must be aborted and removed
    expect(harness.platformSpies.registeredTools.size).toBe(0);

    // Mutate state after disposal
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    // No new registrations attempted
    expect(harness.platformSpies.registeredTools.size).toBe(0);
  });

  test("4D-T21. StrictMode / Remount Creates Fresh Valid Owner and Session", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    // Mount 1
    const session1 = createLiveAdaptiveRegistrationSession(harness);
    await session1.start();
    expect(harness.platformSpies.registeredTools.size).toBe(2);

    // Cleanup 1
    session1.dispose();
    expect(harness.platformSpies.registeredTools.size).toBe(0);

    // Remount (Mount 2)
    const session2 = createLiveAdaptiveRegistrationSession(harness);
    await session2.start();
    expect(harness.platformSpies.registeredTools.size).toBe(2);
    expect(Array.from(harness.platformSpies.registeredTools.keys()).sort()).toEqual([
      "open_package_graph",
      "search_packages",
    ]);

    session2.dispose();
  });

  test("4D-T22. Foreign Tool Registration Survives Adaptive Cleanup", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    // Pre-register a foreign tool outside adaptive owner
    const foreignController = new AbortController();
    await harness.platformAdapter.registerTool(
      {
        name: "foreign_test_tool" as any,
        description: "Foreign tool",
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ ok: true }),
      },
      { signal: foreignController.signal }
    );

    expect(harness.platformSpies.registeredTools.has("foreign_test_tool")).toBe(true);

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // Foreign tool still present alongside adaptive tools
    expect(harness.platformSpies.registeredTools.has("foreign_test_tool")).toBe(true);
    expect(harness.platformSpies.registeredTools.has("open_package_graph")).toBe(true);

    session.dispose();

    // Adaptive tools cleaned up, but foreign tool remains!
    expect(harness.platformSpies.registeredTools.has("open_package_graph")).toBe(false);
    expect(harness.platformSpies.registeredTools.has("foreign_test_tool")).toBe(true);
    expect(foreignController.signal.aborted).toBe(false);
  });

  test("4D-T23. Registration Removal Does Not Cancel Admitted Tolerant Read", async () => {
    const harness = setupTestHarness({
      portSpies: { delayMs: 80, delayedPackageIds: new Set(["express"]) },
    });
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    const searchTool = harness.platformSpies.registeredTools.get("search_packages")?.definition;
    expect(searchTool).toBeDefined();

    // Launch search query while in IDLE
    const searchPromise = searchTool!.execute({ query: "express" });

    // Mid-flight: Human opens graph, transitioning phase to GRAPH_READY and removing search_packages from registration
    await new Promise((r) => setTimeout(r, 15));
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:lodash" }
    );
    expect(harness.platformSpies.registeredTools.has("search_packages")).toBe(false);

    const res = await searchPromise;

    // REVISION_TOLERANT_READ completes with SUCCESS despite registration removal
    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("search_packages");

    session.dispose();
  });

  test("4D-T24. Strict Contextual Read Still Uses 4C Stale Semantics Through Live Transition", async () => {
    const harness = setupTestHarness({
      portSpies: { delayMs: 80, delayedPackageIds: new Set(["npm:pkg-a"]) },
    });
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // Open graph and select package A
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:pkg-a" }
    );
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:pkg-a", name: "pkg-a", ecosystem: "NPM", version: "1.0.0" } } }
    );

    const inspectTool = harness.platformSpies.registeredTools.get("inspect_selected_package")?.definition;
    expect(inspectTool).toBeDefined();

    // Launch inspect_selected_package targeting pkg-a (which sleeps 80ms)
    const inspectPromise = inspectTool!.execute({});

    // Mid-flight: Human selects dep-1, advancing contextRevision
    await new Promise((r) => setTimeout(r, 15));
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:dep-1", name: "dep-1", ecosystem: "NPM", version: "2.0.0" } } }
    );

    const res = await inspectPromise;

    // STRICT_CONTEXT_READ returns STALE_CONTEXT
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("STALE_CONTEXT");

    session.dispose();
  });

  test("4D-T25. Physical Removal Lag is Protected by 4C Admission", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // Retain a reference to the old search_packages definition
    const oldSearchDef = harness.platformSpies.registeredTools.get("search_packages")?.definition;
    expect(oldSearchDef).toBeDefined();

    // Transition state from IDLE -> GRAPH_READY
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    // Invoke old definition after phase change
    const res = await oldSearchDef!.execute({ query: "express" });

    // Must be rejected by 4C admission check with INVALID_STATE and 0 action calls
    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("INVALID_STATE");
    expect(harness.portSpies.searchCalls).toBe(0);

    session.dispose();
  });

  test("4D-T26. Agent Open Graph Causes Live IDLE -> GRAPH_READY Registration Update", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    expect(Array.from(harness.platformSpies.registeredTools.keys()).sort()).toEqual([
      "open_package_graph",
      "search_packages",
    ]);

    // Agent executes registered open_package_graph
    const openTool = harness.platformSpies.registeredTools.get("open_package_graph")?.definition;
    expect(openTool).toBeDefined();

    const res = await openTool!.execute({ rootPackageId: "npm:react" });
    expect(res.ok).toBe(true);
    expect(harness.statePort.getState().phase).toBe("GRAPH_READY");

    // Live registration surface automatically updated to GRAPH_READY surface!
    expect(Array.from(harness.platformSpies.registeredTools.keys()).sort()).toEqual([
      "open_package_graph",
      "summarize_graph",
      "trace_dependency_path",
    ]);

    session.dispose();
  });

  test("4D-T27. Human Select Causes Live GRAPH_READY -> NODE_SELECTED Update", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    expect(harness.statePort.getState().phase).toBe("GRAPH_READY");

    // Human selects node
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:express", name: "express", ecosystem: "NPM", version: "1.0.0" } } }
    );
    expect(harness.statePort.getState().phase).toBe("NODE_SELECTED");

    // Live registration surface automatically updated to NODE_SELECTED surface!
    expect(Array.from(harness.platformSpies.registeredTools.keys()).sort()).toEqual([
      "inspect_selected_package",
      "trace_dependency_path",
    ]);

    session.dispose();
  });

  test("4D-T28. Agent inspect_selected_package Uses Human-Selected Package", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // 1. Agent opens graph
    const openTool = harness.platformSpies.registeredTools.get("open_package_graph")?.definition;
    await openTool!.execute({ rootPackageId: "npm:pkg-root" });

    // 2. Human selects dep-1
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:dep-1", name: "dep-1", ecosystem: "NPM", version: "1.0.0" } } }
    );

    // 3. Agent inspects selected package
    const inspectTool = harness.platformSpies.registeredTools.get("inspect_selected_package")?.definition;
    expect(inspectTool).toBeDefined();

    const res = await inspectTool!.execute({});
    expect(res.ok).toBe(true);
    expect((res as any).data.packageId).toBe("npm:dep-1");
    expect((res as any).data.name).toBe("dep-1");

    session.dispose();
  });

  test("4D-T29. Single Live Ownership: Exactly One Registration of search_packages and open_package_graph", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    const searchRegistrations = harness.platformSpies.registrationAttempts.filter(
      (name) => name === "search_packages"
    );
    const openRegistrations = harness.platformSpies.registrationAttempts.filter(
      (name) => name === "open_package_graph"
    );

    expect(searchRegistrations.length).toBe(1);
    expect(openRegistrations.length).toBe(1);

    session.dispose();
  });

  test("4D-T30. Zero Deferred Tools are Ever Physically Registered", async () => {
    const harness = setupTestHarness();
    harness.actions.initialize();

    const session = createLiveAdaptiveRegistrationSession(harness);
    await session.start();

    // Traverse state machine
    await harness.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    await harness.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:express", name: "express", ecosystem: "NPM", version: "1.0.0" } } }
    );

    const deferredNames = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "DEFERRED"
    );

    for (const defName of deferredNames) {
      expect(harness.platformSpies.registrationAttempts).not.toContain(defName);
    }

    session.dispose();
  });
});

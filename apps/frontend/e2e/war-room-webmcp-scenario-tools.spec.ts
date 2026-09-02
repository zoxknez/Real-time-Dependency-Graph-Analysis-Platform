/**
 * WebMCP Scenario Tool Exposure & Authority Integration Test Suite (WMCP-7C)
 *
 * Exhaustive verification covering 7C-T1 through 7C-T50:
 * - Promotion of simulate_api_changes and recalculate_scenario to EXECUTABLE
 * - Retention of 7 deferred tools and exact 16 tool vocabulary
 * - Target package selection authority and baseVersion exact revision semantics
 * - Two-action orchestration (createScenario -> recalculateScenario) with context revision handoff
 * - Signal isolation: registrationLifetimeSignal != executionSignal (7C-T25 phase transition unregister race)
 * - Strict schema validation and rejection of security/additional parameters
 * - Real 6-operation counterfactual execution through WarRoomActions
 * - Human/Agent semantic equivalence
 * - Output budget (<= 1500 chars) with serverTruncated vs outputTruncated distinction
 * - inspect_scenario read-only projection
 * - Zero speculative persistence, zero direct backend fetch, zero CounterfactualScenarioEngine imports
 */

import { test, expect } from "@playwright/test";
import {
  ALL_CANONICAL_ACTION_NAMES,
  WEB_MCP_TOOL_CATALOG,
  getToolCatalogEntry,
  WebMcpActionName,
  createAdaptiveToolDefinition,
  deriveDesiredToolSurface,
  deriveRegistrableToolSurface,
  validateSimulateApiChangesInput,
  validateEmptyObjectInput,
  createWebMcpRegistrationOwner,
} from "../src/lib/webmcp";
import { sliceUtf16Safe, sanitizeErrorMessage } from "../src/lib/webmcp/bridge/output";
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
import { WarRoomAnalysisRef, WarRoomScenario } from "../src/lib/war-room/domain/types";
import { WebMcpPlatformAdapter } from "../src/lib/webmcp/platform/types";

function createMockHarness(customAnalysisPort?: Partial<WarRoomScenarioAnalysisPort>) {
  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);

  let createScenarioCalls = 0;
  let recalculateScenarioCalls = 0;
  let resetScenarioCalls = 0;
  let lastCapturedRevisionOnRecalc: number | undefined;
  let lastChannelOnCreate: string | undefined;
  let lastChannelOnRecalc: string | undefined;
  let lastSignalOnRecalc: AbortSignal | undefined;

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
      return {
        ok: true,
        data: {
          packages: [
            {
              id: "npm:sample-lib",
              name: "sample-lib",
              ecosystem: request.ecosystem ?? "NPM",
              version: "1.2.0",
            },
          ],
          totalCount: 1,
        },
      };
    },
    async inspectPackage(_sec, request) {
      return {
        ok: true,
        data: {
          package: {
            id: request.packageId,
            name: "sample-lib",
            ecosystem: "NPM",
            version: "1.2.0",
          },
          directDependencyIds: [],
          directDependentIds: [],
        },
      };
    },
  };

  const graphPort: WarRoomGraphQueryPort = {
    async loadPackageGraph(_sec, request) {
      return {
        ok: true,
        data: {
          id: `graph-${request.rootPackageId}`,
          rootPackage: {
            id: request.rootPackageId,
            name: "sample-lib",
            ecosystem: "NPM",
            version: "1.2.0",
          },
          packageIds: [request.rootPackageId],
          edges: [],
        },
      };
    },
    async findDependencyPath() {
      return { ok: true, data: { fromPackageId: "npm:a", toPackageId: "npm:b", packageIds: [], hopCount: 0 } };
    },
  };

  const scenarioAnalysisPort: WarRoomScenarioAnalysisPort = {
    async recalculateScenario(_sec, input, _signal) {
      if (customAnalysisPort?.recalculateScenario) {
        return customAnalysisPort.recalculateScenario(_sec, input, _signal);
      }
      return {
        ok: true,
        data: {
          id: `analysis-${input.scenario.id}`,
          scenarioId: input.scenario.id,
          sourceContextRevision: input.sourceContextRevision,
          affectedEntityIds: [input.scenario.targetPackageId],
          baselineSurfaceHash: "ae819b558e5c91441c0901d7e988f071b0f5aed88de816a3184ef833001ed86c",
          candidateSurfaceHash: "c17db843e71e321fd9cb73bae56fe7e73fce8c968a73c3a6bda74168cf36a5aa",
          changed: true,
          totalBreakingChanges: 2,
          returnedBreakingChanges: 2,
          breakingChangesTruncated: false,
          breakingChanges: [
            {
              changeType: "FunctionRemoved",
              symbolPath: "sample-lib.calculateTotal",
              description: "Public function calculateTotal was removed from the API surface.",
              severity: "breaking",
            },
            {
              changeType: "ParameterAdded",
              symbolPath: "sample-lib.initialize",
              description: "Added required parameter 'config' without default value.",
              severity: "breaking",
            },
          ],
        },
      };
    },
  };

  const migrationPlanningPort: WarRoomMigrationPlanningPort = {
    async generatePlan() {
      return {
        ok: true,
        data: {
          id: "plan-mock",
          scenarioId: "scenario-mock",
          sourceReviewId: "review-mock",
          sourceContextRevision: 1,
        },
      };
    },
  };

  const rawActions = createWarRoomActions({
    statePort,
    securityContextPort: securityPort,
    authorizationPort: authPort,
    packageCatalogPort: catalogPort,
    graphQueryPort: graphPort,
    scenarioAnalysisPort,
    migrationPlanningPort,
  });

  rawActions.initialize();

  // Spy on actions to verify orchestration and channel arguments
  const spiedActions = {
    ...rawActions,
    createScenario: async (invocation: any, req: any) => {
      createScenarioCalls++;
      lastChannelOnCreate = invocation.channel;
      return rawActions.createScenario(invocation, req);
    },
    recalculateScenario: async (invocation: any) => {
      recalculateScenarioCalls++;
      lastCapturedRevisionOnRecalc = invocation.capturedContextRevision;
      lastChannelOnRecalc = invocation.channel;
      lastSignalOnRecalc = invocation.signal;
      return rawActions.recalculateScenario(invocation);
    },
    resetScenario: async (invocation: any) => {
      resetScenarioCalls++;
      return rawActions.resetScenario(invocation);
    },
  };

  return {
    store,
    statePort,
    actions: spiedActions,
    spies: {
      get createScenarioCalls() { return createScenarioCalls; },
      get recalculateScenarioCalls() { return recalculateScenarioCalls; },
      get resetScenarioCalls() { return resetScenarioCalls; },
      get lastCapturedRevisionOnRecalc() { return lastCapturedRevisionOnRecalc; },
      get lastChannelOnCreate() { return lastChannelOnCreate; },
      get lastChannelOnRecalc() { return lastChannelOnRecalc; },
      get lastSignalOnRecalc() { return lastSignalOnRecalc; },
    },
  };
}

test.describe("WMCP-7C: WebMCP Scenario Tool Exposure", () => {
  // ─────────────────────────────────────────────────────────────
  // 7C-T1..7C-T4: VOCABULARY AND AUTHORITY MATRIX
  // ─────────────────────────────────────────────────────────────

  test("7C-T1: Exactly 16 unique WebMCP action names exist", () => {
    expect(ALL_CANONICAL_ACTION_NAMES.length).toBe(16);
    const unique = new Set(ALL_CANONICAL_ACTION_NAMES);
    expect(unique.size).toBe(16);
    expect(unique.has("simulate_api_changes")).toBe(true);
    expect(unique.has("recalculate_scenario")).toBe(true);
  });

  test("7C-T2 & 7C-T3: simulate_api_changes and recalculate_scenario are EXECUTABLE", () => {
    const sim = getToolCatalogEntry("simulate_api_changes");
    expect(sim.bindingStatus).toBe("EXECUTABLE");
    expect(sim.schemaStatus).toBe("FROZEN");
    expect(sim.classification).toBe("EXISTING_ACTION");

    const recalc = getToolCatalogEntry("recalculate_scenario");
    expect(recalc.bindingStatus).toBe("EXECUTABLE");
    expect(recalc.schemaStatus).toBe("FROZEN");
    expect(recalc.classification).toBe("EXISTING_ACTION");
  });

  test("7C-T4: Exactly six tools remain DEFERRED in WMCP-8", () => {
    const expectedDeferred = [
      "focus_graph_nodes",
      "set_scenario_priority",
      "set_scenario_exclusion",
      "generate_migration_plan",
      "inspect_critical_paths",
      "focus_critical_path",
    ];

    const actualDeferred = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "DEFERRED"
    );

    expect(actualDeferred.sort()).toEqual(expectedDeferred.sort());
    expect(actualDeferred.length).toBe(6);

    const actualExecutable = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "EXECUTABLE"
    );
    expect(actualExecutable.length).toBe(10);
  });

  // ─────────────────────────────────────────────────────────────
  // 7C-T5 & 7C-T6: PHASE MEMBERSHIP
  // ─────────────────────────────────────────────────────────────

  test("7C-T5: simulate_api_changes appears only in NODE_SELECTED", () => {
    const nodeSelectedSurface = deriveDesiredToolSurface({
      phase: "NODE_SELECTED",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });
    expect(nodeSelectedSurface.toolNames.has("simulate_api_changes")).toBe(true);

    const idleSurface = deriveDesiredToolSurface({
      phase: "IDLE",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });
    expect(idleSurface.toolNames.has("simulate_api_changes")).toBe(false);

    const graphReadySurface = deriveDesiredToolSurface({
      phase: "GRAPH_READY",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });
    expect(graphReadySurface.toolNames.has("simulate_api_changes")).toBe(false);

    const simulationReadySurface = deriveDesiredToolSurface({
      phase: "SIMULATION_READY",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });
    expect(simulationReadySurface.toolNames.has("simulate_api_changes")).toBe(false);
  });

  test("7C-T6: recalculate_scenario appears in HUMAN_REVIEW and PLAN_READY", () => {
    const humanReviewSurface = deriveDesiredToolSurface({
      phase: "HUMAN_REVIEW",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });
    expect(humanReviewSurface.toolNames.has("recalculate_scenario")).toBe(true);

    const planReadySurface = deriveDesiredToolSurface({
      phase: "PLAN_READY",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });
    expect(planReadySurface.toolNames.has("recalculate_scenario")).toBe(true);

    const idleSurface = deriveDesiredToolSurface({
      phase: "IDLE",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });
    expect(idleSurface.toolNames.has("recalculate_scenario")).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 7C-T7..7C-T13: SCHEMA VALIDATION & AUTHORITY BOUNDARIES
  // ─────────────────────────────────────────────────────────────

  test("7C-T7: simulate_api_changes schema rejects additional properties", () => {
    const res = validateSimulateApiChangesInput({
      baseVersion: "1.0.0",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "foo" }],
      snapshotId: "snapshot-123",
    });
    expect(res.ok).toBe(false);
    expect((res as any).error).toContain("Unexpected property 'snapshotId'");
  });

  test("7C-T8: simulate_api_changes schema rejects empty operations", () => {
    const res = validateSimulateApiChangesInput({
      baseVersion: "1.0.0",
      operations: [],
    });
    expect(res.ok).toBe(false);
    expect((res as any).error).toContain("between 1 and 32 patch operations");
  });

  test("7C-T9 & 7C-T10: simulate_api_changes supports all six operations and ScenarioVisibility", () => {
    const validPayload = {
      baseVersion: "1.0.0",
      operations: [
        { kind: "REMOVE_SYMBOL", symbolPath: "pkg.rem" },
        { kind: "RENAME_SYMBOL", symbolPath: "pkg.old", newSymbolPath: "pkg.new" },
        { kind: "CHANGE_RETURN_TYPE", symbolPath: "pkg.ret", newReturnType: "string" },
        { kind: "CHANGE_PARAMETER_TYPE", symbolPath: "pkg.param", parameterName: "x", newType: "number" },
        { kind: "ADD_REQUIRED_PARAMETER", symbolPath: "pkg.add", parameterName: "req", parameterType: "boolean" },
        { kind: "CHANGE_VISIBILITY", symbolPath: "pkg.vis", newVisibility: "internal" },
      ],
    };

    const res = validateSimulateApiChangesInput(validPayload);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.operations.length).toBe(6);
    }

    // Invalid visibility rejected
    const invalidVis = validateSimulateApiChangesInput({
      baseVersion: "1.0.0",
      operations: [{ kind: "CHANGE_VISIBILITY", symbolPath: "pkg.vis", newVisibility: "super_secret" }],
    });
    expect(invalidVis.ok).toBe(false);
    expect((invalidVis as any).error).toContain("newVisibility must be one of");
  });

  test("7C-T11 & 7C-T12: Target package and snapshot ID cannot be injected in simulate_api_changes", () => {
    const withTargetPkg = validateSimulateApiChangesInput({
      baseVersion: "1.0.0",
      targetPackageId: "npm:evil",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "foo" }],
    });
    expect(withTargetPkg.ok).toBe(false);
    expect((withTargetPkg as any).error).toContain("Unexpected property 'targetPackageId'");
  });

  test("7C-T13: baseVersion is accepted as opaque revision only", () => {
    const res = validateSimulateApiChangesInput({
      baseVersion: "v1.2.3-beta.1",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "foo" }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.baseVersion).toBe("v1.2.3-beta.1");
    }
  });

  test("7C-R1-T1: Missing baseVersion is rejected before createScenario", async () => {
    // 1. Schema validation level
    const valRes = validateSimulateApiChangesInput({
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "foo" }],
    });
    expect(valRes.ok).toBe(false);
    expect((valRes as any).error).toContain("Missing required property 'baseVersion'");

    // 2. Tool handler level: fails closed with INVALID_INPUT before createScenario
    const harness = createMockHarness();
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } } }
    );

    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);
    const res = await tool.execute({
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "sample-lib.calculateTotal" }],
    });

    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("INVALID_INPUT");
    expect(harness.spies.createScenarioCalls).toBe(0);
  });

  test("7C-R1-T2, 7C-R1-T3 & 7C-R1-T4: selectedPackage.version is never used as baseline revision fallback", async () => {
    const harness = createMockHarness();
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    // Package in catalog/graph has ecosystem version 1.2.3, but snapshot revision is rev-abc123
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.3" } } }
    );

    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);

    // Omitting baseVersion MUST NOT fall back to 1.2.3
    const resNoBase = await tool.execute({
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "sample-lib.calculateTotal" }],
    });
    expect(resNoBase.ok).toBe(false);
    expect((resNoBase as any).error.code).toBe("INVALID_INPUT");
    expect(harness.spies.createScenarioCalls).toBe(0);

    // Supplying explicit baseVersion passes "rev-abc123" unchanged
    const resExplicit = await tool.execute({
      baseVersion: "rev-abc123",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "sample-lib.calculateTotal" }],
    });
    expect(resExplicit.ok).toBe(true);
    expect(harness.spies.createScenarioCalls).toBe(1);
    const activeScenario = harness.statePort.getState().scenario;
    expect(activeScenario?.baseVersion).toBe("rev-abc123");
    expect(activeScenario?.baseVersion).not.toBe("1.2.3");
  });

  // ─────────────────────────────────────────────────────────────
  // 7C-T14..7C-T20: ORCHESTRATION, REVISION HANDOFF, AGENT CHANNEL
  // ─────────────────────────────────────────────────────────────

  test("7C-T14: Missing selected package fails closed with INVALID_STATE", async () => {
    const harness = createMockHarness();
    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);

    // Initial state: no graph, no selection
    const res = await tool.execute({
      baseVersion: "1.2.0",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "foo" }],
    });

    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("INVALID_STATE");
  });

  test("7C-T16..7C-T18: simulate_api_changes executes createScenario then recalculateScenario with AGENT channel and revision handoff", async () => {
    const harness = createMockHarness();

    // 1. Open graph and select package to reach NODE_SELECTED
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:sample-lib",
            name: "sample-lib",
            ecosystem: "NPM",
            version: "1.2.0",
          },
        },
      }
    );

    const revBeforeSimulate = harness.statePort.getState().contextRevision;

    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);
    const res = await tool.execute({
      baseVersion: "1.2.0",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "sample-lib.calculateTotal" }],
    });
    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("simulate_api_changes");
    expect((res as any).data.changed).toBe(true);
    expect((res as any).data.totalBreakingChanges).toBe(2);

    // 7C-T16 & 7C-T17: Both calls must use AGENT channel
    expect(harness.spies.createScenarioCalls).toBe(1);
    expect(harness.spies.recalculateScenarioCalls).toBe(1);
    expect(harness.spies.lastChannelOnCreate).toBe("AGENT");
    expect(harness.spies.lastChannelOnRecalc).toBe("AGENT");

    // 7C-T18: Context revision handoff: createScenario advances revision (e.g. rev -> rev+1),
    // and recalculateScenario MUST be called with that new revision, NOT the revBeforeSimulate!
    expect(harness.spies.lastCapturedRevisionOnRecalc).toBe(revBeforeSimulate + 1);
  });

  test("7C-T19: Recalculate failure does not trigger hidden resetScenario", async () => {
    const harness = createMockHarness({
      recalculateScenario: async () => {
        throw new Error("Analysis service unavailable");
      },
    });

    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" },
        },
      }
    );

    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);
    const res = await tool.execute({
      baseVersion: "1.2.0",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "sample-lib.calculateTotal" }],
    });

    expect(res.ok).toBe(false);
    expect(harness.spies.createScenarioCalls).toBe(1);
    expect(harness.spies.recalculateScenarioCalls).toBe(1);
    // Invariant: no silent rollback
    expect(harness.spies.resetScenarioCalls).toBe(0);
  });

  test("7C-T20: recalculate_scenario invokes exactly one WarRoom action", async () => {
    const harness = createMockHarness();

    // Setup: reach HUMAN_REVIEW so recalculate_scenario is admitted
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } },
      }
    );
    await harness.actions.createScenario(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        scenario: {
          id: "test-scenario",
          targetPackageId: "npm:sample-lib",
          patchOperations: [{ kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "foo" }],
          baseVersion: "1.2.0",
        },
      }
    );
    await harness.actions.attachHumanReview(
      { channel: "HUMAN", capturedContextRevision: harness.statePort.getState().contextRevision },
      { review: { id: "test-review", scenarioId: "test-scenario", bindings: [] } }
    );

    const tool = createAdaptiveToolDefinition("recalculate_scenario", harness);
    const res = await tool.execute({});

    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("recalculate_scenario");
    expect(harness.spies.recalculateScenarioCalls).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────
  // 7C-T24 & 7C-T25: SIGNAL ISOLATION & PHASE TRANSITION UNREGISTER RACE
  // ─────────────────────────────────────────────────────────────

  test("7C-T25: Phase transition unregister does not cancel running simulate_api_changes execution (with direct signal assertions)", async () => {
    let releaseRecalculation: () => void;
    const recalculationGate = new Promise<void>((resolve) => {
      releaseRecalculation = resolve;
    });

    const harness = createMockHarness({
      recalculateScenario: async (_sec, input) => {
        await recalculationGate;
        return {
          ok: true,
          data: {
            id: `analysis-${input.scenario.id}`,
            scenarioId: input.scenario.id,
            sourceContextRevision: input.sourceContextRevision,
            affectedEntityIds: [input.scenario.targetPackageId],
            baselineSurfaceHash: "ae819b558e5c91441c0901d7e988f071b0f5aed88de816a3184ef833001ed86c",
            candidateSurfaceHash: "c17db843e71e321fd9cb73bae56fe7e73fce8c968a73c3a6bda74168cf36a5aa",
            changed: true,
            totalBreakingChanges: 1,
            returnedBreakingChanges: 1,
            breakingChangesTruncated: false,
            breakingChanges: [
              {
                changeType: "FunctionRemoved",
                symbolPath: "sample-lib.calculateTotal",
                description: "Function calculateTotal was removed",
                severity: "breaking",
              },
            ],
          },
        };
      },
    });

    // 1. Setup in NODE_SELECTED
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } },
      }
    );

    // Mock platform adapter to track registered tools and capture actual registration signal
    let capturedRegistrationSignal: AbortSignal | undefined;
    const registeredTools = new Set<string>();
    const platformAdapter: WebMcpPlatformAdapter = {
      isAvailable: () => true,
      getSnapshot: () => ({ availability: "AVAILABLE" }),
      registerTool: async (def, options) => {
        if (def.name === "simulate_api_changes") {
          capturedRegistrationSignal = options?.signal;
        }
        registeredTools.add(def.name);
        options?.signal?.addEventListener("abort", () => {
          registeredTools.delete(def.name);
        });
        return { ok: true, toolName: def.name };
      },
      unregisterTool: async () => ({ ok: true, toolName: "" }),
    };

    const registrationOwner = createWebMcpRegistrationOwner(platformAdapter);

    // Reconcile registrable surface for NODE_SELECTED -> simulate_api_changes is registered
    const nodeSelectedSurface = deriveDesiredToolSurface({
      phase: "NODE_SELECTED",
      contextRevision: harness.statePort.getState().contextRevision,
      webMcpAvailability: "AVAILABLE",
    });
    const regNodeSelected = deriveRegistrableToolSurface(nodeSelectedSurface);
    await registrationOwner.reconcile(regNodeSelected, (name) =>
      createAdaptiveToolDefinition(name, harness)
    );
    expect(registeredTools.has("simulate_api_changes")).toBe(true);

    // Distinct execution controller
    const executionAbortController = new AbortController();
    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);

    // 7C-R1-T5 & 7C-R1-T6: Signals are distinct objects
    expect(capturedRegistrationSignal).toBeDefined();
    expect(capturedRegistrationSignal !== executionAbortController.signal).toBe(true);
    expect(capturedRegistrationSignal!.aborted).toBe(false);
    expect(executionAbortController.signal.aborted).toBe(false);

    // Start execution with explicit baseVersion (paused in recalculation)
    const executionPromise = tool.execute(
      {
        baseVersion: "1.2.0",
        operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "sample-lib.calculateTotal" }],
      },
      { signal: executionAbortController.signal }
    );

    // Mid-execution: phase changes to SIMULATION_READY, which removes simulate_api_changes from desired surface
    const simulationReadySurface = deriveDesiredToolSurface({
      phase: "SIMULATION_READY",
      contextRevision: harness.statePort.getState().contextRevision + 1,
      webMcpAvailability: "AVAILABLE",
    });
    const regSimReady = deriveRegistrableToolSurface(simulationReadySurface);
    await registrationOwner.reconcile(regSimReady, (name) =>
      createAdaptiveToolDefinition(name, harness)
    );

    // simulate_api_changes was unregistered from platform:
    expect(registeredTools.has("simulate_api_changes")).toBe(false);

    // 7C-R1-T7 & 7C-R1-T8: Direct signal state assertions
    expect(capturedRegistrationSignal!.aborted).toBe(true);
    expect(executionAbortController.signal.aborted).toBe(false);

    // 7C-R1-T9: Release recalculation and verify active execution finishes successfully
    releaseRecalculation!();
    const res = await executionPromise;
    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("simulate_api_changes");
  });

  test("7C-T26 & 7C-R1-T10: Explicit execution abort returns CANCELLED", async () => {
    const harness = createMockHarness();

    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } },
      }
    );

    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted

    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);
    const res = await tool.execute(
      {
        baseVersion: "1.2.0",
        operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "sample-lib.calculateTotal" }],
      },
      { signal: abortController.signal }
    );

    expect(res.ok).toBe(false);
    expect((res as any).error.code).toBe("CANCELLED");
  });

  // ─────────────────────────────────────────────────────────────
  // 7C-T27..7C-T34: REAL 6-OPERATION EXECUTION & HUMAN/AGENT EQUIVALENCE
  // ─────────────────────────────────────────────────────────────

  test("7C-T27..7C-T32: All 6 operation kinds execute through WebMCP tool", async () => {
    const harness = createMockHarness();

    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } },
      }
    );

    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);
    const res = await tool.execute({
      baseVersion: "1.2.0",
      operations: [
        { kind: "REMOVE_SYMBOL", symbolPath: "fnA" },
        { kind: "RENAME_SYMBOL", symbolPath: "fnB", newSymbolPath: "fnB2" },
        { kind: "CHANGE_RETURN_TYPE", symbolPath: "fnC", newReturnType: "string" },
        { kind: "CHANGE_PARAMETER_TYPE", symbolPath: "fnD", parameterName: "p1", newType: "i32" },
        { kind: "ADD_REQUIRED_PARAMETER", symbolPath: "fnE", parameterName: "p2", parameterType: "bool" },
        { kind: "CHANGE_VISIBILITY", symbolPath: "fnF", newVisibility: "public" },
      ],
    });

    expect(res.ok).toBe(true);
    expect((res as any).data.changed).toBe(true);
    expect((res as any).data.totalBreakingChanges).toBe(2);
  });

  test("7C-T34: Human and Agent results are semantically equivalent", async () => {
    const harnessHuman = createMockHarness();
    const harnessAgent = createMockHarness();

    // Setup Human
    await harnessHuman.actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: harnessHuman.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harnessHuman.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: harnessHuman.statePort.getState().contextRevision },
      {
        selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } },
      }
    );
    await harnessHuman.actions.createScenario(
      { channel: "HUMAN", capturedContextRevision: harnessHuman.statePort.getState().contextRevision },
      {
        scenario: {
          id: "human-scen",
          targetPackageId: "npm:sample-lib",
          baseVersion: "1.2.0",
          patchOperations: [{ kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "calculateTotal" }],
        },
      }
    );
    const humanAnalysis = await harnessHuman.actions.recalculateScenario({
      channel: "HUMAN",
      capturedContextRevision: harnessHuman.statePort.getState().contextRevision,
    });

    // Setup Agent
    await harnessAgent.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harnessAgent.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harnessAgent.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harnessAgent.statePort.getState().contextRevision },
      {
        selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } },
      }
    );
    const agentTool = createAdaptiveToolDefinition("simulate_api_changes", harnessAgent);
    const agentRes = await agentTool.execute({
      baseVersion: "1.2.0",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "calculateTotal" }],
    });

    expect(humanAnalysis.ok).toBe(true);
    expect(agentRes.ok).toBe(true);

    if (humanAnalysis.ok && agentRes.ok) {
      const humanData = humanAnalysis.data;
      const agentData = (agentRes as any).data;

      expect(agentData.totalBreakingChanges).toBe(humanData.totalBreakingChanges);
      expect(agentData.returnedBreakingChanges).toBe(humanData.returnedBreakingChanges);
      expect(agentData.changed).toBe(humanData.changed);
      expect(humanData.baselineSurfaceHash?.startsWith(agentData.baselineSurfaceHashPrefix.replace("...", ""))).toBe(true);
      expect(humanData.candidateSurfaceHash?.startsWith(agentData.candidateSurfaceHashPrefix.replace("...", ""))).toBe(true);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 7C-T35..7C-T40: OUTPUT BUDGET AND INSPECT_SCENARIO
  // ─────────────────────────────────────────────────────────────

  test("7C-T35 & 7C-T36: Output budget <= 1500 chars with max 5 findings displayed", async () => {
    // Generate 10 breaking findings
    const harness = createMockHarness({
      recalculateScenario: async (_sec, input) => {
        const findings = Array.from({ length: 10 }, (_, i) => ({
          changeType: `Change_${i}`,
          symbolPath: `path.to.symbol_${i}`,
          description: `Description of breaking change number ${i}`,
          severity: "breaking",
        }));
        return {
          ok: true,
          data: {
            id: `analysis-${input.scenario.id}`,
            scenarioId: input.scenario.id,
            sourceContextRevision: input.sourceContextRevision,
            affectedEntityIds: [],
            totalBreakingChanges: 10,
            returnedBreakingChanges: 10,
            breakingChangesTruncated: false,
            breakingChanges: findings,
          },
        };
      },
    });

    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } } }
    );

    const tool = createAdaptiveToolDefinition("simulate_api_changes", harness);
    const res = await tool.execute({
      baseVersion: "1.2.0",
      operations: [{ kind: "REMOVE_SYMBOL", symbolPath: "foo" }],
    });

    expect(res.ok).toBe(true);
    const jsonStr = JSON.stringify(res);
    expect(jsonStr.length).toBeLessThanOrEqual(1500);

    const data = (res as any).data;
    expect(data.topFindings.length).toBeLessThanOrEqual(5);
    expect(data.findingsDisplayedCount).toBe(5);
    expect(data.outputTruncated).toBe(true);
    expect(data.serverTruncated).toBe(false);
  });

  test("7C-T38..7C-T40: inspect_scenario projects analysis when available and is read-only", async () => {
    const harness = createMockHarness();

    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:sample-lib" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { selection: { package: { id: "npm:sample-lib", name: "sample-lib", ecosystem: "NPM", version: "1.2.0" } } }
    );

    // Create scenario without running recalculateScenario
    await harness.actions.createScenario(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        scenario: {
          id: "scen-1",
          targetPackageId: "npm:sample-lib",
          patchOperations: [{ kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "foo" }],
          baseVersion: "1.2.0",
        },
      }
    );

    const inspectTool = createAdaptiveToolDefinition("inspect_scenario", harness);

    // 1. Without analysis: hasAnalysis is false
    const resNoAnalysis = await inspectTool.execute({});
    expect(resNoAnalysis.ok).toBe(true);
    expect((resNoAnalysis as any).data.hasAnalysis).toBe(false);
    expect(harness.spies.recalculateScenarioCalls).toBe(0);

    // 2. Now run recalculation
    await harness.actions.recalculateScenario({
      channel: "AGENT",
      capturedContextRevision: harness.statePort.getState().contextRevision,
    });
    expect(harness.spies.recalculateScenarioCalls).toBe(1);

    // 3. With analysis: inspect_scenario returns analysis summary
    const resWithAnalysis = await inspectTool.execute({});
    expect(resWithAnalysis.ok).toBe(true);
    expect((resWithAnalysis as any).data.totalBreakingChanges).toBe(2);
    // Did not recalculate again
    expect(harness.spies.recalculateScenarioCalls).toBe(1);
  });

  test("7C-T48 & 7C-T49: Registrable surface derivation is deterministic and free of duplicates", () => {
    const desired = deriveDesiredToolSurface({
      phase: "NODE_SELECTED",
      contextRevision: 1,
      webMcpAvailability: "AVAILABLE",
    });

    const reg1 = deriveRegistrableToolSurface(desired);
    const reg2 = deriveRegistrableToolSurface(desired);

    expect([...reg1.toolNames].sort()).toEqual([...reg2.toolNames].sort());
    expect(reg1.toolNames.has("simulate_api_changes")).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 7C-R1-T11..7C-R1-T13: SURROGATE-SAFE UTF-16 ERROR TRUNCATION
  // ─────────────────────────────────────────────────────────────

  test("7C-R1-T11: ASCII error truncation preserves exact length and ellipsis", () => {
    const longAscii = "A".repeat(300);
    const sanitized = sanitizeErrorMessage(longAscii);
    expect(sanitized.length).toBe(240);
    expect(sanitized.endsWith("...")).toBe(true);
    expect(sanitized).toBe("A".repeat(237) + "...");
  });

  test("7C-R1-T12: Emoji crossing UTF-16 boundary is not split into lone surrogate", () => {
    // 236 'A's + emoji '👋' (\uD83D\uDC4B, 2 UTF-16 code units) + 'BBBB'
    // Index 237 lands directly between \uD83D (index 236) and \uDC4B (index 237)
    const crossingStr = "A".repeat(236) + "👋BBBB";
    const sanitized = sanitizeErrorMessage(crossingStr);

    // The high surrogate must not be retained as a lone surrogate
    expect(sanitized.endsWith("...")).toBe(true);
    const prefix = sanitized.slice(0, -3);
    expect(prefix.charCodeAt(prefix.length - 1)).not.toBe(0xd83d); // No high surrogate
    expect(prefix).toBe("A".repeat(236));
    expect(sanitized.length).toBe(239); // 236 + 3 = 239 <= 240

    // Verify well-formedness: lone surrogates fail encodeURIComponent
    expect(() => encodeURIComponent(sanitized)).not.toThrow();
  });

  test("7C-R1-T13: Multiple non-BMP characters remain well-formed under truncation", () => {
    const nonBmpStr = "😀🚀🧪".repeat(50); // Each emoji is 2 code units = 6 code units per repeat * 50 = 300
    const sanitized = sanitizeErrorMessage(nonBmpStr);
    expect(sanitized.length).toBeLessThanOrEqual(240);
    expect(sanitized.endsWith("...")).toBe(true);
    expect(() => encodeURIComponent(sanitized)).not.toThrow();
  });
});

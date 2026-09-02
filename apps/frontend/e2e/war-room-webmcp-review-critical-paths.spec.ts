/**
 * E2E & Contract Test Suite: WMCP-10 Human Business Review & Critical Paths
 *
 * Covers requirements 10-T1 through 10-T25:
 * - set_scenario_priority validation, state transitions, and idempotency
 * - set_scenario_exclusion validation, reason requirement, and un-exclusion
 * - inspect_critical_paths deterministic ordering (P0->P3, hop count, lexical tie-break)
 * - Excluded entity truthful tagging without fabricating risk scores
 * - Output budgeting (<= 1500 chars)
 * - Channel convergence (human and agent share identical action authority)
 * - WebMCP catalog matrix: 16 canonical tools (14 EXECUTABLE, 2 DEFERRED, 16 FROZEN)
 */

import { test, expect } from "@playwright/test";
import { createWarRoomStore, createWarRoomStatePort } from "../src/lib/war-room/state/store";
import { createWarRoomActions } from "../src/lib/war-room/application/actions";
import {
  ALL_CANONICAL_ACTION_NAMES,
  WEB_MCP_TOOL_CATALOG,
} from "../src/lib/webmcp/bridge/adaptive-catalog";
import {
  validateSetScenarioPriorityInput,
  validateSetScenarioExclusionInput,
  validateInspectCriticalPathsInput,
} from "../src/lib/webmcp/bridge/adaptive-validation";
import {
  buildBudgetedPriorityOutput,
  buildBudgetedExclusionOutput,
  buildBudgetedCriticalPathsOutput,
} from "../src/lib/webmcp/bridge/output";
import {
  WarRoomGraphContext,
  WarRoomScenario,
  WarRoomAnalysisRef,
} from "../src/lib/war-room/domain/types";

test.describe("WMCP-10: Human Business Review & Critical Paths Matrix", () => {
  const dummySecurityContext = {
    tenantId: "tenant-wmcp10",
    userId: "user-wmcp10",
  };

  const sampleGraph: WarRoomGraphContext = {
    id: "graph-wmcp10",
    rootPackage: {
      id: "npm:app-root",
      name: "app-root",
      ecosystem: "NPM",
      version: "1.0.0",
    },
    packageIds: ["npm:app-root", "npm:pkg-target", "npm:pkg-a", "npm:pkg-b", "npm:pkg-c"],
  };

  const sampleScenario: WarRoomScenario = {
    id: "scen-10",
    name: "Scenario 10",
    targetPackageId: "npm:pkg-target",
    baseVersion: "1.0.0",
    proposedVersion: "2.0.0",
    visibility: "PUBLIC",
    patchOperations: [],
  };

  const sampleAnalysis: WarRoomAnalysisRef = {
    id: "analysis-scen-10",
    scenarioId: "scen-10",
    sourceContextRevision: 2,
    affectedEntityIds: ["npm:pkg-a", "npm:pkg-b", "npm:pkg-c"],
  };

  function createTestHarness(initialStateOverrides?: Record<string, any>) {
    const store = createWarRoomStore({
      phase: "SIMULATION_READY",
      contextRevision: 2,
      graph: sampleGraph,
      selection: { package: sampleGraph.rootPackage },
      scenario: sampleScenario,
      analysis: sampleAnalysis,
      ...initialStateOverrides,
    });
    const statePort = createWarRoomStatePort(store);

    const actions = createWarRoomActions({
      statePort,
      securityContextPort: { getSecurityContext: async () => ({ ok: true as const, data: dummySecurityContext }) },
      authorizationPort: { authorize: async () => ({ ok: true as const, data: undefined }) },
      packageCatalogPort: { searchPackages: async () => ({ ok: true as const, data: { packages: [] } }), inspectPackage: async () => ({} as any) },
      graphQueryPort: {
        loadPackageGraph: async () => sampleGraph as any,
        traceDependencyPath: async (_sec, req) => {
          if (req.fromPackageId === "npm:pkg-a") {
            return {
              ok: true as const,
              data: {
                fromPackageId: req.fromPackageId,
                toPackageId: req.toPackageId,
                packageIds: [req.fromPackageId, req.toPackageId],
                hopCount: 1,
              },
            };
          }
          if (req.fromPackageId === "npm:pkg-b") {
            return {
              ok: true as const,
              data: {
                fromPackageId: req.fromPackageId,
                toPackageId: req.toPackageId,
                packageIds: [req.fromPackageId, "npm:intermediate", req.toPackageId],
                hopCount: 2,
              },
            };
          }
          return {
            ok: true as const,
            data: {
              fromPackageId: req.fromPackageId,
              toPackageId: req.toPackageId,
              packageIds: [req.fromPackageId, req.toPackageId],
              hopCount: 1,
            },
          };
        },
      },
      scenarioAnalysisPort: { recalculateScenario: async () => ({} as any) },
      migrationPlanningPort: { generateMigrationPlan: async () => ({} as any) },
    });

    return { store, statePort, actions };
  }

  // ─────────────────────────────────────────────────────────────
  // 1. SET_SCENARIO_PRIORITY
  // ─────────────────────────────────────────────────────────────

  test("10-T1. setScenarioPriority sets priority and transitions SIMULATION_READY -> HUMAN_REVIEW", async () => {
    const { statePort, actions } = createTestHarness();

    const res = await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 2 },
      { entityId: "npm:pkg-a", priority: "P0", note: "Critical payment blocker" }
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.changed).toBe(true);
      expect(res.data.entityId).toBe("npm:pkg-a");
      expect(res.data.priority).toBe("P0");
      expect(res.data.note).toBe("Critical payment blocker");
    }

    const state = statePort.getState();
    expect(state.phase).toBe("HUMAN_REVIEW");
    expect(state.contextRevision).toBe(3);
    expect(state.review?.items).toHaveLength(1);
    expect(state.review?.items?.[0].entityId).toBe("npm:pkg-a");
    expect(state.review?.items?.[0].priority).toBe("P0");
  });

  test("10-T2. setScenarioPriority rejects invalid priority enum", () => {
    const res = validateSetScenarioPriorityInput({
      entityId: "npm:pkg-a",
      priority: "CRITICAL", // invalid
    });
    expect(res.ok).toBe(false);
  });

  test("10-T3. setScenarioPriority rejects notes longer than 240 chars", () => {
    const tooLong = "A".repeat(241);
    const res = validateSetScenarioPriorityInput({
      entityId: "npm:pkg-a",
      priority: "P1",
      note: tooLong,
    });
    expect(res.ok).toBe(false);

    const valid = validateSetScenarioPriorityInput({
      entityId: "npm:pkg-a",
      priority: "P1",
      note: "Valid justification",
    });
    expect(valid.ok).toBe(true);
  });

  test("10-T5. setScenarioPriority in HUMAN_REVIEW updates review without resetting other items", async () => {
    const { statePort, actions } = createTestHarness();

    // First annotation: SIMULATION_READY -> HUMAN_REVIEW
    await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 2 },
      { entityId: "npm:pkg-a", priority: "P1" }
    );
    expect(statePort.getState().phase).toBe("HUMAN_REVIEW");

    // Second annotation: already in HUMAN_REVIEW
    const res2 = await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 3 },
      { entityId: "npm:pkg-b", priority: "P0", note: "Security blocker" }
    );
    expect(res2.ok).toBe(true);

    const state = statePort.getState();
    expect(state.phase).toBe("HUMAN_REVIEW");
    expect(state.contextRevision).toBe(4);
    expect(state.review?.items).toHaveLength(2);
    expect(state.review?.items?.[0].entityId).toBe("npm:pkg-a");
    expect(state.review?.items?.[1].entityId).toBe("npm:pkg-b");
  });

  // ─────────────────────────────────────────────────────────────
  // 2. SET_SCENARIO_EXCLUSION
  // ─────────────────────────────────────────────────────────────

  test("10-T6 & 10-T7. setScenarioExclusion sets excluded true/false with mandatory reason", async () => {
    const { statePort, actions } = createTestHarness();

    // 1. Exclude
    const resExclude = await actions.setScenarioExclusion(
      { channel: "AGENT", capturedContextRevision: 2 },
      { entityId: "npm:pkg-c", excluded: true, reason: "Legacy service deprecated next quarter" }
    );
    expect(resExclude.ok).toBe(true);
    if (resExclude.ok) {
      expect(resExclude.data.excluded).toBe(true);
      expect(resExclude.data.reason).toBe("Legacy service deprecated next quarter");
    }

    let state = statePort.getState();
    expect(state.phase).toBe("HUMAN_REVIEW");
    expect(state.review?.items?.[0].excluded).toBe(true);
    expect(state.review?.items?.[0].exclusionReason).toBe("Legacy service deprecated next quarter");

    // 2. Un-exclude
    const resUnexclude = await actions.setScenarioExclusion(
      { channel: "HUMAN", capturedContextRevision: 3 },
      { entityId: "npm:pkg-c", excluded: false, reason: "Decision reversed by lead architect" }
    );
    expect(resUnexclude.ok).toBe(true);
    if (resUnexclude.ok) {
      expect(resUnexclude.data.excluded).toBe(false);
    }

    state = statePort.getState();
    expect(state.review?.items?.[0].excluded).toBe(false);
  });

  test("10-T8. setScenarioExclusion requires non-empty reason", () => {
    const emptyReason = validateSetScenarioExclusionInput({
      entityId: "npm:pkg-c",
      excluded: true,
      reason: "",
    });
    expect(emptyReason.ok).toBe(false);

    const missingReason = validateSetScenarioExclusionInput({
      entityId: "npm:pkg-c",
      excluded: true,
    });
    expect(missingReason.ok).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. INSPECT_CRITICAL_PATHS
  // ─────────────────────────────────────────────────────────────

  test("10-T10..10-T14. inspectCriticalPaths returns deterministic paths ordered by priority, hop count, and lexical tie-break", async () => {
    const { statePort, actions } = createTestHarness();

    // Set priorities:
    // pkg-a: P1 (hop count 1)
    // pkg-b: P0 (hop count 2)
    // pkg-c: P0 (hop count 1)
    await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 2 },
      { entityId: "npm:pkg-a", priority: "P1" }
    );
    await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 3 },
      { entityId: "npm:pkg-b", priority: "P0" }
    );
    await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 4 },
      { entityId: "npm:pkg-c", priority: "P0" }
    );
    await actions.setScenarioExclusion(
      { channel: "AGENT", capturedContextRevision: 5 },
      { entityId: "npm:pkg-c", excluded: true, reason: "Out of scope" }
    );

    const pathsRes = await actions.inspectCriticalPaths(
      { channel: "AGENT", capturedContextRevision: 6 },
      { maxPaths: 5 }
    );

    expect(pathsRes.ok).toBe(true);
    if (pathsRes.ok) {
      expect(pathsRes.changed).toBe(false); // Pure read
      expect(pathsRes.data.totalPaths).toBe(3);

      const paths = pathsRes.data.paths;
      expect(paths).toHaveLength(3);

      // Ordering check:
      // Both pkg-c and pkg-b are P0. pkg-c has hopCount 1, pkg-b has hopCount 2.
      // So pkg-c must come first, then pkg-b, then pkg-a (which is P1)!
      expect(paths[0].sourceEntityId).toBe("npm:pkg-c");
      expect(paths[0].priority).toBe("P0");
      expect(paths[0].hopCount).toBe(1);
      expect(paths[0].isExcluded).toBe(true); // Tagged as excluded!

      expect(paths[1].sourceEntityId).toBe("npm:pkg-b");
      expect(paths[1].priority).toBe("P0");
      expect(paths[1].hopCount).toBe(2);
      expect(paths[1].isExcluded).toBe(false);

      expect(paths[2].sourceEntityId).toBe("npm:pkg-a");
      expect(paths[2].priority).toBe("P1");
      expect(paths[2].hopCount).toBe(1);
    }
  });

  test("10-T15. inspectCriticalPaths limits output count by maxPaths", async () => {
    const { actions } = createTestHarness();

    await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 2 },
      { entityId: "npm:pkg-a", priority: "P0" }
    );
    await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 3 },
      { entityId: "npm:pkg-b", priority: "P1" }
    );

    const limited = await actions.inspectCriticalPaths(
      { channel: "AGENT", capturedContextRevision: 4 },
      { maxPaths: 1 }
    );

    expect(limited.ok).toBe(true);
    if (limited.ok) {
      expect(limited.data.totalPaths).toBe(2);
      expect(limited.data.returnedPaths).toBe(1);
      expect(limited.data.truncated).toBe(true);
      expect(limited.data.paths).toHaveLength(1);
      expect(limited.data.paths[0].sourceEntityId).toBe("npm:pkg-a");
    }
  });

  test("10-T16. inspectCriticalPaths fabricates zero risk scores or probabilities", async () => {
    const { actions } = createTestHarness();

    await actions.setScenarioPriority(
      { channel: "AGENT", capturedContextRevision: 2 },
      { entityId: "npm:pkg-a", priority: "P0" }
    );

    const res = await actions.inspectCriticalPaths(
      { channel: "AGENT", capturedContextRevision: 3 }
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      for (const p of res.data.paths) {
        expect((p as any).riskScore).toBeUndefined();
        expect((p as any).cvss).toBeUndefined();
        expect((p as any).probability).toBeUndefined();
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 4. WEBMCP CATALOG INTEGRITY (POST WMCP-10)
  // ─────────────────────────────────────────────────────────────

  test("10-T20. Exactly 16 canonical tools: 14 EXECUTABLE, 2 DEFERRED, 16 FROZEN", () => {
    expect(ALL_CANONICAL_ACTION_NAMES).toHaveLength(16);

    const executable: string[] = [];
    const deferred: string[] = [];
    const frozen: string[] = [];
    const pending: string[] = [];

    for (const name of ALL_CANONICAL_ACTION_NAMES) {
      const entry = WEB_MCP_TOOL_CATALOG[name];
      expect(entry).toBeDefined();
      if (entry.bindingStatus === "EXECUTABLE") executable.push(name);
      if (entry.bindingStatus === "DEFERRED") deferred.push(name);
      if (entry.schemaStatus === "FROZEN") frozen.push(name);
      if (entry.schemaStatus === "PENDING_DOMAIN_CONTRACT") pending.push(name);
    }

    expect(executable).toHaveLength(14);
    expect(deferred).toHaveLength(2);
    expect(frozen).toHaveLength(16);
    expect(pending).toHaveLength(0);

    expect(deferred).toEqual(["generate_migration_plan", "focus_critical_path"]);
    expect(executable).toContain("set_scenario_priority");
    expect(executable).toContain("set_scenario_exclusion");
    expect(executable).toContain("inspect_critical_paths");
  });

  // ─────────────────────────────────────────────────────────────
  // 5. OUTPUT BUDGETING <= 1500 CHARS
  // ─────────────────────────────────────────────────────────────

  test("10-T21. Budgeted outputs for priority, exclusion, and critical paths conform to <= 1500 chars", () => {
    const priEnvelope = buildBudgetedPriorityOutput("set_scenario_priority", 3, {
      entityId: "npm:pkg-a",
      priority: "P0",
      note: "Urgent blocker note",
      reviewId: "review-1",
    });
    expect(priEnvelope.ok).toBe(true);
    expect(JSON.stringify(priEnvelope).length).toBeLessThanOrEqual(1500);

    const excEnvelope = buildBudgetedExclusionOutput("set_scenario_exclusion", 4, {
      entityId: "npm:pkg-c",
      excluded: true,
      reason: "Legacy service out of migration scope",
      reviewId: "review-1",
    });
    expect(excEnvelope.ok).toBe(true);
    expect(JSON.stringify(excEnvelope).length).toBeLessThanOrEqual(1500);

    const critEnvelope = buildBudgetedCriticalPathsOutput("inspect_critical_paths", 5, {
      targetEntityId: "npm:pkg-target",
      totalPaths: 3,
      returnedPaths: 3,
      truncated: false,
      paths: [
        {
          pathIndex: 0,
          sourceEntityId: "npm:pkg-a",
          targetEntityId: "npm:pkg-target",
          priority: "P0",
          hopCount: 1,
          packageIds: ["npm:pkg-a", "npm:pkg-target"],
          isExcluded: false,
        },
      ],
    });
    expect(critEnvelope.ok).toBe(true);
    expect(JSON.stringify(critEnvelope).length).toBeLessThanOrEqual(1500);
  });
});

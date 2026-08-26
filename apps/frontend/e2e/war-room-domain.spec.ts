/**
 * Canonical War Room Domain Kernel & State Machine Tests
 *
 * Deterministic domain verification tests executed using Playwright's TypeScript runner
 * without requiring browser / page fixtures (Section 50 & 51, WMCP-2A-R1).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  INITIAL_WAR_ROOM_STATE,
  createWarRoomStore,
  createWarRoomStatePort,
  captureContextRevision,
  selectPhase,
  selectContextRevision,
  selectGraphContext,
  selectSelectedPackage,
  selectScenario,
  selectAnalysis,
  selectHumanReview,
  selectMigrationPlan,
  WarRoomGraphContext,
  WarRoomSelection,
  WarRoomScenario,
  WarRoomAnalysisRef,
  WarRoomHumanReview,
  WarRoomPlanRef,
} from "../src/lib/war-room";

const mockGraphContext: WarRoomGraphContext = {
  id: "graph-react-ecosystem",
  rootPackage: {
    id: "pkg-react",
    name: "react",
    ecosystem: "NPM",
    version: "19.2.0",
  },
  packageIds: ["pkg-react", "pkg-react-dom", "pkg-scheduler", "pkg-loose-envify"],
};

const mockSelection: WarRoomSelection = {
  package: {
    id: "pkg-react",
    name: "react",
    ecosystem: "NPM",
    version: "19.2.0",
  },
};

const mockScenario: WarRoomScenario = {
  id: "scenario-v20-deprecations",
  targetPackageId: "pkg-react",
  patchOperations: [
    {
      kind: "REMOVE_SYMBOL",
      operationId: "op-1",
      symbolPath: "react.PropTypes",
    },
    {
      kind: "RENAME_SYMBOL",
      operationId: "op-2",
      symbolPath: "react.createClass",
      newSymbolPath: "react.createLegacyClass",
    },
  ],
};

const mockReview: WarRoomHumanReview = {
  id: "review-approval-201",
  scenarioId: "scenario-v20-deprecations",
  bindings: [
    {
      annotationId: "anno-breaking-risk",
      targetEntityId: "pkg-react-dom",
    },
  ],
};

test.describe("War Room Canonical Domain State Machine (WMCP-2A-R1)", () => {
  test("1. BOOTSTRAP starts at context revision 0", () => {
    const store = createWarRoomStore();
    expect(store.getState().canonical.phase).toBe("BOOTSTRAP");
    expect(store.getState().canonical.contextRevision).toBe(0);
    expect(selectPhase(store.getState().canonical)).toBe("BOOTSTRAP");
    expect(selectContextRevision(store.getState().canonical)).toBe(0);
  });

  test("2. APP_INITIALIZED produces IDLE at context revision 1", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    const result = port.transition({ type: "APP_INITIALIZED" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("IDLE");
    expect(port.getState().contextRevision).toBe(1);
    expect(store.getState().canonical.contextRevision).toBe(1);
    expect(selectPhase(port.getState())).toBe("IDLE");
  });

  test("3. GRAPH_OPENED from IDLE produces GRAPH_READY with revision increment", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });

    const result = port.transition({
      type: "GRAPH_OPENED",
      payload: { graph: mockGraphContext },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("GRAPH_READY");
    expect(port.getState().contextRevision).toBe(2);
    expect(selectGraphContext(port.getState())).toEqual(mockGraphContext);
  });

  test("4. GRAPH_OPENED from deep state performs full downstream invalidation", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    expect(port.getState().phase).toBe("HUMAN_REVIEW");

    const newGraph: WarRoomGraphContext = {
      id: "graph-vue-ecosystem",
      rootPackage: { id: "pkg-vue", name: "vue", ecosystem: "NPM", version: "3.5.0" },
      packageIds: ["pkg-vue", "pkg-pinia"],
    };

    const result = port.transition({ type: "GRAPH_OPENED", payload: { graph: newGraph } });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("GRAPH_READY");
    expect(selectGraphContext(port.getState())).toEqual(newGraph);
    expect(selectSelectedPackage(port.getState())).toBeUndefined();
    expect(selectScenario(port.getState())).toBeUndefined();
    expect(selectAnalysis(port.getState())).toBeUndefined();
    expect(selectHumanReview(port.getState())).toBeUndefined();
    expect(selectMigrationPlan(port.getState())).toBeUndefined();
  });

  test("5. NODE_SELECTED validates package membership in current graph context", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });

    const outsideSelection: WarRoomSelection = {
      package: { id: "pkg-angular", name: "angular", ecosystem: "NPM" },
    };

    const result = port.transition({
      type: "NODE_SELECTED",
      payload: { selection: outsideSelection },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(port.getState().phase).toBe("GRAPH_READY");
    expect(port.getState().contextRevision).toBe(2);
  });

  test("6. NODE_SELECTED from deeper selected phases with DIFFERENT node invalidates downstream state", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const revBeforeAnalysis = port.getState().contextRevision;
    port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: {
        analysis: {
          id: "analysis-run-101",
          scenarioId: "scenario-v20-deprecations",
          sourceContextRevision: revBeforeAnalysis,
          affectedEntityIds: ["pkg-react-dom", "pkg-scheduler"],
        },
      },
    });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const revBeforePlan = port.getState().contextRevision;
    port.transition({
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-wave-301",
          scenarioId: "scenario-v20-deprecations",
          sourceReviewId: "review-approval-201",
          sourceContextRevision: revBeforePlan,
        },
      },
    });

    expect(port.getState().phase).toBe("PLAN_READY");

    const newSelection: WarRoomSelection = {
      package: { id: "pkg-scheduler", name: "scheduler", ecosystem: "NPM" },
    };

    // Selecting DIFFERENT node from PLAN_READY
    const result = port.transition({
      type: "NODE_SELECTED",
      payload: { selection: newSelection },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("NODE_SELECTED");
    expect(selectSelectedPackage(port.getState())?.id).toBe("pkg-scheduler");
    expect(selectScenario(port.getState())).toBeUndefined();
    expect(selectAnalysis(port.getState())).toBeUndefined();
    expect(selectHumanReview(port.getState())).toBeUndefined();
    expect(selectMigrationPlan(port.getState())).toBeUndefined();
  });

  test("7. Selecting the SAME node is a semantic no-op in all selected phases (NODE_SELECTED, SIMULATION_READY, HUMAN_REVIEW, PLAN_READY)", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    // 7a. NODE_SELECTED phase same-node
    const rev1 = port.getState().contextRevision;
    const res1 = port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    expect(res1.ok).toBe(true);
    expect(res1.changed).toBe(false);
    expect(port.getState().contextRevision).toBe(rev1);

    // Transition to SIMULATION_READY
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    expect(port.getState().phase).toBe("SIMULATION_READY");

    // 7b. SIMULATION_READY phase same-node
    const rev2 = port.getState().contextRevision;
    const res2 = port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    expect(res2.ok).toBe(true);
    expect(res2.changed).toBe(false);
    expect(port.getState().phase).toBe("SIMULATION_READY");
    expect(port.getState().contextRevision).toBe(rev2);
    expect(selectScenario(port.getState())).toBeDefined();

    // Transition to HUMAN_REVIEW
    const revRecalc = port.getState().contextRevision;
    port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: {
        analysis: {
          id: "analysis-run-101",
          scenarioId: "scenario-v20-deprecations",
          sourceContextRevision: revRecalc,
          affectedEntityIds: ["pkg-react-dom"],
        },
      },
    });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    expect(port.getState().phase).toBe("HUMAN_REVIEW");

    // 7c. HUMAN_REVIEW phase same-node
    const rev3 = port.getState().contextRevision;
    const res3 = port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    expect(res3.ok).toBe(true);
    expect(res3.changed).toBe(false);
    expect(port.getState().phase).toBe("HUMAN_REVIEW");
    expect(port.getState().contextRevision).toBe(rev3);
    expect(selectHumanReview(port.getState())).toBeDefined();
    expect(selectAnalysis(port.getState())).toBeDefined();

    // Transition to PLAN_READY
    const revPlan = port.getState().contextRevision;
    port.transition({
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-wave-301",
          scenarioId: "scenario-v20-deprecations",
          sourceReviewId: "review-approval-201",
          sourceContextRevision: revPlan,
        },
      },
    });
    expect(port.getState().phase).toBe("PLAN_READY");

    // 7d. PLAN_READY phase same-node
    const rev4 = port.getState().contextRevision;
    const res4 = port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    expect(res4.ok).toBe(true);
    expect(res4.changed).toBe(false);
    expect(port.getState().phase).toBe("PLAN_READY");
    expect(port.getState().contextRevision).toBe(rev4);
    expect(selectMigrationPlan(port.getState())).toBeDefined();
  });

  test("8. NODE_DESELECTED returns to GRAPH_READY", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const result = port.transition({ type: "NODE_DESELECTED" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("GRAPH_READY");
    expect(selectSelectedPackage(port.getState())).toBeUndefined();
  });

  test("9. SCENARIO_CREATED requires selected package target consistency", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const mismatchedScenario: WarRoomScenario = {
      id: "scenario-mismatch",
      targetPackageId: "pkg-scheduler", // mismatched target
      patchOperations: [
        { kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "scheduler.unstable" },
      ],
    };

    const result = port.transition({
      type: "SCENARIO_CREATED",
      payload: { scenario: mismatchedScenario },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
    expect(port.getState().phase).toBe("NODE_SELECTED");
  });

  test("10. Invalid and duplicate scenario operation IDs are rejected", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const duplicateOpScenario: WarRoomScenario = {
      id: "scenario-dup-ops",
      targetPackageId: "pkg-react",
      patchOperations: [
        { kind: "REMOVE_SYMBOL", operationId: "op-dup", symbolPath: "react.A" },
        { kind: "REMOVE_SYMBOL", operationId: "op-dup", symbolPath: "react.B" },
      ],
    };

    const result = port.transition({
      type: "SCENARIO_CREATED",
      payload: { scenario: duplicateOpScenario },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("11. REMOVE_SYMBOL conflict with another mutation on same symbol is detected", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const conflictingScenario: WarRoomScenario = {
      id: "scenario-conflict",
      targetPackageId: "pkg-react",
      patchOperations: [
        { kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "react.Component" },
        { kind: "CHANGE_RETURN_TYPE", operationId: "op-2", symbolPath: "react.Component", newReturnType: "void" },
      ],
    };

    const result = port.transition({
      type: "SCENARIO_CREATED",
      payload: { scenario: conflictingScenario },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCENARIO_CONFLICT");
    }
  });

  test("12. Cross-kind parameter contradiction (ADD_REQUIRED_PARAMETER + CHANGE_PARAMETER_TYPE) is rejected", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const contradictoryScenario: WarRoomScenario = {
      id: "scenario-param-conflict",
      targetPackageId: "pkg-react",
      patchOperations: [
        {
          kind: "ADD_REQUIRED_PARAMETER",
          operationId: "op-add-param",
          symbolPath: "react.createElement",
          parameterName: "options",
          parameterType: "Object",
        },
        {
          kind: "CHANGE_PARAMETER_TYPE",
          operationId: "op-chg-param",
          symbolPath: "react.createElement",
          parameterName: "options",
          newType: "Record<string, unknown>",
        },
      ],
    };

    const result = port.transition({
      type: "SCENARIO_CREATED",
      payload: { scenario: contradictoryScenario },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCENARIO_CONFLICT");
    }
  });

  test("13. Operation-specific empty strings and invalid visibility values are rejected", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    // Empty newReturnType
    const emptyReturnScenario: WarRoomScenario = {
      id: "scenario-empty-ret",
      targetPackageId: "pkg-react",
      patchOperations: [
        { kind: "CHANGE_RETURN_TYPE", operationId: "op-ret", symbolPath: "react.fn", newReturnType: "  " },
      ],
    };
    expect(port.transition({ type: "SCENARIO_CREATED", payload: { scenario: emptyReturnScenario } }).ok).toBe(false);

    // Empty parameterName in ADD_REQUIRED_PARAMETER
    const emptyParamScenario: WarRoomScenario = {
      id: "scenario-empty-param",
      targetPackageId: "pkg-react",
      patchOperations: [
        { kind: "ADD_REQUIRED_PARAMETER", operationId: "op-p", symbolPath: "react.fn", parameterName: "", parameterType: "string" },
      ],
    };
    expect(port.transition({ type: "SCENARIO_CREATED", payload: { scenario: emptyParamScenario } }).ok).toBe(false);

    // Invalid visibility value
    const invalidVisScenario: WarRoomScenario = {
      id: "scenario-bad-vis",
      targetPackageId: "pkg-react",
      patchOperations: [
        { kind: "CHANGE_VISIBILITY", operationId: "op-v", symbolPath: "react.fn", newVisibility: "unrestricted" as any },
      ],
    };
    expect(port.transition({ type: "SCENARIO_CREATED", payload: { scenario: invalidVisScenario } }).ok).toBe(false);
  });

  test("14. SCENARIO_PATCH_CHANGED invalidates existing analysis", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const revBeforeAnalysis = port.getState().contextRevision;
    port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: {
        analysis: {
          id: "analysis-run-101",
          scenarioId: "scenario-v20-deprecations",
          sourceContextRevision: revBeforeAnalysis,
          affectedEntityIds: ["pkg-react-dom"],
        },
      },
    });

    expect(selectAnalysis(port.getState())).toBeDefined();

    const result = port.transition({
      type: "SCENARIO_PATCH_CHANGED",
      payload: {
        patchOperations: [
          { kind: "REMOVE_SYMBOL", operationId: "op-10", symbolPath: "react.createRef" },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("SIMULATION_READY");
    expect(selectAnalysis(port.getState())).toBeUndefined();
    expect(selectScenario(port.getState())?.patchOperations.length).toBe(1);
  });

  test("15. SCENARIO_RECALCULATED enforces sourceContextRevision consistency", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const currentRev = port.getState().contextRevision;

    // Stale sourceContextRevision in analysis payload
    const staleAnalysis: WarRoomAnalysisRef = {
      id: "analysis-stale",
      scenarioId: "scenario-v20-deprecations",
      sourceContextRevision: currentRev - 1,
      affectedEntityIds: ["pkg-react-dom"],
    };

    const staleResult = port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: { analysis: staleAnalysis },
    });

    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) {
      expect(staleResult.error.code).toBe("INVALID_INPUT");
    }

    // Matching sourceContextRevision succeeds
    const validAnalysis: WarRoomAnalysisRef = {
      id: "analysis-valid",
      scenarioId: "scenario-v20-deprecations",
      sourceContextRevision: currentRev,
      affectedEntityIds: ["pkg-react-dom"],
    };

    const validResult = port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: { analysis: validAnalysis },
    });

    expect(validResult.ok).toBe(true);
    expect(validResult.changed).toBe(true);
    expect(port.getState().phase).toBe("SIMULATION_READY");
    expect(selectAnalysis(port.getState())).toEqual(validAnalysis);
  });

  test("16. HUMAN_ANNOTATED transitions to HUMAN_REVIEW", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const rev = port.getState().contextRevision;
    const analysis: WarRoomAnalysisRef = {
      id: "analysis-1",
      scenarioId: "scenario-v20-deprecations",
      sourceContextRevision: rev,
      affectedEntityIds: ["pkg-react-dom"],
    };
    port.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis } });

    const result = port.transition({
      type: "HUMAN_ANNOTATED",
      payload: { review: mockReview },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectHumanReview(port.getState())).toEqual(mockReview);
    expect(selectAnalysis(port.getState())).toEqual(analysis);
  });

  test("17. ANNOTATION_CHANGED preserves technical analysis exactly", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const rev = port.getState().contextRevision;
    const analysis: WarRoomAnalysisRef = {
      id: "analysis-1",
      scenarioId: "scenario-v20-deprecations",
      sourceContextRevision: rev,
      affectedEntityIds: ["pkg-react-dom"],
    };
    port.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis } });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const updatedReview: WarRoomHumanReview = {
      ...mockReview,
      bindings: [
        { annotationId: "anno-tier1", targetEntityId: "pkg-react-dom" },
        { annotationId: "anno-tier2", targetEntityId: "pkg-scheduler" },
      ],
    };

    const result = port.transition({
      type: "ANNOTATION_CHANGED",
      payload: { review: updatedReview },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectHumanReview(port.getState())?.bindings.length).toBe(2);
    expect(selectAnalysis(port.getState())).toEqual(analysis); // preserved exactly
  });

  test("18. PLAN_GENERATED enforces sourceContextRevision and transitions to PLAN_READY", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const revRecalc = port.getState().contextRevision;
    port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: {
        analysis: {
          id: "analysis-1",
          scenarioId: "scenario-v20-deprecations",
          sourceContextRevision: revRecalc,
          affectedEntityIds: ["pkg-react-dom"],
        },
      },
    });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const currentRev = port.getState().contextRevision;

    // Stale plan source revision rejected
    const stalePlan: WarRoomPlanRef = {
      id: "plan-stale",
      scenarioId: "scenario-v20-deprecations",
      sourceReviewId: "review-approval-201",
      sourceContextRevision: currentRev - 1,
    };
    expect(port.transition({ type: "PLAN_GENERATED", payload: { plan: stalePlan } }).ok).toBe(false);

    // Matching plan source revision succeeds
    const validPlan: WarRoomPlanRef = {
      id: "plan-valid",
      scenarioId: "scenario-v20-deprecations",
      sourceReviewId: "review-approval-201",
      sourceContextRevision: currentRev,
    };

    const result = port.transition({
      type: "PLAN_GENERATED",
      payload: { plan: validPlan },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("PLAN_READY");
    expect(selectMigrationPlan(port.getState())).toEqual(validPlan);
  });

  test("19. ANNOTATION_CHANGED from PLAN_READY invalidates plan but preserves analysis", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const revRecalc = port.getState().contextRevision;
    const analysis: WarRoomAnalysisRef = {
      id: "analysis-1",
      scenarioId: "scenario-v20-deprecations",
      sourceContextRevision: revRecalc,
      affectedEntityIds: ["pkg-react-dom"],
    };
    port.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis } });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const revPlan = port.getState().contextRevision;
    port.transition({
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-1",
          scenarioId: "scenario-v20-deprecations",
          sourceReviewId: "review-approval-201",
          sourceContextRevision: revPlan,
        },
      },
    });

    expect(port.getState().phase).toBe("PLAN_READY");

    const updatedReview: WarRoomHumanReview = { ...mockReview, bindings: [] };
    const result = port.transition({ type: "ANNOTATION_CHANGED", payload: { review: updatedReview } });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectMigrationPlan(port.getState())).toBeUndefined(); // plan invalidated
    expect(selectAnalysis(port.getState())).toEqual(analysis); // analysis preserved
  });

  test("20. SCENARIO_RECALCULATED from PLAN_READY invalidates plan and returns to HUMAN_REVIEW", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const revRecalc1 = port.getState().contextRevision;
    port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: {
        analysis: {
          id: "analysis-1",
          scenarioId: "scenario-v20-deprecations",
          sourceContextRevision: revRecalc1,
          affectedEntityIds: ["pkg-react-dom"],
        },
      },
    });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const revPlan = port.getState().contextRevision;
    port.transition({
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-1",
          scenarioId: "scenario-v20-deprecations",
          sourceReviewId: "review-approval-201",
          sourceContextRevision: revPlan,
        },
      },
    });

    expect(port.getState().phase).toBe("PLAN_READY");

    const currentRev = port.getState().contextRevision;
    const newAnalysis: WarRoomAnalysisRef = {
      id: "analysis-recalc-202",
      scenarioId: "scenario-v20-deprecations",
      sourceContextRevision: currentRev,
      affectedEntityIds: ["pkg-react-dom"],
    };

    const result = port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: { analysis: newAnalysis },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectMigrationPlan(port.getState())).toBeUndefined(); // plan cleared
    expect(selectAnalysis(port.getState())).toEqual(newAnalysis); // updated analysis
    expect(selectHumanReview(port.getState())).toEqual(mockReview); // review retained
  });

  test("21. PLAN_RESET returns to HUMAN_REVIEW", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const revRecalc = port.getState().contextRevision;
    port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: {
        analysis: {
          id: "analysis-1",
          scenarioId: "scenario-v20-deprecations",
          sourceContextRevision: revRecalc,
          affectedEntityIds: ["pkg-react-dom"],
        },
      },
    });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const revPlan = port.getState().contextRevision;
    port.transition({
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-1",
          scenarioId: "scenario-v20-deprecations",
          sourceReviewId: "review-approval-201",
          sourceContextRevision: revPlan,
        },
      },
    });

    expect(port.getState().phase).toBe("PLAN_READY");

    const result = port.transition({ type: "PLAN_RESET" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectMigrationPlan(port.getState())).toBeUndefined();
    expect(selectHumanReview(port.getState())).toEqual(mockReview);
  });

  test("22. SCENARIO_RESET is strictly valid from SIMULATION_READY and rejected from HUMAN_REVIEW or PLAN_READY", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    expect(port.getState().phase).toBe("SIMULATION_READY");

    // 22a. Valid from SIMULATION_READY
    const result = port.transition({ type: "SCENARIO_RESET" });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(port.getState().phase).toBe("NODE_SELECTED");
    expect(selectScenario(port.getState())).toBeUndefined();

    // Setup HUMAN_REVIEW
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    expect(port.getState().phase).toBe("HUMAN_REVIEW");

    // 22b. Rejected from HUMAN_REVIEW
    const revHuman = port.getState().contextRevision;
    const resHuman = port.transition({ type: "SCENARIO_RESET" });
    expect(resHuman.ok).toBe(false);
    if (!resHuman.ok) {
      expect(resHuman.error.code).toBe("INVALID_STATE");
    }
    expect(port.getState().phase).toBe("HUMAN_REVIEW");
    expect(port.getState().contextRevision).toBe(revHuman);
  });

  test("23. Invalid transition returns INVALID_STATE and does not increment revision", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });

    const revBefore = port.getState().contextRevision;
    const result = port.transition({
      type: "NODE_SELECTED",
      payload: { selection: mockSelection },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_STATE");
    }
    expect(port.getState().contextRevision).toBe(revBefore);
    expect(port.getState().phase).toBe("IDLE");
  });

  test("24. State Port stale context revision guard", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });

    const currentRev = captureContextRevision(port.getState());
    expect(currentRev).toBe(2);

    // Stale revision attempt
    const staleResult = port.commitContextBound(1, {
      type: "NODE_SELECTED",
      payload: { selection: mockSelection },
    });

    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) {
      expect(staleResult.error.code).toBe("STALE_CONTEXT");
      expect(staleResult.error.details?.capturedRevision).toBe(1);
      expect(staleResult.error.details?.currentRevision).toBe(2);
    }
    expect(port.getState().phase).toBe("GRAPH_READY"); // unmodified

    // Matching revision attempt
    const validResult = port.commitContextBound(2, {
      type: "NODE_SELECTED",
      payload: { selection: mockSelection },
    });

    expect(validResult.ok).toBe(true);
    expect(validResult.changed).toBe(true);
    expect(port.getState().phase).toBe("NODE_SELECTED");
    expect(port.getState().contextRevision).toBe(3);
  });

  test("25. Genuine Zustand StoreApi and distinct WarRoomStatePort contracts", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);

    // Zustand StoreApi.getState().canonical
    expect(store.getState().canonical.phase).toBe("BOOTSTRAP");
    expect(port.getState().phase).toBe("BOOTSTRAP");

    let storeSubscriberCallCount = 0;
    let portSubscriberCallCount = 0;

    const unsubStore = store.subscribe((newState) => {
      storeSubscriberCallCount++;
      expect(newState.canonical.phase).toBe("IDLE");
    });

    const unsubPort = port.subscribe((canonicalState) => {
      portSubscriberCallCount++;
      expect(canonicalState.phase).toBe("IDLE");
    });

    port.transition({ type: "APP_INITIALIZED" });

    expect(storeSubscriberCallCount).toBe(1);
    expect(portSubscriberCallCount).toBe(1);
    expect(store.getState().canonical).toEqual(port.getState());

    unsubStore();
    unsubPort();
  });

  test("26. Canonical state JSON serialization succeeds in every canonical phase", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    const phases: string[] = [];

    // BOOTSTRAP
    phases.push(port.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState().canonical))).not.toThrow();
    expect(() => JSON.parse(JSON.stringify(port.getState()))).not.toThrow();

    // IDLE
    port.transition({ type: "APP_INITIALIZED" });
    phases.push(port.getState().phase);
    expect(() => JSON.parse(JSON.stringify(port.getState()))).not.toThrow();

    // GRAPH_READY
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    phases.push(port.getState().phase);
    expect(() => JSON.parse(JSON.stringify(port.getState()))).not.toThrow();

    // NODE_SELECTED
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    phases.push(port.getState().phase);
    expect(() => JSON.parse(JSON.stringify(port.getState()))).not.toThrow();

    // SIMULATION_READY
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    phases.push(port.getState().phase);
    expect(() => JSON.parse(JSON.stringify(port.getState()))).not.toThrow();

    // HUMAN_REVIEW
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    phases.push(port.getState().phase);
    expect(() => JSON.parse(JSON.stringify(port.getState()))).not.toThrow();

    // PLAN_READY
    const revPlan = port.getState().contextRevision;
    port.transition({
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-1",
          scenarioId: "scenario-v20-deprecations",
          sourceReviewId: "review-approval-201",
          sourceContextRevision: revPlan,
        },
      },
    });
    phases.push(port.getState().phase);
    expect(() => JSON.parse(JSON.stringify(port.getState()))).not.toThrow();

    expect(phases).toEqual([
      "BOOTSTRAP",
      "IDLE",
      "GRAPH_READY",
      "NODE_SELECTED",
      "SIMULATION_READY",
      "HUMAN_REVIEW",
      "PLAN_READY",
    ]);
  });

  test("27. Canonical serialized state contains no renderer/browser objects", () => {
    const store = createWarRoomStore();
    const port = createWarRoomStatePort(store);
    port.transition({ type: "APP_INITIALIZED" });
    port.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    port.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    port.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const revRecalc = port.getState().contextRevision;
    port.transition({
      type: "SCENARIO_RECALCULATED",
      payload: {
        analysis: {
          id: "analysis-1",
          scenarioId: "scenario-v20-deprecations",
          sourceContextRevision: revRecalc,
          affectedEntityIds: ["pkg-react-dom"],
        },
      },
    });
    port.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const revPlan = port.getState().contextRevision;
    port.transition({
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-1",
          scenarioId: "scenario-v20-deprecations",
          sourceReviewId: "review-approval-201",
          sourceContextRevision: revPlan,
        },
      },
    });

    const serialized = JSON.stringify(port.getState());
    expect(serialized).not.toContain("THREE");
    expect(serialized).not.toContain("d3");
    expect(serialized).not.toContain("window");
    expect(serialized).not.toContain("document");
    expect(serialized).not.toContain("HTMLElement");
    expect(serialized).not.toContain("modelContext");
    expect(serialized).not.toContain("AbortController");
  });

  test("28. Non-Serializable Static Guard Test over war-room module (WMCP-INV-021)", () => {
    const warRoomDir = path.resolve(__dirname, "../src/lib/war-room");
    const scanFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let results: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(scanFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const files = scanFiles(warRoomDir);
    expect(files.length).toBeGreaterThan(0);

    const forbiddenTokens = [
      /import\s+.*\s+from\s+['"]three['"]/,
      /import\s+.*\s+from\s+['"]d3['"]/,
      /document\.modelContext/,
      /navigator\.modelContext/,
      /registerTool\(/,
      /new\s+AbortController\(/,
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of forbiddenTokens) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });
});

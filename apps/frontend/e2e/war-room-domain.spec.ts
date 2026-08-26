/**
 * Canonical War Room Domain Kernel & State Machine Tests
 *
 * Deterministic domain verification tests executed using Playwright's TypeScript runner
 * without requiring browser / page fixtures (Section 50 & 51).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  INITIAL_WAR_ROOM_STATE,
  createWarRoomStore,
  reduceWarRoomState,
  captureContextRevision,
  commitContextBoundTransition,
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
  WarRoomState,
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

const mockAnalysis: WarRoomAnalysisRef = {
  id: "analysis-run-101",
  scenarioId: "scenario-v20-deprecations",
  sourceContextRevision: 4,
  affectedEntityIds: ["pkg-react-dom", "pkg-scheduler"],
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

const mockPlan: WarRoomPlanRef = {
  id: "plan-wave-301",
  scenarioId: "scenario-v20-deprecations",
  sourceReviewId: "review-approval-201",
  sourceContextRevision: 6,
};

test.describe("War Room Canonical Domain State Machine (WMCP-2A)", () => {
  test("1. BOOTSTRAP starts at context revision 0", () => {
    const store = createWarRoomStore();
    expect(store.getState().phase).toBe("BOOTSTRAP");
    expect(store.getState().contextRevision).toBe(0);
    expect(selectPhase(store.getState())).toBe("BOOTSTRAP");
    expect(selectContextRevision(store.getState())).toBe(0);
  });

  test("2. APP_INITIALIZED produces IDLE at context revision 1", () => {
    const store = createWarRoomStore();
    const result = store.transition({ type: "APP_INITIALIZED" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("IDLE");
    expect(store.getState().contextRevision).toBe(1);
    expect(selectPhase(store.getState())).toBe("IDLE");
  });

  test("3. GRAPH_OPENED from IDLE produces GRAPH_READY with revision increment", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });

    const result = store.transition({
      type: "GRAPH_OPENED",
      payload: { graph: mockGraphContext },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("GRAPH_READY");
    expect(store.getState().contextRevision).toBe(2);
    expect(selectGraphContext(store.getState())).toEqual(mockGraphContext);
  });

  test("4. GRAPH_OPENED from deep state performs full downstream invalidation", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    expect(store.getState().phase).toBe("HUMAN_REVIEW");

    const newGraph: WarRoomGraphContext = {
      id: "graph-vue-ecosystem",
      rootPackage: { id: "pkg-vue", name: "vue", ecosystem: "NPM", version: "3.5.0" },
      packageIds: ["pkg-vue", "pkg-pinia"],
    };

    const result = store.transition({ type: "GRAPH_OPENED", payload: { graph: newGraph } });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("GRAPH_READY");
    expect(selectGraphContext(store.getState())).toEqual(newGraph);
    expect(selectSelectedPackage(store.getState())).toBeUndefined();
    expect(selectScenario(store.getState())).toBeUndefined();
    expect(selectAnalysis(store.getState())).toBeUndefined();
    expect(selectHumanReview(store.getState())).toBeUndefined();
    expect(selectMigrationPlan(store.getState())).toBeUndefined();
  });

  test("5. NODE_SELECTED validates package membership in current graph context", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });

    const outsideSelection: WarRoomSelection = {
      package: { id: "pkg-angular", name: "angular", ecosystem: "NPM" },
    };

    const result = store.transition({
      type: "NODE_SELECTED",
      payload: { selection: outsideSelection },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(store.getState().phase).toBe("GRAPH_READY");
    expect(store.getState().contextRevision).toBe(2);
  });

  test("6. Selecting different node invalidates scenario, analysis, review, plan", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    expect(store.getState().phase).toBe("HUMAN_REVIEW");

    const newSelection: WarRoomSelection = {
      package: { id: "pkg-scheduler", name: "scheduler", ecosystem: "NPM" },
    };

    const result = store.transition({
      type: "NODE_SELECTED",
      payload: { selection: newSelection },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("NODE_SELECTED");
    expect(selectSelectedPackage(store.getState())?.id).toBe("pkg-scheduler");
    expect(selectScenario(store.getState())).toBeUndefined();
    expect(selectAnalysis(store.getState())).toBeUndefined();
    expect(selectHumanReview(store.getState())).toBeUndefined();
  });

  test("7. Selecting the SAME node is a semantic no-op (changed false, revision unchanged)", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const revBefore = store.getState().contextRevision;
    const result = store.transition({
      type: "NODE_SELECTED",
      payload: { selection: mockSelection },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(store.getState().contextRevision).toBe(revBefore);
  });

  test("8. NODE_DESELECTED returns to GRAPH_READY", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const result = store.transition({ type: "NODE_DESELECTED" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("GRAPH_READY");
    expect(selectSelectedPackage(store.getState())).toBeUndefined();
  });

  test("9. SCENARIO_CREATED requires selected package target consistency", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const mismatchedScenario: WarRoomScenario = {
      id: "scenario-mismatch",
      targetPackageId: "pkg-scheduler", // mismatched target
      patchOperations: [
        { kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "scheduler.unstable" },
      ],
    };

    const result = store.transition({
      type: "SCENARIO_CREATED",
      payload: { scenario: mismatchedScenario },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
    expect(store.getState().phase).toBe("NODE_SELECTED");
  });

  test("10. Invalid and duplicate scenario operation IDs are rejected", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const duplicateOpScenario: WarRoomScenario = {
      id: "scenario-dup-ops",
      targetPackageId: "pkg-react",
      patchOperations: [
        { kind: "REMOVE_SYMBOL", operationId: "op-dup", symbolPath: "react.A" },
        { kind: "REMOVE_SYMBOL", operationId: "op-dup", symbolPath: "react.B" },
      ],
    };

    const result = store.transition({
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
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });

    const conflictingScenario: WarRoomScenario = {
      id: "scenario-conflict",
      targetPackageId: "pkg-react",
      patchOperations: [
        { kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "react.Component" },
        { kind: "CHANGE_RETURN_TYPE", operationId: "op-2", symbolPath: "react.Component", newReturnType: "void" },
      ],
    };

    const result = store.transition({
      type: "SCENARIO_CREATED",
      payload: { scenario: conflictingScenario },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCENARIO_CONFLICT");
    }
  });

  test("12. SCENARIO_PATCH_CHANGED invalidates existing analysis", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });

    expect(selectAnalysis(store.getState())).toBeDefined();

    const result = store.transition({
      type: "SCENARIO_PATCH_CHANGED",
      payload: {
        patchOperations: [
          { kind: "REMOVE_SYMBOL", operationId: "op-10", symbolPath: "react.createRef" },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("SIMULATION_READY");
    expect(selectAnalysis(store.getState())).toBeUndefined();
    expect(selectScenario(store.getState())?.patchOperations.length).toBe(1);
  });

  test("13. SCENARIO_RECALCULATED from SIMULATION_READY preserves scenario and replaces analysis", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });

    const result = store.transition({
      type: "SCENARIO_RECALCULATED",
      payload: { analysis: mockAnalysis },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("SIMULATION_READY");
    expect(selectAnalysis(store.getState())).toEqual(mockAnalysis);
    expect(selectScenario(store.getState())).toEqual(mockScenario);
  });

  test("14. HUMAN_ANNOTATED transitions to HUMAN_REVIEW", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });

    const result = store.transition({
      type: "HUMAN_ANNOTATED",
      payload: { review: mockReview },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectHumanReview(store.getState())).toEqual(mockReview);
    expect(selectAnalysis(store.getState())).toEqual(mockAnalysis);
  });

  test("15. ANNOTATION_CHANGED preserves technical analysis exactly", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const updatedReview: WarRoomHumanReview = {
      ...mockReview,
      bindings: [
        { annotationId: "anno-tier1", targetEntityId: "pkg-react-dom" },
        { annotationId: "anno-tier2", targetEntityId: "pkg-scheduler" },
      ],
    };

    const result = store.transition({
      type: "ANNOTATION_CHANGED",
      payload: { review: updatedReview },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectHumanReview(store.getState())?.bindings.length).toBe(2);
    expect(selectAnalysis(store.getState())).toEqual(mockAnalysis); // preserved exactly
  });

  test("16. PLAN_GENERATED transitions to PLAN_READY", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const result = store.transition({
      type: "PLAN_GENERATED",
      payload: { plan: mockPlan },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("PLAN_READY");
    expect(selectMigrationPlan(store.getState())).toEqual(mockPlan);
  });

  test("17. ANNOTATION_CHANGED from PLAN_READY invalidates plan but preserves analysis", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    store.transition({ type: "PLAN_GENERATED", payload: { plan: mockPlan } });

    expect(store.getState().phase).toBe("PLAN_READY");

    const updatedReview: WarRoomHumanReview = {
      ...mockReview,
      bindings: [],
    };

    const result = store.transition({
      type: "ANNOTATION_CHANGED",
      payload: { review: updatedReview },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectMigrationPlan(store.getState())).toBeUndefined(); // plan invalidated
    expect(selectAnalysis(store.getState())).toEqual(mockAnalysis); // analysis preserved
  });

  test("18. SCENARIO_RECALCULATED from PLAN_READY invalidates plan and returns to HUMAN_REVIEW", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    store.transition({ type: "PLAN_GENERATED", payload: { plan: mockPlan } });

    expect(store.getState().phase).toBe("PLAN_READY");

    const newAnalysis: WarRoomAnalysisRef = {
      ...mockAnalysis,
      id: "analysis-recalc-202",
      affectedEntityIds: ["pkg-react-dom"],
    };

    const result = store.transition({
      type: "SCENARIO_RECALCULATED",
      payload: { analysis: newAnalysis },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectMigrationPlan(store.getState())).toBeUndefined(); // plan cleared
    expect(selectAnalysis(store.getState())).toEqual(newAnalysis); // updated analysis
    expect(selectHumanReview(store.getState())).toEqual(mockReview); // review retained
  });

  test("19. PLAN_RESET returns to HUMAN_REVIEW", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    store.transition({ type: "PLAN_GENERATED", payload: { plan: mockPlan } });

    expect(store.getState().phase).toBe("PLAN_READY");

    const result = store.transition({ type: "PLAN_RESET" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("HUMAN_REVIEW");
    expect(selectMigrationPlan(store.getState())).toBeUndefined();
    expect(selectHumanReview(store.getState())).toEqual(mockReview);
  });

  test("20. SCENARIO_RESET returns to NODE_SELECTED and clears downstream artifacts", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });

    const result = store.transition({ type: "SCENARIO_RESET" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("NODE_SELECTED");
    expect(selectScenario(store.getState())).toBeUndefined();
    expect(selectAnalysis(store.getState())).toBeUndefined();
    expect(selectHumanReview(store.getState())).toBeUndefined();
    expect(selectSelectedPackage(store.getState())).toEqual(mockSelection.package);
  });

  test("21. Invalid transition returns INVALID_STATE and does not increment revision", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });

    const revBefore = store.getState().contextRevision;
    // Attempting NODE_SELECTED from IDLE without an open graph is invalid
    const result = store.transition({
      type: "NODE_SELECTED",
      payload: { selection: mockSelection },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_STATE");
    }
    expect(store.getState().contextRevision).toBe(revBefore);
    expect(store.getState().phase).toBe("IDLE");
  });

  test("22. Captured matching context revision allows mutation", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });

    const capturedRev = captureContextRevision(store.getState());
    expect(capturedRev).toBe(2);

    const result = store.commitContextBound(capturedRev, {
      type: "NODE_SELECTED",
      payload: { selection: mockSelection },
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(store.getState().phase).toBe("NODE_SELECTED");
    expect(store.getState().contextRevision).toBe(3);
  });

  test("23. Captured stale revision returns STALE_CONTEXT and leaves canonical state unmodified", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });

    const staleRev = 1; // current revision is 2
    const stateBeforeJson = JSON.stringify(store.getState());

    const result = store.commitContextBound(staleRev, {
      type: "NODE_SELECTED",
      payload: { selection: mockSelection },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STALE_CONTEXT");
      expect(result.error.details?.capturedRevision).toBe(1);
      expect(result.error.details?.currentRevision).toBe(2);
    }

    const stateAfterJson = JSON.stringify(store.getState());
    expect(stateAfterJson).toBe(stateBeforeJson); // completely unmodified
  });

  test("24. Canonical state JSON serialization succeeds in every canonical phase", () => {
    const store = createWarRoomStore();
    const phases: string[] = [];

    // BOOTSTRAP
    phases.push(store.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();

    // IDLE
    store.transition({ type: "APP_INITIALIZED" });
    phases.push(store.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();

    // GRAPH_READY
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    phases.push(store.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();

    // NODE_SELECTED
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    phases.push(store.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();

    // SIMULATION_READY
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    phases.push(store.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();

    // HUMAN_REVIEW
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    phases.push(store.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();

    // PLAN_READY
    store.transition({ type: "PLAN_GENERATED", payload: { plan: mockPlan } });
    phases.push(store.getState().phase);
    expect(() => JSON.parse(JSON.stringify(store.getState()))).not.toThrow();

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

  test("25. Canonical serialized state contains no renderer/browser objects", () => {
    const store = createWarRoomStore();
    store.transition({ type: "APP_INITIALIZED" });
    store.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } });
    store.transition({ type: "NODE_SELECTED", payload: { selection: mockSelection } });
    store.transition({ type: "SCENARIO_CREATED", payload: { scenario: mockScenario } });
    store.transition({ type: "SCENARIO_RECALCULATED", payload: { analysis: mockAnalysis } });
    store.transition({ type: "HUMAN_ANNOTATED", payload: { review: mockReview } });
    store.transition({ type: "PLAN_GENERATED", payload: { plan: mockPlan } });

    const serialized = JSON.stringify(store.getState());
    expect(serialized).not.toContain("THREE");
    expect(serialized).not.toContain("d3");
    expect(serialized).not.toContain("window");
    expect(serialized).not.toContain("document");
    expect(serialized).not.toContain("HTMLElement");
    expect(serialized).not.toContain("modelContext");
    expect(serialized).not.toContain("AbortController");
  });

  test("26. Non-Serializable Static Guard Test over war-room module (WMCP-INV-021)", () => {
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

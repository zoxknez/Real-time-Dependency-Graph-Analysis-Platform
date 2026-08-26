/**
 * Canonical War Room State Transition Reducer
 *
 * Deterministic pure state machine implementation following WEBMCP-STATE-MACHINE.md,
 * WMCP-INV-002, WMCP-INV-021.
 */

import {
  WarRoomState,
  WarRoomEvent,
  TransitionResult,
  BootstrapState,
  IdleState,
  GraphReadyState,
  NodeSelectedState,
  SimulationReadyState,
  HumanReviewState,
  PlanReadyState,
} from "../domain/types";
import {
  invalidInputError,
  invalidStateError,
  notFoundError,
  staleContextError,
} from "../domain/errors";
import { validateScenario } from "../domain/scenario";

export const INITIAL_WAR_ROOM_STATE: BootstrapState = {
  phase: "BOOTSTRAP",
  contextRevision: 0,
};

export function captureContextRevision(state: WarRoomState): number {
  return state.contextRevision;
}

export function commitContextBoundTransition(
  currentState: WarRoomState,
  capturedContextRevision: number,
  event: WarRoomEvent
): TransitionResult {
  // Stale context must be checked BEFORE committing any mutation (WMCP-INV-002)
  if (capturedContextRevision !== currentState.contextRevision) {
    return {
      ok: false,
      changed: false,
      state: currentState,
      error: staleContextError(capturedContextRevision, currentState.contextRevision),
    };
  }

  return reduceWarRoomState(currentState, event);
}

export function reduceWarRoomState(
  state: WarRoomState,
  event: WarRoomEvent
): TransitionResult {
  switch (event.type) {
    case "APP_INITIALIZED": {
      if (state.phase !== "BOOTSTRAP") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `APP_INITIALIZED is only valid from BOOTSTRAP, current phase is ${state.phase}`
          ),
        };
      }

      const nextState: IdleState = {
        phase: "IDLE",
        contextRevision: 1,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "GRAPH_OPENED": {
      if (state.phase === "BOOTSTRAP") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            "GRAPH_OPENED is not valid before APP_INITIALIZED"
          ),
        };
      }

      const { graph } = event.payload;
      if (!graph || !graph.id || !graph.packageIds) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError("Invalid graph context payload"),
        };
      }

      // GRAPH_OPENED performs full downstream invalidation
      const nextState: GraphReadyState = {
        phase: "GRAPH_READY",
        contextRevision: state.contextRevision + 1,
        graph,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "GRAPH_CLOSED": {
      if (state.phase !== "GRAPH_READY") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `GRAPH_CLOSED is only valid from GRAPH_READY, current phase is ${state.phase}`
          ),
        };
      }

      const nextState: IdleState = {
        phase: "IDLE",
        contextRevision: state.contextRevision + 1,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "NODE_SELECTED": {
      if (state.phase === "BOOTSTRAP" || state.phase === "IDLE") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `NODE_SELECTED is not valid in phase ${state.phase}`
          ),
        };
      }

      const { selection } = event.payload;
      if (!selection || !selection.package || !selection.package.id) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError("Invalid node selection payload"),
        };
      }

      // Validate node membership in current graph context
      if (!state.graph.packageIds.includes(selection.package.id)) {
        return {
          ok: false,
          changed: false,
          state,
          error: notFoundError(
            `Selected package ID ${selection.package.id} is not present in graph ${state.graph.id}`
          ),
        };
      }

      // Same-node selection is a semantic NO-OP: changed false, revision unchanged
      if (
        state.phase === "NODE_SELECTED" &&
        state.selection.package.id === selection.package.id
      ) {
        return { ok: true, changed: false, state };
      }

      // Node change invalidates scenario, analysis, review, plan
      const nextState: NodeSelectedState = {
        phase: "NODE_SELECTED",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "NODE_DESELECTED": {
      if (state.phase !== "NODE_SELECTED") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `NODE_DESELECTED is only valid from NODE_SELECTED, current phase is ${state.phase}`
          ),
        };
      }

      const nextState: GraphReadyState = {
        phase: "GRAPH_READY",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "SCENARIO_CREATED": {
      if (state.phase !== "NODE_SELECTED") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `SCENARIO_CREATED is only valid from NODE_SELECTED, current phase is ${state.phase}`
          ),
        };
      }

      const { scenario } = event.payload;
      const validation = validateScenario(scenario);
      if (!validation.ok) {
        return {
          ok: false,
          changed: false,
          state,
          error: validation.error,
        };
      }

      if (scenario.targetPackageId !== state.selection.package.id) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError(
            `Scenario target package ID ${scenario.targetPackageId} does not match selected node ${state.selection.package.id}`
          ),
        };
      }

      const nextState: SimulationReadyState = {
        phase: "SIMULATION_READY",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
        scenario,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "SCENARIO_PATCH_CHANGED": {
      if (state.phase !== "SIMULATION_READY") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `SCENARIO_PATCH_CHANGED is only valid from SIMULATION_READY, current phase is ${state.phase}`
          ),
        };
      }

      const updatedScenario = {
        ...state.scenario,
        patchOperations: event.payload.patchOperations,
      };

      const validation = validateScenario(updatedScenario);
      if (!validation.ok) {
        return {
          ok: false,
          changed: false,
          state,
          error: validation.error,
        };
      }

      // SCENARIO_PATCH_CHANGED retains graph & selection, replaces scenario, invalidates analysis
      const nextState: SimulationReadyState = {
        phase: "SIMULATION_READY",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
        scenario: updatedScenario,
        analysis: undefined,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "SCENARIO_RECALCULATED": {
      if (
        state.phase !== "SIMULATION_READY" &&
        state.phase !== "HUMAN_REVIEW" &&
        state.phase !== "PLAN_READY"
      ) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `SCENARIO_RECALCULATED is not valid in phase ${state.phase}`
          ),
        };
      }

      const { analysis } = event.payload;
      if (!analysis || analysis.scenarioId !== state.scenario.id) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError(
            `Analysis scenarioId ${analysis?.scenarioId} does not match active scenario ${state.scenario.id}`
          ),
        };
      }

      if (state.phase === "SIMULATION_READY") {
        const nextState: SimulationReadyState = {
          ...state,
          contextRevision: state.contextRevision + 1,
          analysis,
        };
        return { ok: true, changed: true, state: nextState };
      }

      if (state.phase === "HUMAN_REVIEW") {
        const nextState: HumanReviewState = {
          ...state,
          contextRevision: state.contextRevision + 1,
          analysis,
        };
        return { ok: true, changed: true, state: nextState };
      }

      // From PLAN_READY: recalculation invalidates plan and transitions to HUMAN_REVIEW
      const nextState: HumanReviewState = {
        phase: "HUMAN_REVIEW",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
        scenario: state.scenario,
        review: state.review,
        analysis,
        visualEvidence: state.visualEvidence,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "SCENARIO_RESET": {
      if (
        state.phase !== "SIMULATION_READY" &&
        state.phase !== "HUMAN_REVIEW" &&
        state.phase !== "PLAN_READY"
      ) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `SCENARIO_RESET is only valid from SIMULATION_READY, HUMAN_REVIEW, or PLAN_READY, current phase is ${state.phase}`
          ),
        };
      }

      const nextState: NodeSelectedState = {
        phase: "NODE_SELECTED",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "HUMAN_ANNOTATED": {
      if (state.phase !== "SIMULATION_READY") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `HUMAN_ANNOTATED is only valid from SIMULATION_READY, current phase is ${state.phase}`
          ),
        };
      }

      const { review } = event.payload;
      if (!review || review.scenarioId !== state.scenario.id) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError(
            `Review scenarioId ${review?.scenarioId} does not match active scenario ${state.scenario.id}`
          ),
        };
      }

      const nextState: HumanReviewState = {
        phase: "HUMAN_REVIEW",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
        scenario: state.scenario,
        review,
        analysis: state.analysis,
        visualEvidence: state.visualEvidence,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "ANNOTATION_CHANGED": {
      if (state.phase !== "HUMAN_REVIEW" && state.phase !== "PLAN_READY") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `ANNOTATION_CHANGED is only valid from HUMAN_REVIEW or PLAN_READY, current phase is ${state.phase}`
          ),
        };
      }

      const { review } = event.payload;
      if (!review || review.scenarioId !== state.scenario.id) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError(
            `Review scenarioId ${review?.scenarioId} does not match active scenario ${state.scenario.id}`
          ),
        };
      }

      // ANNOTATION_CHANGED preserves technical analysis exactly; from PLAN_READY it invalidates plan
      const nextState: HumanReviewState = {
        phase: "HUMAN_REVIEW",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
        scenario: state.scenario,
        review,
        analysis: state.analysis,
        visualEvidence: state.visualEvidence,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "PLAN_GENERATED": {
      if (state.phase !== "HUMAN_REVIEW") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `PLAN_GENERATED is only valid from HUMAN_REVIEW, current phase is ${state.phase}`
          ),
        };
      }

      const { plan } = event.payload;
      if (!plan) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError("Plan payload must be provided"),
        };
      }

      if (plan.scenarioId !== state.scenario.id) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError(
            `Plan scenarioId ${plan.scenarioId} does not match active scenario ${state.scenario.id}`
          ),
        };
      }

      if (plan.sourceReviewId !== state.review.id) {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidInputError(
            `Plan sourceReviewId ${plan.sourceReviewId} does not match active review ${state.review.id}`
          ),
        };
      }

      const nextState: PlanReadyState = {
        phase: "PLAN_READY",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
        scenario: state.scenario,
        review: state.review,
        plan,
        analysis: state.analysis,
        visualEvidence: state.visualEvidence,
      };

      return { ok: true, changed: true, state: nextState };
    }

    case "PLAN_RESET": {
      if (state.phase !== "PLAN_READY") {
        return {
          ok: false,
          changed: false,
          state,
          error: invalidStateError(
            `PLAN_RESET is only valid from PLAN_READY, current phase is ${state.phase}`
          ),
        };
      }

      const nextState: HumanReviewState = {
        phase: "HUMAN_REVIEW",
        contextRevision: state.contextRevision + 1,
        graph: state.graph,
        selection: state.selection,
        scenario: state.scenario,
        review: state.review,
        analysis: state.analysis,
        visualEvidence: state.visualEvidence,
      };

      return { ok: true, changed: true, state: nextState };
    }

    default: {
      const _exhaustiveCheck: never = event;
      return {
        ok: false,
        changed: false,
        state,
        error: invalidInputError(`Unhandled event type: ${JSON.stringify(_exhaustiveCheck)}`),
      };
    }
  }
}

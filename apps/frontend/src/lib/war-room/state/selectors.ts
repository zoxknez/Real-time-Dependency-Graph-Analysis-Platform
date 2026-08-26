/**
 * Pure Canonical War Room Selectors
 *
 * Read-only state extraction functions. Selectors must not mutate state (Section 43).
 */

import {
  WarRoomState,
  WarRoomPhase,
  WarRoomGraphContext,
  WarRoomPackageRef,
  WarRoomScenario,
  WarRoomAnalysisRef,
  WarRoomHumanReview,
  WarRoomPlanRef,
  WarRoomGraphEvidence,
} from "../domain/types";

export function selectPhase(state: WarRoomState): WarRoomPhase {
  return state.phase;
}

export function selectContextRevision(state: WarRoomState): number {
  return state.contextRevision;
}

export function selectGraphContext(
  state: WarRoomState
): WarRoomGraphContext | undefined {
  if ("graph" in state) {
    return state.graph;
  }
  return undefined;
}

export function selectSelectedPackage(
  state: WarRoomState
): WarRoomPackageRef | undefined {
  if ("selection" in state) {
    return state.selection.package;
  }
  return undefined;
}

export function selectScenario(
  state: WarRoomState
): WarRoomScenario | undefined {
  if ("scenario" in state) {
    return state.scenario;
  }
  return undefined;
}

export function selectAnalysis(
  state: WarRoomState
): WarRoomAnalysisRef | undefined {
  if ("analysis" in state) {
    return state.analysis;
  }
  return undefined;
}

export function selectHumanReview(
  state: WarRoomState
): WarRoomHumanReview | undefined {
  if ("review" in state) {
    return state.review;
  }
  return undefined;
}

export function selectMigrationPlan(
  state: WarRoomState
): WarRoomPlanRef | undefined {
  if ("plan" in state) {
    return state.plan;
  }
  return undefined;
}

export function selectVisualEvidence(
  state: WarRoomState
): WarRoomGraphEvidence | undefined {
  if ("visualEvidence" in state) {
    return state.visualEvidence;
  }
  return undefined;
}

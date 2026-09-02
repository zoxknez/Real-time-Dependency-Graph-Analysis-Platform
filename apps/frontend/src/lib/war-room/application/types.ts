/**
 * War Room Application Layer Types
 *
 * Transport-independent application contracts, action request DTOs, invocation context,
 * and service/action result models.
 * Follows WMCP-INV-002, WMCP-INV-003, WMCP-INV-004, WMCP-INV-017, WMCP-INV-021.
 */

import {
  PackageEcosystem,
  WarRoomPackageRef,
  WarRoomSelection,
  WarRoomScenario,
  ScenarioPatchOperation,
  WarRoomHumanReview,
} from "../domain/types";
import { WarRoomDomainError } from "../domain/errors";

export interface WarRoomSecurityContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly organizationId?: string;
}

export type WarRoomInvocationChannel = "HUMAN" | "AGENT";

export interface WarRoomInvocationContext {
  readonly channel: WarRoomInvocationChannel;
  readonly capturedContextRevision: number;
  readonly signal?: AbortSignal;
}

export type WarRoomActionName =
  | "SEARCH_PACKAGES"
  | "INSPECT_PACKAGE"
  | "TRACE_DEPENDENCY_PATH"
  | "OPEN_PACKAGE_GRAPH"
  | "CLOSE_GRAPH"
  | "SELECT_PACKAGE"
  | "DESELECT_PACKAGE"
  | "CREATE_SCENARIO"
  | "CHANGE_SCENARIO_PATCH"
  | "RESET_SCENARIO"
  | "RECALCULATE_SCENARIO"
  | "ATTACH_HUMAN_REVIEW"
  | "CHANGE_HUMAN_REVIEW"
  | "GENERATE_MIGRATION_PLAN"
  | "RESET_MIGRATION_PLAN"
  | "CALCULATE_BLAST_RADIUS"
  | "FOCUS_GRAPH_NODES"
  | "SET_SCENARIO_PRIORITY"
  | "SET_SCENARIO_EXCLUSION"
  | "INSPECT_CRITICAL_PATHS"
  | "APP_INITIALIZE";

export type WarRoomServiceResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
    }
  | {
      readonly ok: false;
      readonly error: WarRoomDomainError;
    };

export type WarRoomActionResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly changed: boolean;
      readonly contextRevision: number;
    }
  | {
      readonly ok: false;
      readonly error: WarRoomDomainError;
      readonly changed: false;
      readonly contextRevision: number;
    };

export interface WarRoomPackageSearchResult {
  readonly packages: readonly WarRoomPackageRef[];
  readonly totalCount?: number;
}

export interface WarRoomPackageInspection {
  readonly package: WarRoomPackageRef;
  readonly directDependencyIds: readonly string[];
  readonly directDependentIds: readonly string[];
  readonly evidence?: import("../domain/evidence").PackageEvidence;
}

export interface WarRoomDependencyPath {
  readonly fromPackageId: string;
  readonly toPackageId: string;
  readonly packageIds: readonly string[];
  readonly hopCount: number;
}

export interface SearchPackagesRequest {
  readonly query: string;
  readonly ecosystem?: PackageEcosystem;
  readonly limit?: number;
}

export interface InspectPackageRequest {
  readonly packageId: string;
}

export interface TraceDependencyPathRequest {
  readonly fromPackageId: string;
  readonly toPackageId: string;
  readonly maxHops?: number;
}

export interface OpenPackageGraphRequest {
  readonly rootPackageId: string;
  readonly depth?: number;
}

export interface SelectPackageRequest {
  readonly selection: WarRoomSelection;
}

export interface CreateScenarioRequest {
  readonly scenario: WarRoomScenario;
}

export interface ChangeScenarioPatchRequest {
  readonly patchOperations: readonly ScenarioPatchOperation[];
}

export interface AttachHumanReviewRequest {
  readonly review: WarRoomHumanReview;
}

export interface ChangeHumanReviewRequest {
  readonly review: WarRoomHumanReview;
}

export interface CalculateBlastRadiusRequest {
  readonly targetPackageId?: string;
  readonly proposedVersion?: string;
}

export interface FocusGraphNodesRequest {
  readonly nodeIds: readonly string[];
}

export interface FocusGraphNodesResult {
  readonly focusedCount: number;
  readonly focusedNodeIds: readonly string[];
}

export interface FocusCriticalPathRequest { readonly pathId: string; }
export interface FocusCriticalPathResult { readonly pathId: string; readonly focusedNodeIds: readonly string[]; }

export interface SetScenarioPriorityRequest {
  readonly entityId: string;
  readonly priority: "P0" | "P1" | "P2" | "P3";
  readonly note?: string;
}

export interface SetScenarioPriorityResult {
  readonly entityId: string;
  readonly priority: "P0" | "P1" | "P2" | "P3";
  readonly note?: string;
  readonly reviewId: string;
}

export interface SetScenarioExclusionRequest {
  readonly entityId: string;
  readonly excluded: boolean;
  readonly reason: string;
}

export interface SetScenarioExclusionResult {
  readonly entityId: string;
  readonly excluded: boolean;
  readonly reason: string;
  readonly reviewId: string;
}

export interface InspectCriticalPathsRequest {
  readonly maxPaths?: number;
}

export interface InspectCriticalPathsResult {
  readonly targetEntityId: string;
  readonly totalPaths: number;
  readonly returnedPaths: number;
  readonly excludedCandidatesCount: number;
  readonly truncated: boolean;
  readonly paths: readonly import("../domain/types").CriticalPathItem[];
}

export interface FocusCriticalPathRequest {
  readonly pathId: string;
}

export interface FocusCriticalPathResult {
  readonly pathId: string;
  readonly focusedNodeIds: readonly string[];
}

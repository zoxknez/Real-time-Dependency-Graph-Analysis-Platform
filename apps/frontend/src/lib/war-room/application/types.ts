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

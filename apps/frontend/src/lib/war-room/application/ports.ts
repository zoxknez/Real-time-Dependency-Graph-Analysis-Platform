/**
 * War Room Application Service Ports
 *
 * Dependency inversion boundaries for security, authorization, catalog, graph,
 * scenario analysis, and migration planning services.
 * Follows WMCP-INV-003, WMCP-INV-004, WMCP-INV-017.
 */

import {
  WarRoomGraphContext,
  WarRoomSelection,
  WarRoomScenario,
  WarRoomAnalysisRef,
  WarRoomHumanReview,
  WarRoomPlanRef,
} from "../domain/types";
import {
  WarRoomSecurityContext,
  WarRoomActionName,
  WarRoomServiceResult,
  WarRoomPackageSearchResult,
  WarRoomPackageInspection,
  WarRoomDependencyPath,
  SearchPackagesRequest,
  InspectPackageRequest,
  TraceDependencyPathRequest,
  OpenPackageGraphRequest,
} from "./types";

export interface WarRoomSecurityContextPort {
  getSecurityContext(
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<WarRoomSecurityContext>>;
}

export interface WarRoomAuthorizationRequest {
  readonly securityContext: WarRoomSecurityContext;
  readonly action: WarRoomActionName;
  readonly resource?: Record<string, unknown>;
}

export interface WarRoomAuthorizationPort {
  authorize(
    request: WarRoomAuthorizationRequest,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<void>>;
}

export interface WarRoomPackageCatalogPort {
  searchPackages(
    securityContext: WarRoomSecurityContext,
    request: SearchPackagesRequest,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<WarRoomPackageSearchResult>>;

  inspectPackage(
    securityContext: WarRoomSecurityContext,
    request: InspectPackageRequest,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<WarRoomPackageInspection>>;
}

export interface GetDirectDependentsRequest {
  readonly packageId: string;
}

export interface WarRoomGraphQueryPort {
  loadPackageGraph(
    securityContext: WarRoomSecurityContext,
    request: OpenPackageGraphRequest,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<WarRoomGraphContext>>;

  traceDependencyPath(
    securityContext: WarRoomSecurityContext,
    request: TraceDependencyPathRequest,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<WarRoomDependencyPath>>;

  getDirectDependents?(
    securityContext: WarRoomSecurityContext,
    request: GetDirectDependentsRequest,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<readonly import("../domain/types").DirectDependentRecord[]>>;
}

export interface RecalculateScenarioInput {
  readonly graph: WarRoomGraphContext;
  readonly selection: WarRoomSelection;
  readonly scenario: WarRoomScenario;
  readonly sourceContextRevision: number;
}

export interface WarRoomScenarioAnalysisPort {
  recalculateScenario(
    securityContext: WarRoomSecurityContext,
    input: RecalculateScenarioInput,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<WarRoomAnalysisRef>>;
}

export interface GenerateMigrationPlanInput {
  readonly graph: WarRoomGraphContext;
  readonly selection: WarRoomSelection;
  readonly scenario: WarRoomScenario;
  readonly analysis?: WarRoomAnalysisRef;
  readonly review: WarRoomHumanReview;
  readonly versionExposure?: import("../domain/version-exposure-engine").VersionAwareExposureResult;
  readonly criticalPaths?: import("../application/types").InspectCriticalPathsResult;
  readonly evidence?: import("../domain/evidence").PackageEvidence;
  readonly sourceContextRevision: number;
}

export interface WarRoomMigrationPlanningPort {
  generateMigrationPlan(
    securityContext: WarRoomSecurityContext,
    input: GenerateMigrationPlanInput,
    signal?: AbortSignal
  ): Promise<WarRoomServiceResult<WarRoomPlanRef>>;
}

export interface WarRoomEvidencePort {
  getPackageEvidence(
    coordinate: import("../domain/evidence").PackageEvidenceCoordinate,
    signal?: AbortSignal
  ): Promise<import("../domain/evidence").PackageEvidence>;
}

/**
 * Canonical War Room Domain Types
 *
 * Framework-independent, serializable domain contracts for the War Room.
 * Follows WMCP-0B, WMCP-INV-002, WMCP-INV-021.
 */

export type PackageEcosystem =
  | "NPM"
  | "PY_PI"
  | "CARGO"
  | "MAVEN"
  | "NU_GET"
  | "GO";

export interface WarRoomPackageRef {
  readonly id: string;
  readonly name: string;
  readonly ecosystem: PackageEcosystem;
  readonly version?: string;
}

export interface WarRoomGraphContext {
  readonly id: string;
  readonly rootPackage: WarRoomPackageRef;
  readonly packageIds: readonly string[];
}

export interface WarRoomSelection {
  readonly package: WarRoomPackageRef;
}

export type ScenarioPatchOperationKind =
  | "REMOVE_SYMBOL"
  | "RENAME_SYMBOL"
  | "CHANGE_RETURN_TYPE"
  | "CHANGE_PARAMETER_TYPE"
  | "ADD_REQUIRED_PARAMETER"
  | "CHANGE_VISIBILITY";

export interface RemoveSymbolOperation {
  readonly kind: "REMOVE_SYMBOL";
  readonly operationId: string;
  readonly symbolPath: string;
}

export interface RenameSymbolOperation {
  readonly kind: "RENAME_SYMBOL";
  readonly operationId: string;
  readonly symbolPath: string;
  readonly newSymbolPath: string;
}

export interface ChangeReturnTypeOperation {
  readonly kind: "CHANGE_RETURN_TYPE";
  readonly operationId: string;
  readonly symbolPath: string;
  readonly newReturnType: string;
}

export interface ChangeParameterTypeOperation {
  readonly kind: "CHANGE_PARAMETER_TYPE";
  readonly operationId: string;
  readonly symbolPath: string;
  readonly parameterName: string;
  readonly newType: string;
}

export interface AddRequiredParameterOperation {
  readonly kind: "ADD_REQUIRED_PARAMETER";
  readonly operationId: string;
  readonly symbolPath: string;
  readonly parameterName: string;
  readonly parameterType: string;
}

export type ScenarioVisibility =
  | "public"
  | "private"
  | "protected"
  | "internal"
  | "crate"
  | "super";

export interface ChangeVisibilityOperation {
  readonly kind: "CHANGE_VISIBILITY";
  readonly operationId: string;
  readonly symbolPath: string;
  readonly newVisibility: ScenarioVisibility;
}

export type ScenarioPatchOperation =
  | RemoveSymbolOperation
  | RenameSymbolOperation
  | ChangeReturnTypeOperation
  | ChangeParameterTypeOperation
  | AddRequiredParameterOperation
  | ChangeVisibilityOperation;

export interface WarRoomScenario {
  readonly id: string;
  readonly targetPackageId: string;
  readonly patchOperations: readonly ScenarioPatchOperation[];
  readonly baseVersion?: string;
  readonly proposedVersion?: string;
}

export interface WarRoomBreakingChangeDto {
  readonly changeType: string;
  readonly symbolPath: string;
  readonly description: string;
  readonly severity?: string;
  readonly oldSignature?: string;
  readonly newSignature?: string;
  readonly migrationHint?: string;
}

export interface WarRoomAnalysisRef {
  readonly id: string;
  readonly scenarioId: string;
  readonly sourceContextRevision: number;
  readonly affectedEntityIds: readonly string[];
  readonly baselineSurfaceHash?: string;
  readonly candidateSurfaceHash?: string;
  readonly changed?: boolean;
  readonly totalBreakingChanges?: number;
  readonly returnedBreakingChanges?: number;
  readonly breakingChangesTruncated?: boolean;
  readonly breakingChanges?: readonly WarRoomBreakingChangeDto[];
}

export interface HumanReviewBinding {
  readonly annotationId: string;
  readonly targetEntityId: string;
}

export interface WarRoomHumanReview {
  readonly id: string;
  readonly scenarioId: string;
  readonly bindings: readonly HumanReviewBinding[];
}

export interface WarRoomPlanRef {
  readonly id: string;
  readonly scenarioId: string;
  readonly sourceReviewId: string;
  readonly sourceContextRevision: number;
}

export interface WarRoomGraphEvidence {
  readonly focusedPackageIds: readonly string[];
  readonly highlightedPackageIds: readonly string[];
  readonly highlightedPathIds: readonly string[];
}

export type WarRoomPhase =
  | "BOOTSTRAP"
  | "IDLE"
  | "GRAPH_READY"
  | "NODE_SELECTED"
  | "SIMULATION_READY"
  | "HUMAN_REVIEW"
  | "PLAN_READY";

export interface BootstrapState {
  readonly phase: "BOOTSTRAP";
  readonly contextRevision: 0;
}

export interface IdleState {
  readonly phase: "IDLE";
  readonly contextRevision: number;
}

export interface GraphReadyState {
  readonly phase: "GRAPH_READY";
  readonly contextRevision: number;
  readonly graph: WarRoomGraphContext;
  readonly visualEvidence?: WarRoomGraphEvidence;
}

export interface NodeSelectedState {
  readonly phase: "NODE_SELECTED";
  readonly contextRevision: number;
  readonly graph: WarRoomGraphContext;
  readonly selection: WarRoomSelection;
  readonly visualEvidence?: WarRoomGraphEvidence;
}

export interface SimulationReadyState {
  readonly phase: "SIMULATION_READY";
  readonly contextRevision: number;
  readonly graph: WarRoomGraphContext;
  readonly selection: WarRoomSelection;
  readonly scenario: WarRoomScenario;
  readonly analysis?: WarRoomAnalysisRef;
  readonly visualEvidence?: WarRoomGraphEvidence;
}

export interface HumanReviewState {
  readonly phase: "HUMAN_REVIEW";
  readonly contextRevision: number;
  readonly graph: WarRoomGraphContext;
  readonly selection: WarRoomSelection;
  readonly scenario: WarRoomScenario;
  readonly review: WarRoomHumanReview;
  readonly analysis?: WarRoomAnalysisRef;
  readonly visualEvidence?: WarRoomGraphEvidence;
}

export interface PlanReadyState {
  readonly phase: "PLAN_READY";
  readonly contextRevision: number;
  readonly graph: WarRoomGraphContext;
  readonly selection: WarRoomSelection;
  readonly scenario: WarRoomScenario;
  readonly review: WarRoomHumanReview;
  readonly plan: WarRoomPlanRef;
  readonly analysis?: WarRoomAnalysisRef;
  readonly visualEvidence?: WarRoomGraphEvidence;
}

export type WarRoomState =
  | BootstrapState
  | IdleState
  | GraphReadyState
  | NodeSelectedState
  | SimulationReadyState
  | HumanReviewState
  | PlanReadyState;

export interface AppInitializedEvent {
  readonly type: "APP_INITIALIZED";
}

export interface GraphOpenedEvent {
  readonly type: "GRAPH_OPENED";
  readonly payload: {
    readonly graph: WarRoomGraphContext;
  };
}

export interface GraphClosedEvent {
  readonly type: "GRAPH_CLOSED";
}

export interface NodeSelectedEvent {
  readonly type: "NODE_SELECTED";
  readonly payload: {
    readonly selection: WarRoomSelection;
  };
}

export interface NodeDeselectedEvent {
  readonly type: "NODE_DESELECTED";
}

export interface ScenarioCreatedEvent {
  readonly type: "SCENARIO_CREATED";
  readonly payload: {
    readonly scenario: WarRoomScenario;
  };
}

export interface ScenarioPatchChangedEvent {
  readonly type: "SCENARIO_PATCH_CHANGED";
  readonly payload: {
    readonly patchOperations: readonly ScenarioPatchOperation[];
  };
}

export interface ScenarioRecalculatedEvent {
  readonly type: "SCENARIO_RECALCULATED";
  readonly payload: {
    readonly analysis: WarRoomAnalysisRef;
  };
}

export interface ScenarioResetEvent {
  readonly type: "SCENARIO_RESET";
}

export interface HumanAnnotatedEvent {
  readonly type: "HUMAN_ANNOTATED";
  readonly payload: {
    readonly review: WarRoomHumanReview;
  };
}

export interface AnnotationChangedEvent {
  readonly type: "ANNOTATION_CHANGED";
  readonly payload: {
    readonly review: WarRoomHumanReview;
  };
}

export interface PlanGeneratedEvent {
  readonly type: "PLAN_GENERATED";
  readonly payload: {
    readonly plan: WarRoomPlanRef;
  };
}

export interface PlanResetEvent {
  readonly type: "PLAN_RESET";
}

export type WarRoomEvent =
  | AppInitializedEvent
  | GraphOpenedEvent
  | GraphClosedEvent
  | NodeSelectedEvent
  | NodeDeselectedEvent
  | ScenarioCreatedEvent
  | ScenarioPatchChangedEvent
  | ScenarioRecalculatedEvent
  | ScenarioResetEvent
  | HumanAnnotatedEvent
  | AnnotationChangedEvent
  | PlanGeneratedEvent
  | PlanResetEvent;

export interface TransitionSuccess {
  readonly ok: true;
  readonly changed: boolean;
  readonly state: WarRoomState;
}

export interface TransitionFailure {
  readonly ok: false;
  readonly changed: false;
  readonly state: WarRoomState;
  readonly error: import("./errors").WarRoomDomainError;
}

export type TransitionResult = TransitionSuccess | TransitionFailure;

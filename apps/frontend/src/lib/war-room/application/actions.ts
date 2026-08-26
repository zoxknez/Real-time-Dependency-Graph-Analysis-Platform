/**
 * War Room Actions Application Boundary
 *
 * Single unified action interface invoked identically by Human UI and future WebMCP tools.
 * Enforces pre-commit stale context validation, trusted security propagation,
 * and sanitized error handling.
 * Follows WMCP-INV-002, WMCP-INV-003, WMCP-INV-004, WMCP-INV-017, WMCP-INV-021.
 */

import {
  WarRoomGraphContext,
  WarRoomAnalysisRef,
  WarRoomPlanRef,
} from "../domain/types";
import {
  WarRoomDomainError,
  createDomainError,
  invalidStateError,
  staleContextError,
} from "../domain/errors";
import { WarRoomStatePort } from "../state/store";
import {
  WarRoomInvocationContext,
  WarRoomActionResult,
  WarRoomPackageSearchResult,
  WarRoomPackageInspection,
  WarRoomDependencyPath,
  SearchPackagesRequest,
  InspectPackageRequest,
  TraceDependencyPathRequest,
  OpenPackageGraphRequest,
  SelectPackageRequest,
  CreateScenarioRequest,
  ChangeScenarioPatchRequest,
  AttachHumanReviewRequest,
  ChangeHumanReviewRequest,
} from "./types";
import {
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
} from "./ports";
import {
  validateInvocationContext,
  validateSearchPackagesRequest,
  validateInspectPackageRequest,
  validateTraceDependencyPathRequest,
  validateOpenPackageGraphRequest,
  validateGraphServiceOutput,
} from "./validation";

export interface WarRoomActionsDependencies {
  readonly statePort: WarRoomStatePort;
  readonly securityContextPort: WarRoomSecurityContextPort;
  readonly authorizationPort: WarRoomAuthorizationPort;
  readonly packageCatalogPort: WarRoomPackageCatalogPort;
  readonly graphQueryPort: WarRoomGraphQueryPort;
  readonly scenarioAnalysisPort: WarRoomScenarioAnalysisPort;
  readonly migrationPlanningPort: WarRoomMigrationPlanningPort;
}

export interface WarRoomActions {
  initialize(): WarRoomActionResult<void>;

  searchPackages(
    invocation: WarRoomInvocationContext,
    request: SearchPackagesRequest
  ): Promise<WarRoomActionResult<WarRoomPackageSearchResult>>;

  inspectPackage(
    invocation: WarRoomInvocationContext,
    request: InspectPackageRequest
  ): Promise<WarRoomActionResult<WarRoomPackageInspection>>;

  traceDependencyPath(
    invocation: WarRoomInvocationContext,
    request: TraceDependencyPathRequest
  ): Promise<WarRoomActionResult<WarRoomDependencyPath>>;

  openPackageGraph(
    invocation: WarRoomInvocationContext,
    request: OpenPackageGraphRequest
  ): Promise<WarRoomActionResult<WarRoomGraphContext>>;

  closeGraph(
    invocation: WarRoomInvocationContext
  ): Promise<WarRoomActionResult<void>>;

  selectPackage(
    invocation: WarRoomInvocationContext,
    request: SelectPackageRequest
  ): Promise<WarRoomActionResult<void>>;

  deselectPackage(
    invocation: WarRoomInvocationContext
  ): Promise<WarRoomActionResult<void>>;

  createScenario(
    invocation: WarRoomInvocationContext,
    request: CreateScenarioRequest
  ): Promise<WarRoomActionResult<void>>;

  changeScenarioPatch(
    invocation: WarRoomInvocationContext,
    request: ChangeScenarioPatchRequest
  ): Promise<WarRoomActionResult<void>>;

  resetScenario(
    invocation: WarRoomInvocationContext
  ): Promise<WarRoomActionResult<void>>;

  recalculateScenario(
    invocation: WarRoomInvocationContext
  ): Promise<WarRoomActionResult<WarRoomAnalysisRef>>;

  attachHumanReview(
    invocation: WarRoomInvocationContext,
    request: AttachHumanReviewRequest
  ): Promise<WarRoomActionResult<void>>;

  changeHumanReview(
    invocation: WarRoomInvocationContext,
    request: ChangeHumanReviewRequest
  ): Promise<WarRoomActionResult<void>>;

  generateMigrationPlan(
    invocation: WarRoomInvocationContext
  ): Promise<WarRoomActionResult<WarRoomPlanRef>>;

  resetMigrationPlan(
    invocation: WarRoomInvocationContext
  ): Promise<WarRoomActionResult<void>>;
}

function createActionSuccess<T>(
  data: T,
  changed: boolean,
  contextRevision: number
): WarRoomActionResult<T> {
  return {
    ok: true,
    data,
    changed,
    contextRevision,
  };
}

function createActionFailure<T>(
  error: WarRoomDomainError,
  contextRevision: number
): WarRoomActionResult<T> {
  return {
    ok: false,
    error,
    changed: false,
    contextRevision,
  };
}

function sanitizeServiceException(err: unknown): WarRoomDomainError {
  if (err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("abort"))) {
    return createDomainError("CANCELLED", "Operation was cancelled");
  }
  return createDomainError("INTERNAL_ERROR", "Unexpected War Room service failure");
}

export function createWarRoomActions(
  deps: WarRoomActionsDependencies
): WarRoomActions {
  const {
    statePort,
    securityContextPort,
    authorizationPort,
    packageCatalogPort,
    graphQueryPort,
    scenarioAnalysisPort,
    migrationPlanningPort,
  } = deps;

  return {
    initialize(): WarRoomActionResult<void> {
      const result = statePort.transition({ type: "APP_INITIALIZED" });
      const currentRev = statePort.getState().contextRevision;
      if (!result.ok) {
        return createActionFailure(result.error, currentRev);
      }
      return createActionSuccess(undefined, result.changed, currentRev);
    },

    async searchPackages(
      invocation: WarRoomInvocationContext,
      request: SearchPackagesRequest
    ): Promise<WarRoomActionResult<WarRoomPackageSearchResult>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      const reqErr = validateSearchPackagesRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "SEARCH_PACKAGES" },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      try {
        const serviceRes = await packageCatalogPort.searchPackages(secRes.data, request, invocation.signal);
        if (!serviceRes.ok) return createActionFailure(serviceRes.error, statePort.getState().contextRevision);

        return createActionSuccess(serviceRes.data, false, statePort.getState().contextRevision);
      } catch (err) {
        return createActionFailure(sanitizeServiceException(err), statePort.getState().contextRevision);
      }
    },

    async inspectPackage(
      invocation: WarRoomInvocationContext,
      request: InspectPackageRequest
    ): Promise<WarRoomActionResult<WarRoomPackageInspection>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      const reqErr = validateInspectPackageRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "INSPECT_PACKAGE", resource: { packageId: request.packageId } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      try {
        const serviceRes = await packageCatalogPort.inspectPackage(secRes.data, request, invocation.signal);
        if (!serviceRes.ok) return createActionFailure(serviceRes.error, statePort.getState().contextRevision);

        return createActionSuccess(serviceRes.data, false, statePort.getState().contextRevision);
      } catch (err) {
        return createActionFailure(sanitizeServiceException(err), statePort.getState().contextRevision);
      }
    },

    async traceDependencyPath(
      invocation: WarRoomInvocationContext,
      request: TraceDependencyPathRequest
    ): Promise<WarRoomActionResult<WarRoomDependencyPath>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      const reqErr = validateTraceDependencyPathRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "TRACE_DEPENDENCY_PATH", resource: { fromPackageId: request.fromPackageId, toPackageId: request.toPackageId } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      try {
        const serviceRes = await graphQueryPort.traceDependencyPath(secRes.data, request, invocation.signal);
        if (!serviceRes.ok) return createActionFailure(serviceRes.error, statePort.getState().contextRevision);

        return createActionSuccess(serviceRes.data, false, statePort.getState().contextRevision);
      } catch (err) {
        return createActionFailure(sanitizeServiceException(err), statePort.getState().contextRevision);
      }
    },

    async openPackageGraph(
      invocation: WarRoomInvocationContext,
      request: OpenPackageGraphRequest
    ): Promise<WarRoomActionResult<WarRoomGraphContext>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      const reqErr = validateOpenPackageGraphRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRev);

      // Early stale rejection
      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "OPEN_PACKAGE_GRAPH", resource: { rootPackageId: request.rootPackageId } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      let graph: WarRoomGraphContext;
      try {
        const serviceRes = await graphQueryPort.loadPackageGraph(secRes.data, request, invocation.signal);
        if (!serviceRes.ok) return createActionFailure(serviceRes.error, statePort.getState().contextRevision);
        graph = serviceRes.data;
      } catch (err) {
        return createActionFailure(sanitizeServiceException(err), statePort.getState().contextRevision);
      }

      const graphValErr = validateGraphServiceOutput(graph);
      if (graphValErr) return createActionFailure(graphValErr, statePort.getState().contextRevision);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), statePort.getState().contextRevision);
      }

      // Commit-time stale guard using original capturedContextRevision
      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "GRAPH_OPENED",
        payload: { graph },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) {
        return createActionFailure(transitionRes.error, finalRev);
      }

      return createActionSuccess(graph, transitionRes.changed, finalRev);
    },

    async closeGraph(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "CLOSE_GRAPH" },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "GRAPH_CLOSED",
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async selectPackage(
      invocation: WarRoomInvocationContext,
      request: SelectPackageRequest
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (!request || !request.selection || !request.selection.package) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Selection request must be provided"), currentRev);
      }

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "SELECT_PACKAGE", resource: { packageId: request.selection.package.id } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "NODE_SELECTED",
        payload: { selection: request.selection },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async deselectPackage(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "DESELECT_PACKAGE" },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "NODE_DESELECTED",
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async createScenario(
      invocation: WarRoomInvocationContext,
      request: CreateScenarioRequest
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (!request || !request.scenario) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Scenario must be provided"), currentRev);
      }

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "CREATE_SCENARIO", resource: { scenarioId: request.scenario.id } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_CREATED",
        payload: { scenario: request.scenario },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async changeScenarioPatch(
      invocation: WarRoomInvocationContext,
      request: ChangeScenarioPatchRequest
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (!request || !Array.isArray(request.patchOperations)) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Patch operations must be an array"), currentRev);
      }

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "CHANGE_SCENARIO_PATCH" },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_PATCH_CHANGED",
        payload: { patchOperations: request.patchOperations },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async resetScenario(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "RESET_SCENARIO" },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_RESET",
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async recalculateScenario(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<WarRoomAnalysisRef>> {
      const currentState = statePort.getState();
      const currentRev = currentState.contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (
        currentState.phase !== "SIMULATION_READY" &&
        currentState.phase !== "HUMAN_REVIEW" &&
        currentState.phase !== "PLAN_READY"
      ) {
        return createActionFailure(
          invalidStateError(`recalculateScenario is not valid in phase ${currentState.phase}`),
          currentRev
        );
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "RECALCULATE_SCENARIO", resource: { scenarioId: currentState.scenario.id } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const snapshot = {
        graph: currentState.graph,
        selection: currentState.selection,
        scenario: currentState.scenario,
        sourceContextRevision: invocation.capturedContextRevision,
      };

      let analysis: WarRoomAnalysisRef;
      try {
        const serviceRes = await scenarioAnalysisPort.recalculateScenario(secRes.data, snapshot, invocation.signal);
        if (!serviceRes.ok) return createActionFailure(serviceRes.error, statePort.getState().contextRevision);
        analysis = serviceRes.data;
      } catch (err) {
        return createActionFailure(sanitizeServiceException(err), statePort.getState().contextRevision);
      }

      if (analysis.scenarioId !== snapshot.scenario.id) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Analysis scenarioId ${analysis.scenarioId} does not match active scenario ${snapshot.scenario.id}`),
          statePort.getState().contextRevision
        );
      }

      if (analysis.sourceContextRevision !== invocation.capturedContextRevision) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Analysis sourceContextRevision ${analysis.sourceContextRevision} does not match captured revision ${invocation.capturedContextRevision}`),
          statePort.getState().contextRevision
        );
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), statePort.getState().contextRevision);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_RECALCULATED",
        payload: { analysis },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(analysis, transitionRes.changed, finalRev);
    },

    async attachHumanReview(
      invocation: WarRoomInvocationContext,
      request: AttachHumanReviewRequest
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (!request || !request.review) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Review must be provided"), currentRev);
      }

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "ATTACH_HUMAN_REVIEW", resource: { reviewId: request.review.id } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "HUMAN_ANNOTATED",
        payload: { review: request.review },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async changeHumanReview(
      invocation: WarRoomInvocationContext,
      request: ChangeHumanReviewRequest
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (!request || !request.review) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Review must be provided"), currentRev);
      }

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "CHANGE_HUMAN_REVIEW", resource: { reviewId: request.review.id } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "ANNOTATION_CHANGED",
        payload: { review: request.review },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async generateMigrationPlan(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<WarRoomPlanRef>> {
      const currentState = statePort.getState();
      const currentRev = currentState.contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (currentState.phase !== "HUMAN_REVIEW") {
        return createActionFailure(
          invalidStateError(`generateMigrationPlan is only valid in HUMAN_REVIEW, current phase is ${currentState.phase}`),
          currentRev
        );
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "GENERATE_MIGRATION_PLAN", resource: { reviewId: currentState.review.id } },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const snapshot = {
        graph: currentState.graph,
        selection: currentState.selection,
        scenario: currentState.scenario,
        analysis: currentState.analysis,
        review: currentState.review,
        sourceContextRevision: invocation.capturedContextRevision,
      };

      let plan: WarRoomPlanRef;
      try {
        const serviceRes = await migrationPlanningPort.generateMigrationPlan(secRes.data, snapshot, invocation.signal);
        if (!serviceRes.ok) return createActionFailure(serviceRes.error, statePort.getState().contextRevision);
        plan = serviceRes.data;
      } catch (err) {
        return createActionFailure(sanitizeServiceException(err), statePort.getState().contextRevision);
      }

      if (plan.scenarioId !== snapshot.scenario.id) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Plan scenarioId ${plan.scenarioId} does not match active scenario ${snapshot.scenario.id}`),
          statePort.getState().contextRevision
        );
      }

      if (plan.sourceReviewId !== snapshot.review.id) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Plan sourceReviewId ${plan.sourceReviewId} does not match active review ${snapshot.review.id}`),
          statePort.getState().contextRevision
        );
      }

      if (plan.sourceContextRevision !== invocation.capturedContextRevision) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Plan sourceContextRevision ${plan.sourceContextRevision} does not match captured revision ${invocation.capturedContextRevision}`),
          statePort.getState().contextRevision
        );
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), statePort.getState().contextRevision);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "PLAN_GENERATED",
        payload: { plan },
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(plan, transitionRes.changed, finalRev);
    },

    async resetMigrationPlan(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const currentRev = statePort.getState().contextRevision;
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRev);

      if (invocation.capturedContextRevision !== currentRev) {
        return createActionFailure(staleContextError(invocation.capturedContextRevision, currentRev), currentRev);
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const secRes = await securityContextPort.getSecurityContext(invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRev);

      const authRes = await authorizationPort.authorize(
        { securityContext: secRes.data, action: "RESET_MIGRATION_PLAN" },
        invocation.signal
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRev);

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRev);
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "PLAN_RESET",
      });

      const finalRev = statePort.getState().contextRevision;
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },
  };
}

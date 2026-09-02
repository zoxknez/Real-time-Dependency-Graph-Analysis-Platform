/**
 * War Room Actions Application Boundary
 *
 * Single unified action interface invoked identically by Human UI and future WebMCP tools.
 * Enforces pre-commit stale context validation, trusted security propagation,
 * and sanitized error handling across all port invocations (WMCP-2B-R1).
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
  WarRoomSecurityContext,
  WarRoomInvocationContext,
  WarRoomActionResult,
  WarRoomServiceResult,
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
  CalculateBlastRadiusRequest,
} from "./types";
import {
  evaluateVersionAwareExposure,
  DirectDependentRecord,
  VersionAwareExposureResult,
} from "../domain/version-exposure-engine";
import {
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
  WarRoomEvidencePort,
} from "./ports";
import {
  validateInvocationContext,
  validateSecurityContextOutput,
  validateSearchPackagesRequest,
  validateInspectPackageRequest,
  validateTraceDependencyPathRequest,
  validateOpenPackageGraphRequest,
  validateSelectPackageRequest,
  validateCalculateBlastRadiusRequest,
  validateFocusGraphNodesRequest,
  validateGraphServiceOutput,
} from "./validation";
import {
  FocusGraphNodesRequest,
  FocusGraphNodesResult,
} from "./types";

export interface WarRoomActionsDependencies {
  readonly statePort: WarRoomStatePort;
  readonly securityContextPort: WarRoomSecurityContextPort;
  readonly authorizationPort: WarRoomAuthorizationPort;
  readonly packageCatalogPort: WarRoomPackageCatalogPort;
  readonly graphQueryPort: WarRoomGraphQueryPort;
  readonly scenarioAnalysisPort: WarRoomScenarioAnalysisPort;
  readonly migrationPlanningPort: WarRoomMigrationPlanningPort;
  readonly evidencePort?: WarRoomEvidencePort;
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

  calculateBlastRadius(
    invocation: WarRoomInvocationContext,
    request: CalculateBlastRadiusRequest
  ): Promise<WarRoomActionResult<VersionAwareExposureResult>>;

  focusGraphNodes(
    invocation: WarRoomInvocationContext,
    request: FocusGraphNodesRequest
  ): Promise<WarRoomActionResult<FocusGraphNodesResult>>;
}

function isAbortFailure(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

async function callPort<T>(
  signal: AbortSignal | undefined,
  invoke: () => Promise<WarRoomServiceResult<T>>
): Promise<WarRoomServiceResult<T>> {
  if (signal?.aborted) {
    return { ok: false, error: createDomainError("CANCELLED", "Operation was cancelled") };
  }

  try {
    const result = await invoke();
    if (signal?.aborted) {
      return { ok: false, error: createDomainError("CANCELLED", "Operation was cancelled") };
    }
    return result;
  } catch (err) {
    if (isAbortFailure(err, signal)) {
      return { ok: false, error: createDomainError("CANCELLED", "Operation was cancelled") };
    }
    return {
      ok: false,
      error: createDomainError("INTERNAL_ERROR", "Unexpected War Room service failure"),
    };
  }
}

async function resolveSecurity(
  securityContextPort: WarRoomSecurityContextPort,
  signal: AbortSignal | undefined
): Promise<WarRoomServiceResult<WarRoomSecurityContext>> {
  const res = await callPort(signal, () => securityContextPort.getSecurityContext(signal));
  if (!res.ok) return res;

  const valErr = validateSecurityContextOutput(res.data);
  if (valErr) return { ok: false, error: valErr };

  return res;
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

  const currentRevision = () => statePort.getState().contextRevision;

  return {
    initialize(): WarRoomActionResult<void> {
      const result = statePort.transition({ type: "APP_INITIALIZED" });
      const rev = currentRevision();
      if (!result.ok) {
        return createActionFailure(result.error, rev);
      }
      return createActionSuccess(undefined, result.changed, rev);
    },

    async searchPackages(
      invocation: WarRoomInvocationContext,
      request: SearchPackagesRequest
    ): Promise<WarRoomActionResult<WarRoomPackageSearchResult>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      const reqErr = validateSearchPackagesRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRevision());

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "SEARCH_PACKAGES" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      const serviceRes = await callPort(invocation.signal, () =>
        packageCatalogPort.searchPackages(secRes.data, request, invocation.signal)
      );
      if (!serviceRes.ok) return createActionFailure(serviceRes.error, currentRevision());

      return createActionSuccess(serviceRes.data, false, currentRevision());
    },

    async inspectPackage(
      invocation: WarRoomInvocationContext,
      request: InspectPackageRequest
    ): Promise<WarRoomActionResult<WarRoomPackageInspection>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      const reqErr = validateInspectPackageRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRevision());

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "INSPECT_PACKAGE", resource: { packageId: request.packageId } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      const serviceRes = await callPort(invocation.signal, () =>
        packageCatalogPort.inspectPackage(secRes.data, request, invocation.signal)
      );
      if (!serviceRes.ok) return createActionFailure(serviceRes.error, currentRevision());

      let evidence: import("../domain/evidence").PackageEvidence | undefined;
      if (deps.evidencePort && serviceRes.data.package) {
        try {
          evidence = await deps.evidencePort.getPackageEvidence(
            {
              ecosystem: serviceRes.data.package.ecosystem,
              packageName: serviceRes.data.package.name,
              packageVersion: serviceRes.data.package.version,
            },
            invocation.signal
          );
        } catch {
          // Evidence fetch failure does not fail package inspection (B17)
        }
      }

      return createActionSuccess({ ...serviceRes.data, evidence }, false, currentRevision());
    },

    async traceDependencyPath(
      invocation: WarRoomInvocationContext,
      request: TraceDependencyPathRequest
    ): Promise<WarRoomActionResult<WarRoomDependencyPath>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      const reqErr = validateTraceDependencyPathRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRevision());

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "TRACE_DEPENDENCY_PATH", resource: { fromPackageId: request.fromPackageId, toPackageId: request.toPackageId } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      const serviceRes = await callPort(invocation.signal, () =>
        graphQueryPort.traceDependencyPath(secRes.data, request, invocation.signal)
      );
      if (!serviceRes.ok) return createActionFailure(serviceRes.error, currentRevision());

      return createActionSuccess(serviceRes.data, false, currentRevision());
    },

    async openPackageGraph(
      invocation: WarRoomInvocationContext,
      request: OpenPackageGraphRequest
    ): Promise<WarRoomActionResult<WarRoomGraphContext>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      const reqErr = validateOpenPackageGraphRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRevision());

      // Early stale rejection
      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "OPEN_PACKAGE_GRAPH", resource: { rootPackageId: request.rootPackageId } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      const serviceRes = await callPort(invocation.signal, () =>
        graphQueryPort.loadPackageGraph(secRes.data, request, invocation.signal)
      );
      if (!serviceRes.ok) return createActionFailure(serviceRes.error, currentRevision());

      const graph = serviceRes.data;
      const graphValErr = validateGraphServiceOutput(graph);
      if (graphValErr) return createActionFailure(graphValErr, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      // Commit-time stale guard using original capturedContextRevision
      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "GRAPH_OPENED",
        payload: { graph },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) {
        return createActionFailure(transitionRes.error, finalRev);
      }

      return createActionSuccess(graph, transitionRes.changed, finalRev);
    },

    async closeGraph(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "CLOSE_GRAPH" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "GRAPH_CLOSED",
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async selectPackage(
      invocation: WarRoomInvocationContext,
      request: SelectPackageRequest
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      const reqErr = validateSelectPackageRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRevision());

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "SELECT_PACKAGE", resource: { packageId: request.selection.package.id } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "NODE_SELECTED",
        payload: { selection: request.selection },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async deselectPackage(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "DESELECT_PACKAGE" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "NODE_DESELECTED",
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async createScenario(
      invocation: WarRoomInvocationContext,
      request: CreateScenarioRequest
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (!request || !request.scenario) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Scenario must be provided"), currentRevision());
      }

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "CREATE_SCENARIO", resource: { scenarioId: request.scenario.id } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_CREATED",
        payload: { scenario: request.scenario },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async changeScenarioPatch(
      invocation: WarRoomInvocationContext,
      request: ChangeScenarioPatchRequest
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (!request || !Array.isArray(request.patchOperations)) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Patch operations must be an array"), currentRevision());
      }

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "CHANGE_SCENARIO_PATCH" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_PATCH_CHANGED",
        payload: { patchOperations: request.patchOperations },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async resetScenario(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "RESET_SCENARIO" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_RESET",
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async recalculateScenario(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<WarRoomAnalysisRef>> {
      const currentState = statePort.getState();
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      if (
        currentState.phase !== "SIMULATION_READY" &&
        currentState.phase !== "HUMAN_REVIEW" &&
        currentState.phase !== "PLAN_READY"
      ) {
        return createActionFailure(
          invalidStateError(`recalculateScenario is not valid in phase ${currentState.phase}`),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "RECALCULATE_SCENARIO", resource: { scenarioId: currentState.scenario.id } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      const snapshot = {
        graph: currentState.graph,
        selection: currentState.selection,
        scenario: currentState.scenario,
        sourceContextRevision: invocation.capturedContextRevision,
      };

      const serviceRes = await callPort(invocation.signal, () =>
        scenarioAnalysisPort.recalculateScenario(secRes.data, snapshot, invocation.signal)
      );
      if (!serviceRes.ok) return createActionFailure(serviceRes.error, currentRevision());

      const analysis = serviceRes.data;
      if (analysis.scenarioId !== snapshot.scenario.id) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Analysis scenarioId ${analysis.scenarioId} does not match active scenario ${snapshot.scenario.id}`),
          currentRevision()
        );
      }

      if (analysis.sourceContextRevision !== invocation.capturedContextRevision) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Analysis sourceContextRevision ${analysis.sourceContextRevision} does not match captured revision ${invocation.capturedContextRevision}`),
          currentRevision()
        );
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "SCENARIO_RECALCULATED",
        payload: { analysis },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(analysis, transitionRes.changed, finalRev);
    },

    async attachHumanReview(
      invocation: WarRoomInvocationContext,
      request: AttachHumanReviewRequest
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (!request || !request.review) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Review must be provided"), currentRevision());
      }

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "ATTACH_HUMAN_REVIEW", resource: { reviewId: request.review.id } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "HUMAN_ANNOTATED",
        payload: { review: request.review },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async changeHumanReview(
      invocation: WarRoomInvocationContext,
      request: ChangeHumanReviewRequest
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (!request || !request.review) {
        return createActionFailure(createDomainError("INVALID_INPUT", "Review must be provided"), currentRevision());
      }

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "CHANGE_HUMAN_REVIEW", resource: { reviewId: request.review.id } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "ANNOTATION_CHANGED",
        payload: { review: request.review },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    async generateMigrationPlan(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<WarRoomPlanRef>> {
      const currentState = statePort.getState();
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      if (currentState.phase !== "HUMAN_REVIEW") {
        return createActionFailure(
          invalidStateError(`generateMigrationPlan is only valid in HUMAN_REVIEW, current phase is ${currentState.phase}`),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "GENERATE_MIGRATION_PLAN", resource: { reviewId: currentState.review.id } },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      const snapshot = {
        graph: currentState.graph,
        selection: currentState.selection,
        scenario: currentState.scenario,
        analysis: currentState.analysis,
        review: currentState.review,
        sourceContextRevision: invocation.capturedContextRevision,
      };

      const serviceRes = await callPort(invocation.signal, () =>
        migrationPlanningPort.generateMigrationPlan(secRes.data, snapshot, invocation.signal)
      );
      if (!serviceRes.ok) return createActionFailure(serviceRes.error, currentRevision());

      const plan = serviceRes.data;
      if (plan.scenarioId !== snapshot.scenario.id) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Plan scenarioId ${plan.scenarioId} does not match active scenario ${snapshot.scenario.id}`),
          currentRevision()
        );
      }

      if (plan.sourceReviewId !== snapshot.review.id) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Plan sourceReviewId ${plan.sourceReviewId} does not match active review ${snapshot.review.id}`),
          currentRevision()
        );
      }

      if (plan.sourceContextRevision !== invocation.capturedContextRevision) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `Plan sourceContextRevision ${plan.sourceContextRevision} does not match captured revision ${invocation.capturedContextRevision}`),
          currentRevision()
        );
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "PLAN_GENERATED",
        payload: { plan },
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(plan, transitionRes.changed, finalRev);
    },

    async resetMigrationPlan(
      invocation: WarRoomInvocationContext
    ): Promise<WarRoomActionResult<void>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      if (invocation.capturedContextRevision !== currentRevision()) {
        return createActionFailure(
          staleContextError(invocation.capturedContextRevision, currentRevision()),
          currentRevision()
        );
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "RESET_MIGRATION_PLAN" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const transitionRes = statePort.commitContextBound(invocation.capturedContextRevision, {
        type: "PLAN_RESET",
      });

      const finalRev = currentRevision();
      if (!transitionRes.ok) return createActionFailure(transitionRes.error, finalRev);

      return createActionSuccess(undefined, transitionRes.changed, finalRev);
    },

    calculateBlastRadius: async (
      invocation: WarRoomInvocationContext,
      request: CalculateBlastRadiusRequest
    ): Promise<WarRoomActionResult<VersionAwareExposureResult>> => {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      const reqErr = validateCalculateBlastRadiusRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRevision());

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "CALCULATE_BLAST_RADIUS" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      // Check context state and target package authority
      const state = statePort.getState();
      let targetPackageId: string;
      let activeProposedVersion: string | undefined;
      let breakingCandidate = false;

      if (state.phase === "SIMULATION_READY" || state.phase === "HUMAN_REVIEW" || state.phase === "PLAN_READY") {
        targetPackageId = state.scenario.targetPackageId;
        activeProposedVersion = state.scenario.proposedVersion;
        breakingCandidate = (state.analysis?.totalBreakingChanges ?? 0) > 0;
      } else if (state.phase === "NODE_SELECTED") {
        targetPackageId = state.selection.package.id;
      } else if (state.phase === "GRAPH_READY") {
        targetPackageId = state.graph.rootPackage.id;
      } else {
        return createActionFailure(
          createDomainError("INVALID_STATE", "No package target available in current phase"),
          currentRevision()
        );
      }

      // Target override check
      if (request.targetPackageId && request.targetPackageId !== targetPackageId) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", `targetPackageId '${request.targetPackageId}' does not match authoritative context target '${targetPackageId}'`),
          currentRevision()
        );
      }

      // Proposed version resolution
      let proposedVersion = request.proposedVersion?.trim();
      if (activeProposedVersion) {
        if (proposedVersion && proposedVersion !== activeProposedVersion) {
          return createActionFailure(
            createDomainError("INVALID_INPUT", `Contradictory proposedVersion: request '${proposedVersion}' does not match active scenario proposedVersion '${activeProposedVersion}'`),
            currentRevision()
          );
        }
        proposedVersion = activeProposedVersion;
      }

      if (!proposedVersion || proposedVersion.length === 0) {
        return createActionFailure(
          createDomainError("INVALID_INPUT", "Proposed version must be explicitly provided"),
          currentRevision()
        );
      }

      // Query direct dependents
      let directDependents: readonly DirectDependentRecord[] = [];
      let topologicalReachabilityCount = 0;

      if (typeof graphQueryPort.getDirectDependents === "function") {
        const directRes = await callPort(invocation.signal, () =>
          graphQueryPort.getDirectDependents!(
            secRes.data,
            { packageId: targetPackageId },
            invocation.signal
          )
        );
        if (!directRes.ok) return createActionFailure(directRes.error, currentRevision());
        directDependents = directRes.data;
        topologicalReachabilityCount = directDependents.length;
      } else if ("graph" in state && state.graph) {
        // Fallback: extract from graph context if getDirectDependents is not implemented
        const pids = state.graph.packageIds.filter((id: string) => id !== targetPackageId);
        topologicalReachabilityCount = pids.length;
        directDependents = pids.map((id: string) => ({
          dependentPackageId: id,
          name: id,
          ecosystem: state.graph.rootPackage.ecosystem,
          rawRequirement: undefined,
          depth: 1,
        }));
      }

      if (invocation.signal?.aborted) {
        return createActionFailure(createDomainError("CANCELLED", "Operation was cancelled"), currentRevision());
      }

      const exposureResult = evaluateVersionAwareExposure({
        targetPackageId,
        proposedVersion,
        breakingCandidate,
        directDependents,
        topologicalReachabilityCount,
      });

      return createActionSuccess(exposureResult, false, currentRevision());
    },

    async focusGraphNodes(
      invocation: WarRoomInvocationContext,
      request: FocusGraphNodesRequest
    ): Promise<WarRoomActionResult<FocusGraphNodesResult>> {
      const invErr = validateInvocationContext(invocation);
      if (invErr) return createActionFailure(invErr, currentRevision());

      const reqErr = validateFocusGraphNodesRequest(request);
      if (reqErr) return createActionFailure(reqErr, currentRevision());

      const state = statePort.getState();
      if (
        state.phase !== "GRAPH_READY" &&
        state.phase !== "NODE_SELECTED" &&
        state.phase !== "SIMULATION_READY" &&
        state.phase !== "HUMAN_REVIEW" &&
        state.phase !== "PLAN_READY"
      ) {
        return createActionFailure(
          createDomainError("INVALID_STATE", `focusGraphNodes requires an active graph, current phase is ${state.phase}`),
          currentRevision()
        );
      }

      // Validate all requested nodeIds exist in current graph context (B23)
      const graphNodeIds = new Set(state.graph.packageIds);
      for (const id of request.nodeIds) {
        if (!graphNodeIds.has(id)) {
          return createActionFailure(
            createDomainError("INVALID_INPUT", `Node '${id}' does not exist in current graph`),
            currentRevision()
          );
        }
      }

      const secRes = await resolveSecurity(securityContextPort, invocation.signal);
      if (!secRes.ok) return createActionFailure(secRes.error, currentRevision());

      const authRes = await callPort(invocation.signal, () =>
        authorizationPort.authorize(
          { securityContext: secRes.data, action: "FOCUS_GRAPH_NODES" },
          invocation.signal
        )
      );
      if (!authRes.ok) return createActionFailure(authRes.error, currentRevision());

      const commitRes = statePort.commitContextBound(
        invocation.capturedContextRevision,
        {
          type: "VISUAL_FOCUS_CHANGED",
          payload: { focusedPackageIds: request.nodeIds },
        }
      );

      if (!commitRes.ok) {
        return createActionFailure(commitRes.error, currentRevision());
      }

      return createActionSuccess(
        { focusedCount: request.nodeIds.length, focusedNodeIds: request.nodeIds },
        true,
        currentRevision()
      );
    },
  };
}

/**
 * WebMCP Adaptive Tool Definitions & Factory (WMCP-4B / WMCP-4C / WMCP-4C-R1)
 *
 * Produces executable WebMcpPlatformToolDefinition instances for all EXECUTABLE tools
 * by delegating to WarRoomActions and WarRoomState canonical read models.
 * Enforces invocation-time logical surface admission and execution policies.
 * Fails closed for DEFERRED capabilities and PENDING_DOMAIN_CONTRACT tools without faking business logic.
 * Follows WMCP-INV-001, WMCP-INV-002, WMCP-INV-003, WMCP-INV-004, WMCP-INV-016, WMCP-INV-017, WMCP-INV-019,
 * INV-WMCP4B-DEF-001, INV-WMCP4B-DEF-002, INV-WMCP4B-DEF-003, INV-WMCP4C-EXEC-001 through INV-WMCP4C-EXEC-012,
 * and INV-WMCP4C-MUT-001.
 */

import { WarRoomStatePort } from "../../war-room/state/store";
import { WarRoomActions } from "../../war-room/application/actions";
import { WarRoomGraphProjectionStore } from "../../war-room/integration/graph-projection";
import { WarRoomInvocationContext } from "../../war-room/application/types";
import {
  WebMcpPlatformToolDefinition,
  WebMcpPlatformExecutionContext,
  WebMcpPlatformAdapter,
} from "../platform/types";
import { WebMcpActionName } from "../lifecycle/types";
import {
  getToolCatalogEntry,
} from "./adaptive-catalog";
import {
  validateEmptyObjectInput,
  validateTraceDependencyPathInput,
} from "./adaptive-validation";
import {
  validateSearchPackagesInput,
  validateOpenPackageGraphInput,
} from "./validation";
import {
  formatToolFailure,
  formatToolSuccess,
  buildBudgetedSearchOutput,
  buildBudgetedOpenGraphOutput,
} from "./output";
import {
  captureExecutionSnapshot,
  checkExecutionAdmission,
} from "./execution-guard";

export interface AdaptiveToolContext {
  readonly statePort: WarRoomStatePort;
  readonly actions: WarRoomActions;
  readonly projectionStore?: WarRoomGraphProjectionStore;
  readonly platformAdapter?: WebMcpPlatformAdapter;
}

/**
 * Creates an executable platform tool definition for a canonical WebMCP tool.
 *
 * - For EXECUTABLE tools with FROZEN schemas: delegates to WarRoomActions or canonical read model with admission & context guards.
 * - For DEFERRED tools or PENDING_DOMAIN_CONTRACT tools: fails closed immediately on instantiation.
 */
export function createAdaptiveToolDefinition(
  name: WebMcpActionName,
  context: AdaptiveToolContext
): WebMcpPlatformToolDefinition<Record<string, unknown>, unknown> {
  const entry = getToolCatalogEntry(name);

  // INV-WMCP4B-DEF-001 & INV-WMCP4B-DEF-002: Deferred and pending-contract tools cannot produce executable definitions.
  if (entry.bindingStatus === "DEFERRED") {
    throw new Error(
      `Tool '${name}' is deferred (${entry.futureDependency ?? "future capability"}) and cannot be instantiated as an executable definition in WMCP-4B.`
    );
  }

  const { statePort, actions, projectionStore, platformAdapter } = context;

  switch (name) {
    case "search_packages": {
      return {
        name: "search_packages",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>, execContext?: WebMcpPlatformExecutionContext) => {
          const snapshot = captureExecutionSnapshot(statePort);
          const admission = checkExecutionAdmission("search_packages", snapshot, platformAdapter);
          if (!admission.admitted) {
            return admission.failureOutput;
          }

          if (execContext?.signal?.aborted) {
            return formatToolFailure("search_packages", snapshot.contextRevision, "CANCELLED", "Operation was cancelled before execution");
          }

          const valRes = validateSearchPackagesInput(input);
          if (!valRes.valid || !valRes.value) {
            return formatToolFailure("search_packages", snapshot.contextRevision, "INVALID_INPUT", valRes.error || "Invalid search input");
          }

          const signal = execContext?.signal;
          const invocation: WarRoomInvocationContext = {
            channel: "AGENT",
            capturedContextRevision: snapshot.contextRevision,
            signal,
          };

          try {
            const actionRes = await actions.searchPackages(invocation, valRes.value);

            if (signal?.aborted) {
              return formatToolFailure("search_packages", snapshot.contextRevision, "CANCELLED", "Operation was cancelled during search");
            }

            if (!actionRes.ok) {
              return formatToolFailure("search_packages", actionRes.contextRevision, actionRes.error.code, actionRes.error.message);
            }

            return buildBudgetedSearchOutput(
              "search_packages",
              actionRes.contextRevision,
              actionRes.data.packages,
              actionRes.data.totalCount
            );
          } catch (err: unknown) {
            return formatToolFailure(
              "search_packages",
              snapshot.contextRevision,
              "INTERNAL_ERROR",
              err instanceof Error ? err.message : "Unexpected error"
            );
          }
        },
      };
    }

    case "open_package_graph": {
      return {
        name: "open_package_graph",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>, execContext?: WebMcpPlatformExecutionContext) => {
          const snapshot = captureExecutionSnapshot(statePort);
          const admission = checkExecutionAdmission("open_package_graph", snapshot, platformAdapter);
          if (!admission.admitted) {
            return admission.failureOutput;
          }

          if (execContext?.signal?.aborted) {
            return formatToolFailure("open_package_graph", snapshot.contextRevision, "CANCELLED", "Operation was cancelled before execution");
          }

          const valRes = validateOpenPackageGraphInput(input);
          if (!valRes.valid || !valRes.value) {
            return formatToolFailure("open_package_graph", snapshot.contextRevision, "INVALID_INPUT", valRes.error || "Invalid open graph input");
          }

          const signal = execContext?.signal ?? new AbortController().signal;
          const invocation: WarRoomInvocationContext = {
            channel: "AGENT",
            capturedContextRevision: snapshot.contextRevision,
            signal,
          };

          try {
            const actionRes = await actions.openPackageGraph(invocation, valRes.value);

            if (actionRes.ok) {
              // INV-WMCP4C-MUT-001: Authoritative canonical commit has succeeded.
              // Post-commit abort must not override committed SUCCESS or discard projection.
              let projectionActivated = false;
              if (projectionStore) {
                projectionActivated = projectionStore.activateProjection(signal, actionRes.data.id);
              }

              return buildBudgetedOpenGraphOutput(
                "open_package_graph",
                actionRes.contextRevision,
                actionRes.changed,
                actionRes.data.id,
                actionRes.data.rootPackage,
                actionRes.data.packageIds.length,
                projectionActivated
              );
            }

            // Mutation did not commit (actionRes.ok === false)
            if (projectionStore) {
              projectionStore.discardProjection(signal);
            }

            if (signal.aborted) {
              return formatToolFailure("open_package_graph", snapshot.contextRevision, "CANCELLED", "Operation was cancelled during graph opening");
            }

            return formatToolFailure("open_package_graph", actionRes.contextRevision, actionRes.error.code, actionRes.error.message);
          } catch (err: unknown) {
            if (projectionStore) projectionStore.discardProjection(signal);
            return formatToolFailure(
              "open_package_graph",
              snapshot.contextRevision,
              "INTERNAL_ERROR",
              err instanceof Error ? err.message : "Unexpected error"
            );
          }
        },
      };
    }

    case "summarize_graph": {
      return {
        name: "summarize_graph",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>, execContext?: WebMcpPlatformExecutionContext) => {
          const snapshot = captureExecutionSnapshot(statePort);
          const admission = checkExecutionAdmission("summarize_graph", snapshot, platformAdapter);
          if (!admission.admitted) {
            return admission.failureOutput;
          }

          if (execContext?.signal?.aborted) {
            return formatToolFailure("summarize_graph", snapshot.contextRevision, "CANCELLED", "Operation was cancelled before execution");
          }

          const valRes = validateEmptyObjectInput(input, "summarize_graph");
          if (!valRes.ok) {
            return formatToolFailure("summarize_graph", snapshot.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("graph" in snapshot.state) || !snapshot.state.graph) {
            return formatToolFailure(
              "summarize_graph",
              snapshot.contextRevision,
              "INVALID_STATE",
              "No active graph is available to summarize. Open a package graph first."
            );
          }

          const graph = snapshot.state.graph;

          // STRICT_CONTEXT_READ: Check cancellation then stale completion
          if (execContext?.signal?.aborted) {
            return formatToolFailure("summarize_graph", snapshot.contextRevision, "CANCELLED", "Operation was cancelled");
          }

          const currentRevision = statePort.getState().contextRevision;
          if (currentRevision !== snapshot.contextRevision) {
            return formatToolFailure(
              "summarize_graph",
              currentRevision,
              "STALE_CONTEXT",
              "Context revision changed during summarize_graph execution; result is stale."
            );
          }

          return formatToolSuccess("summarize_graph", false, snapshot.contextRevision, {
            graphId: graph.id,
            rootPackage: graph.rootPackage,
            packageCount: graph.packageIds.length,
            contextRevision: snapshot.contextRevision,
          });
        },
      };
    }

    case "trace_dependency_path": {
      return {
        name: "trace_dependency_path",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>, execContext?: WebMcpPlatformExecutionContext) => {
          const snapshot = captureExecutionSnapshot(statePort);
          const admission = checkExecutionAdmission("trace_dependency_path", snapshot, platformAdapter);
          if (!admission.admitted) {
            return admission.failureOutput;
          }

          if (execContext?.signal?.aborted) {
            return formatToolFailure("trace_dependency_path", snapshot.contextRevision, "CANCELLED", "Operation was cancelled before execution");
          }

          const valRes = validateTraceDependencyPathInput(input);
          if (!valRes.ok) {
            return formatToolFailure("trace_dependency_path", snapshot.contextRevision, "INVALID_INPUT", valRes.error);
          }

          const signal = execContext?.signal;
          const invocation: WarRoomInvocationContext = {
            channel: "AGENT",
            capturedContextRevision: snapshot.contextRevision,
            signal,
          };

          try {
            const actionRes = await actions.traceDependencyPath(invocation, {
              fromPackageId: valRes.value.sourcePackageId,
              toPackageId: valRes.value.targetPackageId,
              maxHops: valRes.value.maxDepth,
            });

            if (signal?.aborted) {
              return formatToolFailure("trace_dependency_path", snapshot.contextRevision, "CANCELLED", "Operation was cancelled");
            }

            if (!actionRes.ok) {
              return formatToolFailure("trace_dependency_path", actionRes.contextRevision, actionRes.error.code, actionRes.error.message);
            }

            return formatToolSuccess("trace_dependency_path", actionRes.changed, actionRes.contextRevision, {
              sourcePackageId: valRes.value.sourcePackageId,
              targetPackageId: valRes.value.targetPackageId,
              path: actionRes.data.packageIds,
              pathLength: actionRes.data.packageIds.length,
              totalHops: actionRes.data.hopCount,
            });
          } catch (err: unknown) {
            return formatToolFailure(
              "trace_dependency_path",
              snapshot.contextRevision,
              "INTERNAL_ERROR",
              err instanceof Error ? err.message : "Unexpected error"
            );
          }
        },
      };
    }

    case "inspect_selected_package": {
      return {
        name: "inspect_selected_package",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>, execContext?: WebMcpPlatformExecutionContext) => {
          const snapshot = captureExecutionSnapshot(statePort);
          const admission = checkExecutionAdmission("inspect_selected_package", snapshot, platformAdapter);
          if (!admission.admitted) {
            return admission.failureOutput;
          }

          if (execContext?.signal?.aborted) {
            return formatToolFailure("inspect_selected_package", snapshot.contextRevision, "CANCELLED", "Operation was cancelled before execution");
          }

          const valRes = validateEmptyObjectInput(input, "inspect_selected_package");
          if (!valRes.ok) {
            return formatToolFailure("inspect_selected_package", snapshot.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("selection" in snapshot.state) || !snapshot.state.selection) {
            return formatToolFailure(
              "inspect_selected_package",
              snapshot.contextRevision,
              "INVALID_STATE",
              "No package is currently selected in the graph. Select a package first."
            );
          }

          const packageId = snapshot.state.selection.package.id;
          const signal = execContext?.signal;
          const invocation: WarRoomInvocationContext = {
            channel: "AGENT",
            capturedContextRevision: snapshot.contextRevision,
            signal,
          };

          try {
            const actionRes = await actions.inspectPackage(invocation, {
              packageId,
            });

            // STRICT_CONTEXT_READ: 1. Cancellation wins, 2. Stale completion check
            if (signal?.aborted) {
              return formatToolFailure("inspect_selected_package", snapshot.contextRevision, "CANCELLED", "Operation was cancelled");
            }

            const currentRevision = statePort.getState().contextRevision;
            if (currentRevision !== snapshot.contextRevision) {
              return formatToolFailure(
                "inspect_selected_package",
                currentRevision,
                "STALE_CONTEXT",
                "Context revision changed during package inspection; selected package context is stale."
              );
            }

            if (!actionRes.ok) {
              return formatToolFailure("inspect_selected_package", actionRes.contextRevision, actionRes.error.code, actionRes.error.message);
            }

            return formatToolSuccess("inspect_selected_package", actionRes.changed, actionRes.contextRevision, {
              packageId,
              name: actionRes.data.package.name,
              ecosystem: actionRes.data.package.ecosystem,
              version: actionRes.data.package.version,
              dependenciesCount: actionRes.data.directDependencyIds.length,
              dependentsCount: actionRes.data.directDependentIds.length,
            });
          } catch (err: unknown) {
            return formatToolFailure(
              "inspect_selected_package",
              snapshot.contextRevision,
              "INTERNAL_ERROR",
              err instanceof Error ? err.message : "Unexpected error"
            );
          }
        },
      };
    }

    case "inspect_scenario": {
      return {
        name: "inspect_scenario",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>, execContext?: WebMcpPlatformExecutionContext) => {
          const snapshot = captureExecutionSnapshot(statePort);
          const admission = checkExecutionAdmission("inspect_scenario", snapshot, platformAdapter);
          if (!admission.admitted) {
            return admission.failureOutput;
          }

          if (execContext?.signal?.aborted) {
            return formatToolFailure("inspect_scenario", snapshot.contextRevision, "CANCELLED", "Operation was cancelled before execution");
          }

          const valRes = validateEmptyObjectInput(input, "inspect_scenario");
          if (!valRes.ok) {
            return formatToolFailure("inspect_scenario", snapshot.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("scenario" in snapshot.state) || !snapshot.state.scenario) {
            return formatToolFailure("inspect_scenario", snapshot.contextRevision, "INVALID_STATE", "No simulation scenario is currently active.");
          }

          const scenario = snapshot.state.scenario;

          // STRICT_CONTEXT_READ: Check cancellation then stale completion
          if (execContext?.signal?.aborted) {
            return formatToolFailure("inspect_scenario", snapshot.contextRevision, "CANCELLED", "Operation was cancelled");
          }

          const currentRevision = statePort.getState().contextRevision;
          if (currentRevision !== snapshot.contextRevision) {
            return formatToolFailure(
              "inspect_scenario",
              currentRevision,
              "STALE_CONTEXT",
              "Context revision changed during scenario inspection; result is stale."
            );
          }

          return formatToolSuccess("inspect_scenario", false, snapshot.contextRevision, {
            scenarioId: scenario.id,
            targetPackageId: scenario.targetPackageId,
            proposedVersion: scenario.proposedVersion,
            patchCount: scenario.patchOperations.length,
            contextRevision: snapshot.contextRevision,
          });
        },
      };
    }

    case "inspect_migration_plan": {
      return {
        name: "inspect_migration_plan",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>, execContext?: WebMcpPlatformExecutionContext) => {
          const snapshot = captureExecutionSnapshot(statePort);
          const admission = checkExecutionAdmission("inspect_migration_plan", snapshot, platformAdapter);
          if (!admission.admitted) {
            return admission.failureOutput;
          }

          if (execContext?.signal?.aborted) {
            return formatToolFailure("inspect_migration_plan", snapshot.contextRevision, "CANCELLED", "Operation was cancelled before execution");
          }

          const valRes = validateEmptyObjectInput(input, "inspect_migration_plan");
          if (!valRes.ok) {
            return formatToolFailure("inspect_migration_plan", snapshot.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("plan" in snapshot.state) || !snapshot.state.plan) {
            return formatToolFailure("inspect_migration_plan", snapshot.contextRevision, "INVALID_STATE", "No migration plan has been generated yet.");
          }

          const plan = snapshot.state.plan;

          // STRICT_CONTEXT_READ: Check cancellation then stale completion
          if (execContext?.signal?.aborted) {
            return formatToolFailure("inspect_migration_plan", snapshot.contextRevision, "CANCELLED", "Operation was cancelled");
          }

          const currentRevision = statePort.getState().contextRevision;
          if (currentRevision !== snapshot.contextRevision) {
            return formatToolFailure(
              "inspect_migration_plan",
              currentRevision,
              "STALE_CONTEXT",
              "Context revision changed during migration plan inspection; result is stale."
            );
          }

          return formatToolSuccess("inspect_migration_plan", false, snapshot.contextRevision, {
            planId: plan.id,
            scenarioId: plan.scenarioId,
            sourceReviewId: plan.sourceReviewId,
            contextRevision: snapshot.contextRevision,
          });
        },
      };
    }

    default: {
      throw new Error(`Unhandled or deferred tool definition: ${name}`);
    }
  }
}

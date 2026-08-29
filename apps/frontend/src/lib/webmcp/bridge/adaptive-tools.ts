/**
 * WebMCP Adaptive Tool Definitions & Factory (WMCP-4B / WMCP-4B-R2)
 *
 * Produces executable WebMcpPlatformToolDefinition instances for all EXECUTABLE tools
 * by delegating to WarRoomActions and WarRoomState canonical read models.
 * Fails closed for DEFERRED capabilities and PENDING_DOMAIN_CONTRACT tools without faking business logic.
 * Follows WMCP-INV-001, WMCP-INV-002, WMCP-INV-003, WMCP-INV-004, WMCP-INV-016, WMCP-INV-017, WMCP-INV-019,
 * INV-WMCP4B-DEF-001, INV-WMCP4B-DEF-002, and INV-WMCP4B-DEF-003.
 */

import { WarRoomStatePort } from "../../war-room/state/store";
import { WarRoomActions } from "../../war-room/application/actions";
import { WarRoomGraphProjectionStore } from "../../war-room/integration/graph-projection";
import { WarRoomInvocationContext } from "../../war-room/application/types";
import {
  WebMcpPlatformToolDefinition,
  WebMcpPlatformExecutionContext,
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
  formatToolFailure,
  formatToolSuccess,
} from "./output";
import {
  createPrimitiveTools,
} from "./primitive-tools";

export interface AdaptiveToolContext {
  readonly statePort: WarRoomStatePort;
  readonly actions: WarRoomActions;
  readonly projectionStore?: WarRoomGraphProjectionStore;
}

function getPrimitiveContext(context: AdaptiveToolContext) {
  return {
    statePort: context.statePort,
    actions: context.actions,
    projectionStore: context.projectionStore ?? {
      getProjection: () => null,
      getLatestRequestedSequence: () => 0,
      nextSequence: () => 0,
      stageProjection: () => {},
      activateProjection: () => true,
      discardProjection: () => {},
      subscribe: () => () => {},
    },
  };
}

/**
 * Creates an executable platform tool definition for a canonical WebMCP tool.
 *
 * - For EXECUTABLE tools with FROZEN schemas: delegates to WarRoomActions or canonical read model.
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

  const { statePort, actions } = context;

  switch (name) {
    case "search_packages": {
      const [searchDef] = createPrimitiveTools(getPrimitiveContext(context));
      return searchDef;
    }

    case "open_package_graph": {
      const [, openDef] = createPrimitiveTools(getPrimitiveContext(context));
      return openDef;
    }

    case "summarize_graph": {
      return {
        name: "summarize_graph",
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        execute: async (input: Record<string, unknown>) => {
          const state = statePort.getState();
          const valRes = validateEmptyObjectInput(input, "summarize_graph");
          if (!valRes.ok) {
            return formatToolFailure("summarize_graph", state.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("graph" in state) || !state.graph) {
            return formatToolFailure(
              "summarize_graph",
              state.contextRevision,
              "INVALID_STATE",
              "No active graph is available to summarize. Open a package graph first."
            );
          }

          const graph = state.graph;
          return formatToolSuccess("summarize_graph", false, state.contextRevision, {
            graphId: graph.id,
            rootPackage: graph.rootPackage,
            packageCount: graph.packageIds.length,
            contextRevision: state.contextRevision,
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
          const state = statePort.getState();
          const valRes = validateTraceDependencyPathInput(input);
          if (!valRes.ok) {
            return formatToolFailure("trace_dependency_path", state.contextRevision, "INVALID_INPUT", valRes.error);
          }

          const invocation: WarRoomInvocationContext = {
            channel: "AGENT",
            capturedContextRevision: state.contextRevision,
            signal: execContext?.signal,
          };

          try {
            const actionRes = await actions.traceDependencyPath(invocation, {
              fromPackageId: valRes.value.sourcePackageId,
              toPackageId: valRes.value.targetPackageId,
              maxHops: valRes.value.maxDepth,
            });

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
              state.contextRevision,
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
          const state = statePort.getState();
          const valRes = validateEmptyObjectInput(input, "inspect_selected_package");
          if (!valRes.ok) {
            return formatToolFailure("inspect_selected_package", state.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("selection" in state) || !state.selection) {
            return formatToolFailure(
              "inspect_selected_package",
              state.contextRevision,
              "INVALID_STATE",
              "No package is currently selected in the graph. Select a package first."
            );
          }

          const packageId = state.selection.package.id;
          const invocation: WarRoomInvocationContext = {
            channel: "AGENT",
            capturedContextRevision: state.contextRevision,
            signal: execContext?.signal,
          };

          try {
            const actionRes = await actions.inspectPackage(invocation, {
              packageId,
            });

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
              state.contextRevision,
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
        execute: async (input: Record<string, unknown>) => {
          const state = statePort.getState();
          const valRes = validateEmptyObjectInput(input, "inspect_scenario");
          if (!valRes.ok) {
            return formatToolFailure("inspect_scenario", state.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("scenario" in state) || !state.scenario) {
            return formatToolFailure("inspect_scenario", state.contextRevision, "INVALID_STATE", "No simulation scenario is currently active.");
          }

          const scenario = state.scenario;
          return formatToolSuccess("inspect_scenario", false, state.contextRevision, {
            scenarioId: scenario.id,
            targetPackageId: scenario.targetPackageId,
            proposedVersion: scenario.proposedVersion,
            patchCount: scenario.patchOperations.length,
            contextRevision: state.contextRevision,
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
        execute: async (input: Record<string, unknown>) => {
          const state = statePort.getState();
          const valRes = validateEmptyObjectInput(input, "inspect_migration_plan");
          if (!valRes.ok) {
            return formatToolFailure("inspect_migration_plan", state.contextRevision, "INVALID_INPUT", valRes.error);
          }

          if (!("plan" in state) || !state.plan) {
            return formatToolFailure("inspect_migration_plan", state.contextRevision, "INVALID_STATE", "No migration plan has been generated yet.");
          }

          const plan = state.plan;
          return formatToolSuccess("inspect_migration_plan", false, state.contextRevision, {
            planId: plan.id,
            scenarioId: plan.scenarioId,
            sourceReviewId: plan.sourceReviewId,
            contextRevision: state.contextRevision,
          });
        },
      };
    }

    default: {
      throw new Error(`Unhandled or deferred tool definition: ${name}`);
    }
  }
}

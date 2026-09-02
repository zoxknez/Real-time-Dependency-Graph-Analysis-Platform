/**
 * WebMCP Adaptive Execution Admission & Context Guards (WMCP-4C)
 *
 * Implements invocation-time logical surface admission, single execution snapshot capture,
 * and policy-specific stale completion guards.
 * Follows WMCP-INV-001, WMCP-INV-002, WMCP-INV-003, WMCP-INV-004,
 * INV-WMCP4C-EXEC-001 through INV-WMCP4C-EXEC-012.
 */

import { WarRoomState, WarRoomPhase } from "../../war-room/domain/types";
import { WarRoomStatePort } from "../../war-room/state/store";
import { WebMcpActionName, WebMcpCapabilityState } from "../lifecycle/types";
import { deriveDesiredToolSurface } from "../lifecycle/surface";
import { WebMcpPlatformAdapter } from "../platform/types";
import { formatToolFailure } from "./output";
import { WebMcpToolFailureEnvelope } from "./types";

export type WebMcpExecutionPolicy =
  | "REVISION_TOLERANT_READ"
  | "STRICT_CONTEXT_READ"
  | "ACTION_COMMIT_GUARDED_MUTATION";

export const EXECUTABLE_TOOL_POLICIES: Record<
  | "search_packages"
  | "open_package_graph"
  | "summarize_graph"
  | "trace_dependency_path"
  | "inspect_selected_package"
  | "simulate_api_changes"
  | "inspect_scenario"
  | "recalculate_scenario"
  | "inspect_migration_plan",
  WebMcpExecutionPolicy
> = {
  search_packages: "REVISION_TOLERANT_READ",
  trace_dependency_path: "REVISION_TOLERANT_READ",
  summarize_graph: "STRICT_CONTEXT_READ",
  inspect_selected_package: "STRICT_CONTEXT_READ",
  inspect_scenario: "STRICT_CONTEXT_READ",
  inspect_migration_plan: "STRICT_CONTEXT_READ",
  open_package_graph: "ACTION_COMMIT_GUARDED_MUTATION",
  simulate_api_changes: "ACTION_COMMIT_GUARDED_MUTATION",
  recalculate_scenario: "ACTION_COMMIT_GUARDED_MUTATION",
};

export interface WebMcpExecutionSnapshot {
  readonly state: WarRoomState;
  readonly contextRevision: number;
  readonly phase: WarRoomPhase;
}

/**
 * Captures a single immutable canonical execution snapshot at invocation start.
 */
export function captureExecutionSnapshot(statePort: WarRoomStatePort): WebMcpExecutionSnapshot {
  const state = statePort.getState();
  return {
    state,
    contextRevision: state.contextRevision,
    phase: state.phase,
  };
}

export type AdmissionCheckResult =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly failureOutput: WebMcpToolFailureEnvelope };

/**
 * Evaluates whether a tool invocation is admitted against the CURRENT application capability state.
 * Reuses deriveDesiredToolSurface from WMCP-4A as the sole admission authority.
 */
export function checkExecutionAdmission(
  toolName: WebMcpActionName,
  snapshot: WebMcpExecutionSnapshot,
  platformAdapter?: WebMcpPlatformAdapter
): AdmissionCheckResult {
  const webMcpAvailability = platformAdapter
    ? platformAdapter.getSnapshot().availability
    : "AVAILABLE";

  const capabilityState: WebMcpCapabilityState = {
    phase: snapshot.phase,
    contextRevision: snapshot.contextRevision,
    webMcpAvailability,
  };

  const desiredSurface = deriveDesiredToolSurface(capabilityState);

  if (!desiredSurface.toolNames.has(toolName)) {
    return {
      admitted: false,
      failureOutput: formatToolFailure(
        toolName,
        snapshot.contextRevision,
        "INVALID_STATE",
        `Tool '${toolName}' is not available in the current War Room phase '${snapshot.phase}'.`
      ),
    };
  }

  return { admitted: true };
}

/**
 * WebMCP Pure Desired Tool Surface Derivation (WMCP-4A)
 *
 * Pure, side-effect free mapping of canonical application capability state to the
 * desired active WebMCP tool surface.
 * Follows WMCP-INV-001, WMCP-INV-016, WMCP-INV-019.
 */

import {
  WebMcpActionName,
  WebMcpCapabilityState,
  WebMcpDesiredSurface,
} from "./types";

/**
 * Locked normative state-to-tools mapping from WEBMCP-STATE-MACHINE.md:
 *
 * BOOTSTRAP       -> (None)
 * IDLE            -> search_packages, open_package_graph
 * GRAPH_READY     -> summarize_graph, calculate_blast_radius, trace_dependency_path, focus_graph_nodes, open_package_graph
 * NODE_SELECTED   -> inspect_selected_package, calculate_blast_radius, trace_dependency_path, simulate_api_changes, focus_graph_nodes
 * SIMULATION_READY-> inspect_scenario, calculate_blast_radius, trace_dependency_path, set_scenario_priority, set_scenario_exclusion, focus_graph_nodes
 * HUMAN_REVIEW    -> recalculate_scenario, generate_migration_plan, inspect_critical_paths, set_scenario_priority
 * PLAN_READY      -> inspect_migration_plan, recalculate_scenario, focus_critical_path
 */
const PHASE_TOOL_MAP: Record<string, readonly WebMcpActionName[]> = {
  BOOTSTRAP: [],
  IDLE: ["search_packages", "open_package_graph"],
  GRAPH_READY: [
    "summarize_graph",
    "calculate_blast_radius",
    "trace_dependency_path",
    "focus_graph_nodes",
    "open_package_graph",
  ],
  NODE_SELECTED: [
    "inspect_selected_package",
    "calculate_blast_radius",
    "trace_dependency_path",
    "simulate_api_changes",
    "focus_graph_nodes",
  ],
  SIMULATION_READY: [
    "inspect_scenario",
    "calculate_blast_radius",
    "trace_dependency_path",
    "set_scenario_priority",
    "set_scenario_exclusion",
    "focus_graph_nodes",
  ],
  HUMAN_REVIEW: [
    "recalculate_scenario",
    "generate_migration_plan",
    "inspect_critical_paths",
    "set_scenario_priority",
  ],
  PLAN_READY: [
    "inspect_migration_plan",
    "recalculate_scenario",
    "focus_critical_path",
  ],
};

/**
 * Derives the desired WebMCP tool surface for the given capability state.
 *
 * Guaranteed Properties:
 * - Pure and deterministic: same state always returns identical tool names.
 * - Side-effect free: 0 DOM access, 0 WebMCP calls, 0 network, 0 timers, 0 global mutation.
 * - Progressive enhancement: returns empty set if `webMcpAvailability === "UNAVAILABLE"`.
 */
export function deriveDesiredToolSurface(
  state: WebMcpCapabilityState
): WebMcpDesiredSurface {
  // If WebMCP is unavailable in the environment, the desired surface is empty
  if (state.webMcpAvailability === "UNAVAILABLE") {
    return {
      phase: state.phase,
      contextRevision: state.contextRevision,
      toolNames: new Set<WebMcpActionName>(),
    };
  }

  const allowedTools = PHASE_TOOL_MAP[state.phase] ?? [];
  return {
    phase: state.phase,
    contextRevision: state.contextRevision,
    toolNames: new Set<WebMcpActionName>(allowedTools),
  };
}

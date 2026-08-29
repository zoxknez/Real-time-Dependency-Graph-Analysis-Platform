/**
 * WebMCP Adaptive Tool Catalog & Schema Contract (WMCP-4B)
 *
 * Single authoritative static catalog for the entire canonical WebMCP tool vocabulary.
 * Defines strict JSON schemas, annotations, authority bindings, and execution readiness.
 * Follows WMCP-INV-001, WMCP-INV-004, WMCP-INV-016, WMCP-INV-017, WMCP-INV-019.
 */

import { WebMcpActionName } from "../lifecycle/types";
import {
  OPEN_PACKAGE_GRAPH_SCHEMA,
  SEARCH_PACKAGES_SCHEMA,
} from "./primitive-tools";

/**
 * Authority classifications determining which subsystem owns actual behavior.
 */
export type WebMcpToolAuthorityClassification =
  | "EXISTING_ACTION"
  | "EXISTING_READ_MODEL"
  | "EXISTING_UI_PROJECTION"
  | "FUTURE_DETERMINISTIC_CAPABILITY";

/**
 * Binding execution status for the current repository revision.
 */
export type WebMcpToolBindingStatus = "EXECUTABLE" | "DEFERRED";

/**
 * Single catalog record defining a canonical WebMCP tool.
 */
export interface WebMcpToolCatalogEntry {
  readonly name: WebMcpActionName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly untrustedContentHint: boolean;
  };
  readonly authority: string;
  readonly classification: WebMcpToolAuthorityClassification;
  readonly bindingStatus: WebMcpToolBindingStatus;
  readonly futureDependency?: string;
}

/**
 * Strict JSON Input Schemas for Adaptive Tools
 */

export const SUMMARIZE_GRAPH_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const CALCULATE_BLAST_RADIUS_SCHEMA = {
  type: "object",
  properties: {
    packageId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Optional package ID to calculate blast radius for. Defaults to root package.",
    },
    targetVersion: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      description: "Optional target version constraint to simulate upgrade impact.",
    },
  },
  additionalProperties: false,
} as const;

export const TRACE_DEPENDENCY_PATH_SCHEMA = {
  type: "object",
  properties: {
    sourcePackageId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Source package identifier in ecosystem:name format.",
    },
    targetPackageId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Target package identifier in ecosystem:name format.",
    },
    maxDepth: {
      type: "integer",
      minimum: 1,
      maximum: 6,
      description: "Maximum search depth for dependency traversal (default: 4).",
    },
  },
  required: ["sourcePackageId", "targetPackageId"],
  additionalProperties: false,
} as const;

export const FOCUS_GRAPH_NODES_SCHEMA = {
  type: "object",
  properties: {
    nodeIds: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
        maxLength: 256,
      },
      minItems: 1,
      maxItems: 50,
      description: "Array of package node IDs to highlight/focus in the visual graph.",
    },
  },
  required: ["nodeIds"],
  additionalProperties: false,
} as const;

export const INSPECT_SELECTED_PACKAGE_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const SIMULATE_API_CHANGES_SCHEMA = {
  type: "object",
  properties: {
    packageId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Optional target package ID. Defaults to currently selected package.",
    },
    proposedVersion: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      description: "Proposed version string to analyze breaking API changes against.",
    },
  },
  required: ["proposedVersion"],
  additionalProperties: false,
} as const;

export const INSPECT_SCENARIO_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const SET_SCENARIO_PRIORITY_SCHEMA = {
  type: "object",
  properties: {
    priority: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      description: "Business priority level for current simulation scenario.",
    },
  },
  required: ["priority"],
  additionalProperties: false,
} as const;

export const SET_SCENARIO_EXCLUSION_SCHEMA = {
  type: "object",
  properties: {
    packageId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Package ID to exclude or include in current scenario.",
    },
    excluded: {
      type: "boolean",
      description: "True to exclude package from upgrade scenario; false to include.",
    },
  },
  required: ["packageId", "excluded"],
  additionalProperties: false,
} as const;

export const RECALCULATE_SCENARIO_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const GENERATE_MIGRATION_PLAN_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const INSPECT_CRITICAL_PATHS_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const INSPECT_MIGRATION_PLAN_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const FOCUS_CRITICAL_PATH_SCHEMA = {
  type: "object",
  properties: {
    pathIndex: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description: "Optional 0-based index of critical migration path to visually highlight.",
    },
  },
  additionalProperties: false,
} as const;

/**
 * Authoritative Static WebMCP Tool Catalog
 */
export const WEB_MCP_TOOL_CATALOG: Readonly<Record<WebMcpActionName, WebMcpToolCatalogEntry>> = {
  search_packages: {
    name: "search_packages",
    title: "Search Packages",
    description: "Searches the package catalog by query string with optional ecosystem filtering and bounded limit.",
    inputSchema: SEARCH_PACKAGES_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.searchPackages",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  open_package_graph: {
    name: "open_package_graph",
    title: "Open Package Graph",
    description: "Opens and computes the dependency graph for a specified root package and exploration depth.",
    inputSchema: OPEN_PACKAGE_GRAPH_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.openPackageGraph",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  summarize_graph: {
    name: "summarize_graph",
    title: "Summarize Graph",
    description: "Returns summary metrics (node count, edge count, depth, root package) for the active dependency graph.",
    inputSchema: SUMMARIZE_GRAPH_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomState.activeGraph",
    classification: "EXISTING_READ_MODEL",
    bindingStatus: "EXECUTABLE",
  },
  calculate_blast_radius: {
    name: "calculate_blast_radius",
    title: "Calculate Blast Radius",
    description: "Calculates the version-aware transitive blast radius for a dependency change.",
    inputSchema: CALCULATE_BLAST_RADIUS_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "Version-aware Blast Radius Engine",
    classification: "FUTURE_DETERMINISTIC_CAPABILITY",
    bindingStatus: "DEFERRED",
    futureDependency: "WMCP-8 (Version-Aware Blast Radius Engine)",
  },
  trace_dependency_path: {
    name: "trace_dependency_path",
    title: "Trace Dependency Path",
    description: "Finds the shortest or critical dependency path between two package nodes in the active graph.",
    inputSchema: TRACE_DEPENDENCY_PATH_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.traceDependencyPath",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  focus_graph_nodes: {
    name: "focus_graph_nodes",
    title: "Focus Graph Nodes",
    description: "Updates the shared visual graph projection to focus and highlight specific package nodes.",
    inputSchema: FOCUS_GRAPH_NODES_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomProjectionStore.focusNodes",
    classification: "EXISTING_UI_PROJECTION",
    bindingStatus: "EXECUTABLE",
  },
  inspect_selected_package: {
    name: "inspect_selected_package",
    title: "Inspect Selected Package",
    description: "Inspects metadata, versions, and security advisories for the currently selected package node.",
    inputSchema: INSPECT_SELECTED_PACKAGE_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.inspectPackage",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  simulate_api_changes: {
    name: "simulate_api_changes",
    title: "Simulate API Changes",
    description: "Analyzes AST-level breaking API changes between versions of a dependency.",
    inputSchema: SIMULATE_API_CHANGES_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "AST Breaking Change Analyzer",
    classification: "FUTURE_DETERMINISTIC_CAPABILITY",
    bindingStatus: "DEFERRED",
    futureDependency: "WMCP-5 / WMCP-6 (AST Extraction & Change Engine)",
  },
  inspect_scenario: {
    name: "inspect_scenario",
    title: "Inspect Scenario",
    description: "Inspects the active simulation scenario parameters, patched versions, and conflict status.",
    inputSchema: INSPECT_SCENARIO_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomState.activeScenario",
    classification: "EXISTING_READ_MODEL",
    bindingStatus: "EXECUTABLE",
  },
  set_scenario_priority: {
    name: "set_scenario_priority",
    title: "Set Scenario Priority",
    description: "Sets the business criticality priority on the active scenario.",
    inputSchema: SET_SCENARIO_PRIORITY_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "Scenario Business Priority Engine",
    classification: "FUTURE_DETERMINISTIC_CAPABILITY",
    bindingStatus: "DEFERRED",
    futureDependency: "WMCP-7 / WMCP-10 (Scenario Priority Engine)",
  },
  set_scenario_exclusion: {
    name: "set_scenario_exclusion",
    title: "Set Scenario Exclusion",
    description: "Excludes or includes specific transitive packages in the active simulation scenario.",
    inputSchema: SET_SCENARIO_EXCLUSION_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "Scenario Exclusion Rules Engine",
    classification: "FUTURE_DETERMINISTIC_CAPABILITY",
    bindingStatus: "DEFERRED",
    futureDependency: "WMCP-7 (Scenario Exclusion Engine)",
  },
  recalculate_scenario: {
    name: "recalculate_scenario",
    title: "Recalculate Scenario",
    description: "Triggers deterministic re-evaluation of the active scenario with current human review patches.",
    inputSchema: RECALCULATE_SCENARIO_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.recalculateScenario",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  generate_migration_plan: {
    name: "generate_migration_plan",
    title: "Generate Migration Plan",
    description: "Synthesizes an ordered, deterministic step-by-step dependency migration plan.",
    inputSchema: GENERATE_MIGRATION_PLAN_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.generateMigrationPlan",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  inspect_critical_paths: {
    name: "inspect_critical_paths",
    title: "Inspect Critical Paths",
    description: "Inspects high-risk business paths and bottleneck packages under human review.",
    inputSchema: INSPECT_CRITICAL_PATHS_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "Critical Path Analysis Engine",
    classification: "FUTURE_DETERMINISTIC_CAPABILITY",
    bindingStatus: "DEFERRED",
    futureDependency: "WMCP-10 (Human Business Review Expansion)",
  },
  inspect_migration_plan: {
    name: "inspect_migration_plan",
    title: "Inspect Migration Plan",
    description: "Inspects the generated migration plan steps, verification gates, and rollout order.",
    inputSchema: INSPECT_MIGRATION_PLAN_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomState.migrationPlan",
    classification: "EXISTING_READ_MODEL",
    bindingStatus: "EXECUTABLE",
  },
  focus_critical_path: {
    name: "focus_critical_path",
    title: "Focus Critical Path",
    description: "Visually focuses and highlights the critical migration path in the graph UI.",
    inputSchema: FOCUS_CRITICAL_PATH_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "Critical Path Visual Focus Engine",
    classification: "FUTURE_DETERMINISTIC_CAPABILITY",
    bindingStatus: "DEFERRED",
    futureDependency: "WMCP-12 (Unified Critical Path Visual Focus)",
  },
};

/**
 * Returns the catalog entry for a canonical WebMCP tool.
 */
export function getToolCatalogEntry(name: WebMcpActionName): WebMcpToolCatalogEntry {
  const entry = WEB_MCP_TOOL_CATALOG[name];
  if (!entry) {
    throw new Error(`Unknown WebMCP tool: ${name}`);
  }
  return entry;
}

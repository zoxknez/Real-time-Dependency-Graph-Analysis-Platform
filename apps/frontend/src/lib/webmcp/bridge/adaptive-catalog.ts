/**
 * WebMCP Adaptive Tool Catalog & Authority Binding Matrix (WMCP-4B / WMCP-4B-R2)
 *
 * Defines the static catalog for all 16 canonical WebMCP actions, their strict JSON schemas,
 * annotations, authority bindings, and explicit schema readiness states.
 * Follows WMCP-INV-001, WMCP-INV-004, WMCP-INV-017, WMCP-INV-021, and INV-WMCP4B-SCHEMA-001.
 */

import { WebMcpActionName } from "../lifecycle/types";
import {
  SEARCH_PACKAGES_SCHEMA,
  OPEN_PACKAGE_GRAPH_SCHEMA,
} from "./primitive-tools";

export type WebMcpToolAuthorityClassification =
  | "EXISTING_ACTION"
  | "EXISTING_READ_MODEL"
  | "EXISTING_UI_PROJECTION"
  | "FUTURE_DETERMINISTIC_CAPABILITY";

export type WebMcpToolBindingStatus = "EXECUTABLE" | "DEFERRED";

export type WebMcpSchemaStatus = "FROZEN" | "PENDING_DOMAIN_CONTRACT";

export interface WebMcpFrozenToolCatalogEntry {
  readonly name: WebMcpActionName;
  readonly title: string;
  readonly description: string;
  readonly schemaStatus: "FROZEN";
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

export interface WebMcpPendingSchemaToolCatalogEntry {
  readonly name: WebMcpActionName;
  readonly title: string;
  readonly description: string;
  readonly schemaStatus: "PENDING_DOMAIN_CONTRACT";
  readonly inputSchema?: never;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly untrustedContentHint: boolean;
  };
  readonly authority: string;
  readonly classification: WebMcpToolAuthorityClassification;
  readonly bindingStatus: "DEFERRED";
  readonly futureDependency: string;
}

export type WebMcpToolCatalogEntry =
  | WebMcpFrozenToolCatalogEntry
  | WebMcpPendingSchemaToolCatalogEntry;

export const SUMMARIZE_GRAPH_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const CALCULATE_BLAST_RADIUS_SCHEMA = {
  type: "object",
  properties: {
    proposedVersion: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      description: "Proposed version string to evaluate dependency constraint exposure against.",
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
      description: "Source package identifier in the active graph.",
    },
    targetPackageId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Target package identifier to trace dependency path towards.",
    },
    maxDepth: {
      type: "integer",
      minimum: 1,
      maximum: 6,
      description: "Maximum hops to traverse when tracing paths.",
    },
  },
  required: ["sourcePackageId", "targetPackageId"],
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
    baseVersion: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      description: "Exact authoritative base version revision matching a committed Package-scope snapshot.",
    },
    proposedVersion: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      description: "Optional proposed version string for subsequent version-aware dependency constraint evaluation.",
    },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 32,
      description: "List of 1 to 32 public API patch operations to simulate.",
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["REMOVE_SYMBOL"] },
              symbolPath: { type: "string", minLength: 1, maxLength: 512 },
            },
            required: ["kind", "symbolPath"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["RENAME_SYMBOL"] },
              symbolPath: { type: "string", minLength: 1, maxLength: 512 },
              newSymbolPath: { type: "string", minLength: 1, maxLength: 512 },
            },
            required: ["kind", "symbolPath", "newSymbolPath"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["CHANGE_RETURN_TYPE"] },
              symbolPath: { type: "string", minLength: 1, maxLength: 512 },
              newReturnType: { type: "string", minLength: 1, maxLength: 512 },
            },
            required: ["kind", "symbolPath", "newReturnType"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["CHANGE_PARAMETER_TYPE"] },
              symbolPath: { type: "string", minLength: 1, maxLength: 512 },
              parameterName: { type: "string", minLength: 1, maxLength: 256 },
              newType: { type: "string", minLength: 1, maxLength: 512 },
            },
            required: ["kind", "symbolPath", "parameterName", "newType"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["ADD_REQUIRED_PARAMETER"] },
              symbolPath: { type: "string", minLength: 1, maxLength: 512 },
              parameterName: { type: "string", minLength: 1, maxLength: 256 },
              parameterType: { type: "string", minLength: 1, maxLength: 512 },
            },
            required: ["kind", "symbolPath", "parameterName", "parameterType"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["CHANGE_VISIBILITY"] },
              symbolPath: { type: "string", minLength: 1, maxLength: 512 },
              newVisibility: {
                type: "string",
                enum: ["public", "private", "protected", "internal", "crate", "super"],
              },
            },
            required: ["kind", "symbolPath", "newVisibility"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ["baseVersion", "operations"],
  additionalProperties: false,
} as const;

export const FOCUS_GRAPH_NODES_SCHEMA = {
  type: "object",
  properties: {
    nodeIds: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 20,
      description: "Array of between 1 and 20 package node IDs present in the active graph.",
    },
  },
  required: ["nodeIds"],
  additionalProperties: false,
} as const;

export const INSPECT_SCENARIO_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const RECALCULATE_SCENARIO_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const SET_SCENARIO_PRIORITY_SCHEMA = {
  type: "object",
  properties: {
    entityId: {
      type: "string",
      description: "Entity ID or package ID in the active scenario to prioritize.",
    },
    priority: {
      type: "string",
      enum: ["P0", "P1", "P2", "P3"],
      description: "Human review business priority tier (P0=Highest, P3=Lowest).",
    },
    note: {
      type: "string",
      maxLength: 240,
      description: "Optional human business review justification note (max 240 characters).",
    },
  },
  required: ["entityId", "priority"],
  additionalProperties: false,
} as const;

export const SET_SCENARIO_EXCLUSION_SCHEMA = {
  type: "object",
  properties: {
    entityId: {
      type: "string",
      description: "Entity ID or package ID in the active scenario to exclude or unexclude.",
    },
    excluded: {
      type: "boolean",
      description: "True to mark entity excluded from migration, false to include.",
    },
    reason: {
      type: "string",
      minLength: 1,
      maxLength: 240,
      description: "Mandatory justification note for exclusion (1-240 characters).",
    },
  },
  required: ["entityId", "excluded", "reason"],
  additionalProperties: false,
} as const;

export const GENERATE_MIGRATION_PLAN_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const INSPECT_CRITICAL_PATHS_SCHEMA = {
  type: "object",
  properties: {
    maxPaths: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      description: "Optional maximum number of critical migration paths to return (1-10). Defaults to 5.",
    },
  },
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
    pathId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Authoritative critical path identifier returned by inspect_critical_paths.",
    },
  },
  additionalProperties: false,
} as const;

export const ALL_CANONICAL_ACTION_NAMES: readonly WebMcpActionName[] = [
  "search_packages",
  "open_package_graph",
  "summarize_graph",
  "calculate_blast_radius",
  "trace_dependency_path",
  "focus_graph_nodes",
  "inspect_selected_package",
  "simulate_api_changes",
  "inspect_scenario",
  "set_scenario_priority",
  "set_scenario_exclusion",
  "recalculate_scenario",
  "generate_migration_plan",
  "inspect_critical_paths",
  "inspect_migration_plan",
  "focus_critical_path",
] as const;

export const WEB_MCP_TOOL_CATALOG: Record<WebMcpActionName, WebMcpToolCatalogEntry> = {
  search_packages: {
    name: "search_packages",
    title: "Search Packages",
    description: "Searches the package catalog by query string and ecosystem filter.",
    schemaStatus: "FROZEN",
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
    schemaStatus: "FROZEN",
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
    description: "Returns summary metrics (node count, root package, graph ID) for the active dependency graph.",
    schemaStatus: "FROZEN",
    inputSchema: SUMMARIZE_GRAPH_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomState.graph",
    classification: "EXISTING_READ_MODEL",
    bindingStatus: "EXECUTABLE",
  },
  calculate_blast_radius: {
    name: "calculate_blast_radius",
    title: "Calculate Blast Radius",
    description: "Calculates the deterministic version-aware dependency exposure for a proposed package version.",
    schemaStatus: "FROZEN",
    inputSchema: CALCULATE_BLAST_RADIUS_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.calculateBlastRadius",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  trace_dependency_path: {
    name: "trace_dependency_path",
    title: "Trace Dependency Path",
    description: "Finds the dependency path between two package nodes in the active graph.",
    schemaStatus: "FROZEN",
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
    schemaStatus: "FROZEN",
    inputSchema: FOCUS_GRAPH_NODES_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.focusGraphNodes",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  inspect_selected_package: {
    name: "inspect_selected_package",
    title: "Inspect Selected Package",
    description: "Inspects metadata and direct dependency links for the currently selected package node.",
    schemaStatus: "FROZEN",
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
    description: "Simulates hypothetical public API changes for the currently selected package against its committed baseline.",
    schemaStatus: "FROZEN",
    inputSchema: SIMULATE_API_CHANGES_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.createScenario -> WarRoomActions.recalculateScenario",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  inspect_scenario: {
    name: "inspect_scenario",
    title: "Inspect Scenario",
    description: "Inspects the active simulation scenario parameters and proposed versions.",
    schemaStatus: "FROZEN",
    inputSchema: INSPECT_SCENARIO_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomState.scenario",
    classification: "EXISTING_READ_MODEL",
    bindingStatus: "EXECUTABLE",
  },
  set_scenario_priority: {
    name: "set_scenario_priority",
    title: "Set Scenario Priority",
    description: "Applies business priority classification to the active simulation scenario.",
    schemaStatus: "FROZEN",
    inputSchema: SET_SCENARIO_PRIORITY_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.setScenarioPriority",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  set_scenario_exclusion: {
    name: "set_scenario_exclusion",
    title: "Set Scenario Exclusion",
    description: "Configures package exclusion rules for upgrade simulation scenarios.",
    schemaStatus: "FROZEN",
    inputSchema: SET_SCENARIO_EXCLUSION_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.setScenarioExclusion",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  recalculate_scenario: {
    name: "recalculate_scenario",
    title: "Recalculate Scenario",
    description: "Recalculates the active hypothetical API scenario after its patch or review state changed.",
    schemaStatus: "FROZEN",
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
    description: "Synthesizes an actionable migration plan from approved human reviews and analysis runs.",
    schemaStatus: "FROZEN",
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
    description: "Identifies top migration blockers and deep dependency chains.",
    schemaStatus: "FROZEN",
    inputSchema: INSPECT_CRITICAL_PATHS_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.inspectCriticalPaths",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
  inspect_migration_plan: {
    name: "inspect_migration_plan",
    title: "Inspect Migration Plan",
    description: "Inspects canonical migration plan reference metadata.",
    schemaStatus: "FROZEN",
    inputSchema: INSPECT_MIGRATION_PLAN_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    authority: "WarRoomState.plan",
    classification: "EXISTING_READ_MODEL",
    bindingStatus: "EXECUTABLE",
  },
  focus_critical_path: {
    name: "focus_critical_path",
    title: "Focus Critical Path",
    description: "Highlights the nodes and edges belonging to a critical migration path in the UI projection.",
    schemaStatus: "FROZEN",
    inputSchema: FOCUS_CRITICAL_PATH_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    authority: "WarRoomActions.focusCriticalPath",
    classification: "EXISTING_ACTION",
    bindingStatus: "EXECUTABLE",
  },
};

export function getToolCatalogEntry(name: WebMcpActionName): WebMcpToolCatalogEntry {
  const entry = WEB_MCP_TOOL_CATALOG[name];
  if (!entry) {
    throw new Error(`Unknown WebMCP tool action name: '${name}'`);
  }
  return entry;
}

/**
 * WebMCP Primitive Tool Definitions (WMCP-3B)
 *
 * Defines the two primitive tools (`search_packages` and `open_package_graph`),
 * connecting browser AI invocations to the shared `WarRoomActions` boundary,
 * `WarRoomStatePort`, and `WarRoomGraphProjectionStore`.
 */

import {
  WarRoomStatePort,
  WarRoomActions,
  WarRoomGraphProjectionStore,
} from "../../war-room";
import { WebMcpPlatformToolDefinition } from "../platform/types";
import {
  buildBudgetedOpenGraphOutput,
  buildBudgetedSearchOutput,
  formatToolFailure,
} from "./output";
import {
  validateOpenPackageGraphInput,
  validateSearchPackagesInput,
} from "./validation";

export interface CreatePrimitiveToolsContext {
  readonly statePort: WarRoomStatePort;
  readonly actions: WarRoomActions;
  readonly projectionStore: WarRoomGraphProjectionStore;
}

export const SEARCH_PACKAGES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Package name or keyword to search",
    },
    ecosystem: {
      type: "string",
      enum: ["NPM", "PY_PI", "CARGO", "MAVEN", "NU_GET", "GO"],
      description: "Optional package ecosystem filter",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 8,
      description: "Maximum number of results to return (1-8)",
    },
  },
  required: ["query"],
} as const;

export const OPEN_PACKAGE_GRAPH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rootPackageId: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      description: "Explicit canonical package identifier (e.g. npm:react@19.0.0)",
    },
    depth: {
      type: "integer",
      minimum: 1,
      maximum: 4,
      description: "Graph traversal depth limit (1-4)",
    },
  },
  required: ["rootPackageId"],
} as const;

export function createPrimitiveTools(
  context: CreatePrimitiveToolsContext
): readonly [
  WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>,
  WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>
] {
  const searchPackagesTool: WebMcpPlatformToolDefinition<
    Record<string, unknown>,
    unknown
  > = {
    name: "search_packages",
    title: "Search packages",
    description:
      "Search the package catalog by package name and optional ecosystem. Returns concise package references.",
    inputSchema: SEARCH_PACKAGES_SCHEMA,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    execute: async (input, execContext) => {
      const capturedContextRevision =
        context.statePort.getState().contextRevision;

      const validation = validateSearchPackagesInput(input);
      if (!validation.valid || !validation.value) {
        return formatToolFailure(
          "search_packages",
          capturedContextRevision,
          "INVALID_INPUT",
          validation.error || "Invalid search input"
        );
      }

      if (execContext.signal.aborted) {
        return formatToolFailure(
          "search_packages",
          capturedContextRevision,
          "CANCELLED",
          "Search execution cancelled"
        );
      }

      try {
        const actionResult = await context.actions.searchPackages(
          {
            channel: "AGENT",
            capturedContextRevision,
            signal: execContext.signal,
          },
          validation.value
        );

        const currentRevision = context.statePort.getState().contextRevision;

        if (actionResult.ok) {
          return buildBudgetedSearchOutput(
            "search_packages",
            currentRevision,
            actionResult.data.packages,
            actionResult.data.totalCount
          );
        } else {
          return formatToolFailure(
            "search_packages",
            currentRevision,
            actionResult.error.code,
            actionResult.error.message
          );
        }
      } catch {
        const currentRevision = context.statePort.getState().contextRevision;
        return formatToolFailure(
          "search_packages",
          currentRevision,
          "INTERNAL_ERROR",
          "Internal error during search execution"
        );
      }
    },
  };

  const openPackageGraphTool: WebMcpPlatformToolDefinition<
    Record<string, unknown>,
    unknown
  > = {
    name: "open_package_graph",
    title: "Open package graph",
    description:
      "Open the reverse-dependency graph for an explicit package ID in the shared War Room. Returns concise graph identity and topology count only.",
    inputSchema: OPEN_PACKAGE_GRAPH_SCHEMA,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    execute: async (input, execContext) => {
      const capturedContextRevision =
        context.statePort.getState().contextRevision;

      const validation = validateOpenPackageGraphInput(input);
      if (!validation.valid || !validation.value) {
        return formatToolFailure(
          "open_package_graph",
          capturedContextRevision,
          "INVALID_INPUT",
          validation.error || "Invalid open graph input"
        );
      }

      if (execContext.signal.aborted) {
        return formatToolFailure(
          "open_package_graph",
          capturedContextRevision,
          "CANCELLED",
          "Open graph execution cancelled"
        );
      }

      try {
        const actionResult = await context.actions.openPackageGraph(
          {
            channel: "AGENT",
            capturedContextRevision,
            signal: execContext.signal,
          },
          validation.value
        );

        const currentRevision = context.statePort.getState().contextRevision;

        if (actionResult.ok) {
          // Shared projection activation contract: activate staged projection only on successful action
          context.projectionStore.activateProjection(
            execContext.signal,
            actionResult.data.id
          );

          return buildBudgetedOpenGraphOutput(
            "open_package_graph",
            currentRevision,
            actionResult.data.id,
            actionResult.data.rootPackage,
            actionResult.data.packageIds.length
          );
        } else {
          // Discard staged projection on action failure (e.g. STALE_CONTEXT, NOT_FOUND, UNAVAILABLE)
          context.projectionStore.discardProjection(execContext.signal);

          return formatToolFailure(
            "open_package_graph",
            currentRevision,
            actionResult.error.code,
            actionResult.error.message
          );
        }
      } catch {
        context.projectionStore.discardProjection(execContext.signal);
        const currentRevision = context.statePort.getState().contextRevision;

        return formatToolFailure(
          "open_package_graph",
          currentRevision,
          "INTERNAL_ERROR",
          "Internal error during open graph execution"
        );
      }
    },
  };

  return [searchPackagesTool, openPackageGraphTool] as const;
}

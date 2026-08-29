/**
 * WebMCP Registrable Tool Surface Derivation (WMCP-4D)
 *
 * Derives the physically registrable tool surface by intersecting the logical desired
 * surface (from WMCP-4A) with the current executable and frozen tool catalog (from WMCP-4B).
 *
 * Follows INV-WMCP4D-001, INV-WMCP4D-002, and INV-WMCP4D-017.
 */

import { WebMcpActionName, WebMcpDesiredSurface } from "../lifecycle/types";
import { WEB_MCP_TOOL_CATALOG, WebMcpToolCatalogEntry } from "./adaptive-catalog";

/**
 * Computes the registrable tool surface for the current logical state.
 *
 * Pure function:
 * - Preserves phase and contextRevision from logical desired surface.
 * - Filters toolNames to only include tools that are currently EXECUTABLE with FROZEN schemas.
 * - Does not instantiate tool definitions or throw exceptions for deferred tools.
 * - Contains zero duplicate phase mapping logic.
 */
export function deriveRegistrableToolSurface(
  logicalSurface: WebMcpDesiredSurface,
  catalog: Record<WebMcpActionName, WebMcpToolCatalogEntry> = WEB_MCP_TOOL_CATALOG
): WebMcpDesiredSurface {
  const registrableToolNames = new Set<WebMcpActionName>();

  for (const toolName of logicalSurface.toolNames) {
    const entry = catalog[toolName];
    if (entry && entry.bindingStatus === "EXECUTABLE" && entry.schemaStatus === "FROZEN") {
      registrableToolNames.add(toolName);
    }
  }

  return {
    phase: logicalSurface.phase,
    contextRevision: logicalSurface.contextRevision,
    toolNames: registrableToolNames,
  };
}

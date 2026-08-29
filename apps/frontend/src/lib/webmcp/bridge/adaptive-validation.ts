/**
 * WebMCP Adaptive Tool Input Validation (WMCP-4B)
 *
 * Strict input validators for all adaptive tools.
 * Enforces bounded inputs, explicit additionalProperties rejection,
 * and exclusion of security/credential payloads.
 * Follows WMCP-INV-004, WMCP-INV-017, WMCP-INV-021.
 */

import { WebMcpActionName } from "../lifecycle/types";

export type AdaptiveValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

const FORBIDDEN_SECURITY_PROPERTIES = new Set([
  "tenantId",
  "userId",
  "organizationId",
  "token",
  "jwt",
  "auth",
  "authorization",
  "secret",
  "securityContext",
  "contextRevision",
  "channel",
  "origin",
]);

function rejectForbiddenKeys(input: Record<string, unknown>): string | null {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_SECURITY_PROPERTIES.has(key)) {
      return `Forbidden property '${key}' must not be supplied in tool input.`;
    }
  }
  return null;
}

export function validateEmptyObjectInput(
  input: unknown,
  toolName: WebMcpActionName
): AdaptiveValidationResult<Record<string, never>> {
  if (input === null || input === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: `${toolName} input must be a JSON object` };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const keys = Object.keys(obj);
  if (keys.length > 0) {
    return { ok: false, error: `${toolName} expects no arguments; unexpected property '${keys[0]}'` };
  }
  return { ok: true, value: {} };
}

export function validateTraceDependencyPathInput(
  input: unknown
): AdaptiveValidationResult<{ sourcePackageId: string; targetPackageId: string; maxDepth?: number }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "trace_dependency_path input must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const allowedKeys = new Set(["sourcePackageId", "targetPackageId", "maxDepth"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unexpected property '${key}' in trace_dependency_path input` };
    }
  }

  if (typeof obj.sourcePackageId !== "string" || obj.sourcePackageId.trim().length === 0 || obj.sourcePackageId.length > 256) {
    return { ok: false, error: "sourcePackageId must be a non-empty string <= 256 characters" };
  }

  if (typeof obj.targetPackageId !== "string" || obj.targetPackageId.trim().length === 0 || obj.targetPackageId.length > 256) {
    return { ok: false, error: "targetPackageId must be a non-empty string <= 256 characters" };
  }

  let maxDepth: number | undefined = undefined;
  if (obj.maxDepth !== undefined) {
    if (typeof obj.maxDepth !== "number" || !Number.isInteger(obj.maxDepth) || obj.maxDepth < 1 || obj.maxDepth > 6) {
      return { ok: false, error: "maxDepth must be an integer between 1 and 6" };
    }
    maxDepth = obj.maxDepth;
  }

  return {
    ok: true,
    value: {
      sourcePackageId: obj.sourcePackageId.trim(),
      targetPackageId: obj.targetPackageId.trim(),
      maxDepth,
    },
  };
}

export function validateFocusGraphNodesInput(
  input: unknown
): AdaptiveValidationResult<{ nodeIds: readonly string[] }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "focus_graph_nodes input must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const allowedKeys = new Set(["nodeIds"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unexpected property '${key}' in focus_graph_nodes input` };
    }
  }

  if (!Array.isArray(obj.nodeIds) || obj.nodeIds.length === 0 || obj.nodeIds.length > 50) {
    return { ok: false, error: "nodeIds must be an array of 1 to 50 package node IDs" };
  }

  for (const id of obj.nodeIds) {
    if (typeof id !== "string" || id.trim().length === 0 || id.length > 256) {
      return { ok: false, error: "Every nodeId must be a non-empty string <= 256 characters" };
    }
  }

  return {
    ok: true,
    value: {
      nodeIds: obj.nodeIds.map((id) => (id as string).trim()),
    },
  };
}

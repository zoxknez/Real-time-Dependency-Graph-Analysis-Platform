/**
 * WebMCP Adaptive Tool Input Validation (WMCP-4B / WMCP-4B-R2)
 *
 * Strict input validators for all adaptive tools with FROZEN schemas.
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

const VALID_VISIBILITIES = new Set<string>([
  "public",
  "private",
  "protected",
  "internal",
  "crate",
  "super",
]);

export interface RawSimulateOperation {
  readonly kind: string;
  readonly symbolPath: string;
  readonly newSymbolPath?: string;
  readonly newReturnType?: string;
  readonly parameterName?: string;
  readonly newType?: string;
  readonly parameterType?: string;
  readonly newVisibility?: string;
}

export interface ValidatedSimulateApiChangesInput {
  readonly baseVersion: string;
  readonly proposedVersion?: string;
  readonly operations: readonly RawSimulateOperation[];
}

export function validateSimulateApiChangesInput(
  input: unknown
): AdaptiveValidationResult<ValidatedSimulateApiChangesInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "simulate_api_changes input must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const allowedTopKeys = new Set(["baseVersion", "proposedVersion", "operations"]);
  for (const key of Object.keys(obj)) {
    if (!allowedTopKeys.has(key)) {
      return { ok: false, error: `Unexpected property '${key}' in simulate_api_changes input` };
    }
  }

  if (obj.baseVersion === undefined || obj.baseVersion === null) {
    return { ok: false, error: "Missing required property 'baseVersion' - an explicit baseVersion matching a committed snapshot revision is required" };
  }
  if (typeof obj.baseVersion !== "string" || obj.baseVersion.trim().length === 0 || obj.baseVersion.length > 128) {
    return { ok: false, error: "baseVersion must be a non-empty string <= 128 characters" };
  }
  const baseVersion = obj.baseVersion.trim();

  let proposedVersion: string | undefined;
  if (obj.proposedVersion !== undefined && obj.proposedVersion !== null) {
    if (typeof obj.proposedVersion !== "string" || obj.proposedVersion.trim().length === 0 || obj.proposedVersion.length > 128) {
      return { ok: false, error: "proposedVersion must be a non-empty string <= 128 characters" };
    }
    proposedVersion = obj.proposedVersion.trim();
  }

  if (!Array.isArray(obj.operations)) {
    return { ok: false, error: "operations must be an array of patch operations" };
  }

  if (obj.operations.length < 1 || obj.operations.length > 32) {
    return { ok: false, error: "operations must contain between 1 and 32 patch operations" };
  }

  const validatedOps: RawSimulateOperation[] = [];

  for (let i = 0; i < obj.operations.length; i++) {
    const op = obj.operations[i];
    if (!op || typeof op !== "object" || Array.isArray(op)) {
      return { ok: false, error: `operations[${i}] must be a JSON object` };
    }
    const opObj = op as Record<string, unknown>;
    const opSecError = rejectForbiddenKeys(opObj);
    if (opSecError) return { ok: false, error: `operations[${i}]: ${opSecError}` };

    if (typeof opObj.kind !== "string") {
      return { ok: false, error: `operations[${i}] missing required property 'kind'` };
    }

    const kind = opObj.kind;

    if (typeof opObj.symbolPath !== "string" || opObj.symbolPath.trim().length === 0 || opObj.symbolPath.length > 512) {
      return { ok: false, error: `operations[${i}] symbolPath must be a non-empty string <= 512 characters` };
    }
    const symbolPath = opObj.symbolPath.trim();

    switch (kind) {
      case "REMOVE_SYMBOL": {
        const allowed = new Set(["kind", "symbolPath"]);
        for (const k of Object.keys(opObj)) {
          if (!allowed.has(k)) {
            return { ok: false, error: `Unexpected property '${k}' in REMOVE_SYMBOL operation at index ${i}` };
          }
        }
        validatedOps.push({ kind, symbolPath });
        break;
      }

      case "RENAME_SYMBOL": {
        const allowed = new Set(["kind", "symbolPath", "newSymbolPath"]);
        for (const k of Object.keys(opObj)) {
          if (!allowed.has(k)) {
            return { ok: false, error: `Unexpected property '${k}' in RENAME_SYMBOL operation at index ${i}` };
          }
        }
        if (typeof opObj.newSymbolPath !== "string" || opObj.newSymbolPath.trim().length === 0 || opObj.newSymbolPath.length > 512) {
          return { ok: false, error: `operations[${i}] newSymbolPath must be a non-empty string <= 512 characters` };
        }
        validatedOps.push({ kind, symbolPath, newSymbolPath: opObj.newSymbolPath.trim() });
        break;
      }

      case "CHANGE_RETURN_TYPE": {
        const allowed = new Set(["kind", "symbolPath", "newReturnType"]);
        for (const k of Object.keys(opObj)) {
          if (!allowed.has(k)) {
            return { ok: false, error: `Unexpected property '${k}' in CHANGE_RETURN_TYPE operation at index ${i}` };
          }
        }
        if (typeof opObj.newReturnType !== "string" || opObj.newReturnType.trim().length === 0 || opObj.newReturnType.length > 512) {
          return { ok: false, error: `operations[${i}] newReturnType must be a non-empty string <= 512 characters` };
        }
        validatedOps.push({ kind, symbolPath, newReturnType: opObj.newReturnType.trim() });
        break;
      }

      case "CHANGE_PARAMETER_TYPE": {
        const allowed = new Set(["kind", "symbolPath", "parameterName", "newType"]);
        for (const k of Object.keys(opObj)) {
          if (!allowed.has(k)) {
            return { ok: false, error: `Unexpected property '${k}' in CHANGE_PARAMETER_TYPE operation at index ${i}` };
          }
        }
        if (typeof opObj.parameterName !== "string" || opObj.parameterName.trim().length === 0 || opObj.parameterName.length > 256) {
          return { ok: false, error: `operations[${i}] parameterName must be a non-empty string <= 256 characters` };
        }
        if (typeof opObj.newType !== "string" || opObj.newType.trim().length === 0 || opObj.newType.length > 512) {
          return { ok: false, error: `operations[${i}] newType must be a non-empty string <= 512 characters` };
        }
        validatedOps.push({
          kind,
          symbolPath,
          parameterName: opObj.parameterName.trim(),
          newType: opObj.newType.trim(),
        });
        break;
      }

      case "ADD_REQUIRED_PARAMETER": {
        const allowed = new Set(["kind", "symbolPath", "parameterName", "parameterType"]);
        for (const k of Object.keys(opObj)) {
          if (!allowed.has(k)) {
            return { ok: false, error: `Unexpected property '${k}' in ADD_REQUIRED_PARAMETER operation at index ${i}` };
          }
        }
        if (typeof opObj.parameterName !== "string" || opObj.parameterName.trim().length === 0 || opObj.parameterName.length > 256) {
          return { ok: false, error: `operations[${i}] parameterName must be a non-empty string <= 256 characters` };
        }
        if (typeof opObj.parameterType !== "string" || opObj.parameterType.trim().length === 0 || opObj.parameterType.length > 512) {
          return { ok: false, error: `operations[${i}] parameterType must be a non-empty string <= 512 characters` };
        }
        validatedOps.push({
          kind,
          symbolPath,
          parameterName: opObj.parameterName.trim(),
          parameterType: opObj.parameterType.trim(),
        });
        break;
      }

      case "CHANGE_VISIBILITY": {
        const allowed = new Set(["kind", "symbolPath", "newVisibility"]);
        for (const k of Object.keys(opObj)) {
          if (!allowed.has(k)) {
            return { ok: false, error: `Unexpected property '${k}' in CHANGE_VISIBILITY operation at index ${i}` };
          }
        }
        if (typeof opObj.newVisibility !== "string" || !VALID_VISIBILITIES.has(opObj.newVisibility.trim())) {
          return {
            ok: false,
            error: `operations[${i}] newVisibility must be one of: public, private, protected, internal, crate, super`,
          };
        }
        validatedOps.push({ kind, symbolPath, newVisibility: opObj.newVisibility.trim() });
        break;
      }

      default: {
        return {
          ok: false,
          error: `Invalid or unsupported patch operation kind '${kind}' at index ${i}. Supported kinds: REMOVE_SYMBOL, RENAME_SYMBOL, CHANGE_RETURN_TYPE, CHANGE_PARAMETER_TYPE, ADD_REQUIRED_PARAMETER, CHANGE_VISIBILITY`,
        };
      }
    }
  }

  return {
    ok: true,
    value: {
      baseVersion,
      proposedVersion,
      operations: validatedOps,
    },
  };
}

export interface ValidatedCalculateBlastRadiusInput {
  readonly proposedVersion?: string;
}

export function validateCalculateBlastRadiusInput(
  input: unknown
): AdaptiveValidationResult<ValidatedCalculateBlastRadiusInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "calculate_blast_radius input must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const allowedKeys = new Set(["proposedVersion"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unexpected property '${key}' in calculate_blast_radius input` };
    }
  }

  let proposedVersion: string | undefined;
  if (obj.proposedVersion !== undefined && obj.proposedVersion !== null) {
    if (typeof obj.proposedVersion !== "string" || obj.proposedVersion.trim().length === 0 || obj.proposedVersion.length > 128) {
      return { ok: false, error: "proposedVersion must be a non-empty string <= 128 characters" };
    }
    proposedVersion = obj.proposedVersion.trim();
  }

  return { ok: true, value: { proposedVersion } };
}

export interface ValidatedFocusGraphNodesInput {
  readonly nodeIds: readonly string[];
}

export function validateFocusGraphNodesInput(
  input: unknown
): AdaptiveValidationResult<ValidatedFocusGraphNodesInput> {
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

  if (!Array.isArray(obj.nodeIds)) {
    return { ok: false, error: "focus_graph_nodes requires a 'nodeIds' array" };
  }

  if (obj.nodeIds.length < 1 || obj.nodeIds.length > 20) {
    return { ok: false, error: `nodeIds count must be between 1 and 20, received ${obj.nodeIds.length}` };
  }

  const nodeIds: string[] = [];
  for (let i = 0; i < obj.nodeIds.length; i++) {
    const item = obj.nodeIds[i];
    if (typeof item !== "string" || item.trim().length === 0 || item.length > 256) {
      return { ok: false, error: `nodeIds[${i}] must be a non-empty string <= 256 characters` };
    }
    nodeIds.push(item.trim());
  }

  return { ok: true, value: { nodeIds } };
}

export interface ValidatedSetScenarioPriorityInput {
  readonly entityId: string;
  readonly priority: "P0" | "P1" | "P2" | "P3";
  readonly note?: string;
}

export function validateSetScenarioPriorityInput(
  input: unknown
): AdaptiveValidationResult<ValidatedSetScenarioPriorityInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "set_scenario_priority input must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const allowedKeys = new Set(["entityId", "priority", "note"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unexpected property '${key}' in set_scenario_priority input` };
    }
  }

  if (typeof obj.entityId !== "string" || obj.entityId.trim().length === 0 || obj.entityId.length > 256) {
    return { ok: false, error: "set_scenario_priority requires a non-empty string 'entityId' <= 256 characters" };
  }

  if (typeof obj.priority !== "string" || !["P0", "P1", "P2", "P3"].includes(obj.priority)) {
    return { ok: false, error: "set_scenario_priority requires 'priority' to be one of 'P0', 'P1', 'P2', 'P3'" };
  }

  let note: string | undefined;
  if (obj.note !== undefined && obj.note !== null) {
    if (typeof obj.note !== "string" || obj.note.length > 240) {
      return { ok: false, error: "note, if provided, must be a string <= 240 characters" };
    }
    note = obj.note.trim();
  }

  return {
    ok: true,
    value: {
      entityId: obj.entityId.trim(),
      priority: obj.priority as "P0" | "P1" | "P2" | "P3",
      note,
    },
  };
}

export interface ValidatedSetScenarioExclusionInput {
  readonly entityId: string;
  readonly excluded: boolean;
  readonly reason: string;
}

export function validateSetScenarioExclusionInput(
  input: unknown
): AdaptiveValidationResult<ValidatedSetScenarioExclusionInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "set_scenario_exclusion input must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const allowedKeys = new Set(["entityId", "excluded", "reason"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unexpected property '${key}' in set_scenario_exclusion input` };
    }
  }

  if (typeof obj.entityId !== "string" || obj.entityId.trim().length === 0 || obj.entityId.length > 256) {
    return { ok: false, error: "set_scenario_exclusion requires a non-empty string 'entityId' <= 256 characters" };
  }

  if (typeof obj.excluded !== "boolean") {
    return { ok: false, error: "set_scenario_exclusion requires a boolean 'excluded' property" };
  }

  if (typeof obj.reason !== "string" || obj.reason.trim().length === 0 || obj.reason.length > 240) {
    return { ok: false, error: "set_scenario_exclusion requires a non-empty string 'reason' <= 240 characters" };
  }

  return {
    ok: true,
    value: {
      entityId: obj.entityId.trim(),
      excluded: obj.excluded,
      reason: obj.reason.trim(),
    },
  };
}

export interface ValidatedInspectCriticalPathsInput {
  readonly maxPaths?: number;
}

export function validateInspectCriticalPathsInput(
  input: unknown
): AdaptiveValidationResult<ValidatedInspectCriticalPathsInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "inspect_critical_paths input must be a JSON object" };
  }
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };

  const allowedKeys = new Set(["maxPaths"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unexpected property '${key}' in inspect_critical_paths input` };
    }
  }

  let maxPaths: number | undefined;
  if (obj.maxPaths !== undefined && obj.maxPaths !== null) {
    if (typeof obj.maxPaths !== "number" || !Number.isInteger(obj.maxPaths) || obj.maxPaths < 1 || obj.maxPaths > 10) {
      return { ok: false, error: "maxPaths must be an integer between 1 and 10" };
    }
    maxPaths = obj.maxPaths;
  }

  return { ok: true, value: { maxPaths } };
}

export interface ValidatedFocusCriticalPathInput { readonly pathId: string; }
export function validateFocusCriticalPathInput(input: unknown): AdaptiveValidationResult<ValidatedFocusCriticalPathInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "focus_critical_path input must be a JSON object" };
  const obj = input as Record<string, unknown>;
  const secError = rejectForbiddenKeys(obj);
  if (secError) return { ok: false, error: secError };
  if (Object.keys(obj).some((key) => key !== "pathId")) return { ok: false, error: "focus_critical_path accepts only pathId" };
  if (typeof obj.pathId !== "string" || obj.pathId.trim().length === 0 || obj.pathId.length > 256) return { ok: false, error: "pathId must be a non-empty string <= 256 characters" };
  return { ok: true, value: { pathId: obj.pathId.trim() } };
}


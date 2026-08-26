/**
 * Pure Structural Scenario Validator
 *
 * Enforces scenario structural validity and patch operation conflict detection
 * without performing breaking-change domain analysis (Section 14, 15, 17-19).
 */

import {
  WarRoomScenario,
  ScenarioPatchOperation,
  ScenarioVisibility,
  WarRoomHumanReview,
} from "./types";
import {
  WarRoomDomainError,
  invalidInputError,
  scenarioConflictError,
} from "./errors";

export type ScenarioValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: WarRoomDomainError };

const VALID_VISIBILITIES: ReadonlySet<string> = new Set<ScenarioVisibility>([
  "public",
  "private",
  "protected",
  "internal",
  "crate",
  "super",
]);

export function validateScenario(scenario: WarRoomScenario): ScenarioValidationResult {
  if (!scenario || typeof scenario !== "object") {
    return {
      ok: false,
      error: invalidInputError("Scenario must be an object"),
    };
  }

  if (!scenario.id || scenario.id.trim() === "") {
    return {
      ok: false,
      error: invalidInputError("Scenario ID must not be empty"),
    };
  }

  if (!scenario.targetPackageId || scenario.targetPackageId.trim() === "") {
    return {
      ok: false,
      error: invalidInputError("Target package ID must not be empty"),
    };
  }

  if (!Array.isArray(scenario.patchOperations)) {
    return {
      ok: false,
      error: invalidInputError("Patch operations must be an array"),
    };
  }

  const seenOperationIds = new Set<string>();
  const symbolOperations = new Map<string, ScenarioPatchOperation[]>();

  for (const op of scenario.patchOperations) {
    if (!op || typeof op !== "object") {
      return {
        ok: false,
        error: invalidInputError("Patch operation must be an object"),
      };
    }

    if (!op.operationId || op.operationId.trim() === "") {
      return {
        ok: false,
        error: invalidInputError("Patch operation ID must not be empty"),
      };
    }

    if (seenOperationIds.has(op.operationId)) {
      return {
        ok: false,
        error: invalidInputError(
          `Duplicate patch operation ID found: ${op.operationId}`
        ),
      };
    }
    seenOperationIds.add(op.operationId);

    if (!op.symbolPath || op.symbolPath.trim() === "") {
      return {
        ok: false,
        error: invalidInputError(
          `Symbol path must not be empty in operation ${op.operationId}`
        ),
      };
    }

    switch (op.kind) {
      case "REMOVE_SYMBOL":
        break;

      case "RENAME_SYMBOL": {
        if (!op.newSymbolPath || op.newSymbolPath.trim() === "") {
          return {
            ok: false,
            error: invalidInputError(
              `New symbol path must not be empty in rename operation ${op.operationId}`
            ),
          };
        }
        if (op.symbolPath === op.newSymbolPath) {
          return {
            ok: false,
            error: invalidInputError(
              `Rename to identical path is invalid in operation ${op.operationId}`
            ),
          };
        }
        break;
      }

      case "CHANGE_RETURN_TYPE": {
        if (!op.newReturnType || op.newReturnType.trim() === "") {
          return {
            ok: false,
            error: invalidInputError(
              `New return type must not be empty in operation ${op.operationId}`
            ),
          };
        }
        break;
      }

      case "CHANGE_PARAMETER_TYPE": {
        if (!op.parameterName || op.parameterName.trim() === "") {
          return {
            ok: false,
            error: invalidInputError(
              `Parameter name must not be empty in operation ${op.operationId}`
            ),
          };
        }
        if (!op.newType || op.newType.trim() === "") {
          return {
            ok: false,
            error: invalidInputError(
              `New parameter type must not be empty in operation ${op.operationId}`
            ),
          };
        }
        break;
      }

      case "ADD_REQUIRED_PARAMETER": {
        if (!op.parameterName || op.parameterName.trim() === "") {
          return {
            ok: false,
            error: invalidInputError(
              `Parameter name must not be empty in operation ${op.operationId}`
            ),
          };
        }
        if (!op.parameterType || op.parameterType.trim() === "") {
          return {
            ok: false,
            error: invalidInputError(
              `Parameter type must not be empty in operation ${op.operationId}`
            ),
          };
        }
        break;
      }

      case "CHANGE_VISIBILITY": {
        if (!op.newVisibility || typeof op.newVisibility !== "string" || !VALID_VISIBILITIES.has(op.newVisibility.trim())) {
          return {
            ok: false,
            error: invalidInputError(
              `Invalid visibility value in operation ${op.operationId}: expected one of public, private, protected, internal, crate, super`
            ),
          };
        }
        break;
      }

      default: {
        return {
          ok: false,
          error: invalidInputError(`Unknown operation kind: ${(op as ScenarioPatchOperation).kind}`),
        };
      }
    }

    const opsForSymbol = symbolOperations.get(op.symbolPath) ?? [];
    opsForSymbol.push(op);
    symbolOperations.set(op.symbolPath, opsForSymbol);
  }

  // Conflict detection across operations on the same symbol
  for (const [symbolPath, ops] of symbolOperations.entries()) {
    const removeOps = ops.filter((o) => o.kind === "REMOVE_SYMBOL");
    if (removeOps.length > 1) {
      return {
        ok: false,
        error: scenarioConflictError(
          `Multiple REMOVE_SYMBOL operations targeting symbol ${symbolPath}`
        ),
      };
    }

    if (removeOps.length === 1 && ops.length > 1) {
      return {
        ok: false,
        error: scenarioConflictError(
          `REMOVE_SYMBOL cannot be combined with other mutations on symbol ${symbolPath}`
        ),
      };
    }

    const renameOps = ops.filter((o) => o.kind === "RENAME_SYMBOL");
    if (renameOps.length > 1) {
      return {
        ok: false,
        error: scenarioConflictError(
          `Multiple RENAME_SYMBOL operations targeting symbol ${symbolPath}`
        ),
      };
    }

    const returnTypeOps = ops.filter((o) => o.kind === "CHANGE_RETURN_TYPE");
    if (returnTypeOps.length > 1) {
      return {
        ok: false,
        error: scenarioConflictError(
          `Multiple CHANGE_RETURN_TYPE operations targeting symbol ${symbolPath}`
        ),
      };
    }

    const visibilityOps = ops.filter((o) => o.kind === "CHANGE_VISIBILITY");
    if (visibilityOps.length > 1) {
      return {
        ok: false,
        error: scenarioConflictError(
          `Multiple CHANGE_VISIBILITY operations targeting symbol ${symbolPath}`
        ),
      };
    }

    // Parameter operation conflicts & cross-kind contradictions
    const paramTypeOps = ops.filter(
      (o): o is import("./types").ChangeParameterTypeOperation =>
        o.kind === "CHANGE_PARAMETER_TYPE"
    );
    const seenParamTypeNames = new Set<string>();
    for (const p of paramTypeOps) {
      if (seenParamTypeNames.has(p.parameterName)) {
        return {
          ok: false,
          error: scenarioConflictError(
            `Duplicate CHANGE_PARAMETER_TYPE for parameter ${p.parameterName} on symbol ${symbolPath}`
          ),
        };
      }
      seenParamTypeNames.add(p.parameterName);
    }

    const addParamOps = ops.filter(
      (o): o is import("./types").AddRequiredParameterOperation =>
        o.kind === "ADD_REQUIRED_PARAMETER"
    );
    const seenAddParamNames = new Set<string>();
    for (const p of addParamOps) {
      if (seenAddParamNames.has(p.parameterName)) {
        return {
          ok: false,
          error: scenarioConflictError(
            `Duplicate ADD_REQUIRED_PARAMETER for parameter ${p.parameterName} on symbol ${symbolPath}`
          ),
        };
      }
      seenAddParamNames.add(p.parameterName);
    }

    // Cross-kind parameter contradiction check: ADD_REQUIRED_PARAMETER vs CHANGE_PARAMETER_TYPE
    for (const paramName of seenAddParamNames) {
      if (seenParamTypeNames.has(paramName)) {
        return {
          ok: false,
          error: scenarioConflictError(
            `Contradictory parameter operations: ADD_REQUIRED_PARAMETER and CHANGE_PARAMETER_TYPE both target parameter ${paramName} on symbol ${symbolPath}`
          ),
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Pure utility to filter human review bindings by a set of valid entity IDs (Section 25).
 * Forward-compatible helper for future derived invalidation.
 */
export function filterReviewBindingsByValidEntities(
  review: WarRoomHumanReview,
  validEntityIds: readonly string[]
): WarRoomHumanReview {
  const validSet = new Set(validEntityIds);
  const filteredBindings = review.bindings.filter((b) =>
    validSet.has(b.targetEntityId)
  );

  return {
    ...review,
    bindings: filteredBindings,
  };
}

/**
 * Pure Structural Scenario Validator
 *
 * Enforces scenario structural validity and patch operation conflict detection
 * without performing breaking-change domain analysis (Section 14 & 15).
 */

import {
  WarRoomScenario,
  ScenarioPatchOperation,
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

export function validateScenario(scenario: WarRoomScenario): ScenarioValidationResult {
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

  const seenOperationIds = new Set<string>();
  const symbolOperations = new Map<string, ScenarioPatchOperation[]>();

  for (const op of scenario.patchOperations) {
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

    if (op.kind === "RENAME_SYMBOL") {
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

    // Parameter operation conflicts
    const paramTypeOps = ops.filter(
      (o): o is import("./types").ChangeParameterTypeOperation =>
        o.kind === "CHANGE_PARAMETER_TYPE"
    );
    const seenParamTypes = new Set<string>();
    for (const p of paramTypeOps) {
      if (seenParamTypes.has(p.parameterName)) {
        return {
          ok: false,
          error: scenarioConflictError(
            `Duplicate CHANGE_PARAMETER_TYPE for parameter ${p.parameterName} on symbol ${symbolPath}`
          ),
        };
      }
      seenParamTypes.add(p.parameterName);
    }

    const addParamOps = ops.filter(
      (o): o is import("./types").AddRequiredParameterOperation =>
        o.kind === "ADD_REQUIRED_PARAMETER"
    );
    const seenAddParams = new Set<string>();
    for (const p of addParamOps) {
      if (seenAddParams.has(p.parameterName)) {
        return {
          ok: false,
          error: scenarioConflictError(
            `Duplicate ADD_REQUIRED_PARAMETER for parameter ${p.parameterName} on symbol ${symbolPath}`
          ),
        };
      }
      seenAddParams.add(p.parameterName);
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

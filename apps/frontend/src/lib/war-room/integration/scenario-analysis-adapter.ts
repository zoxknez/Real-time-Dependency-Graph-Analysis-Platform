/**
 * Production War Room Scenario Analysis Adapter (WMCP-7B)
 *
 * Implements WarRoomScenarioAnalysisPort backed by the production counterfactual scenario engine.
 *
 * Invariants:
 * - Exact committed baseline authority: requires explicit baseVersion or snapshot reference. Zero latest guessing.
 * - Exact patch mapping: translates canonical frontend operations to backend ScenarioPatch.
 * - Truthful affectedEntityIds: returns [] without claiming confirmed semantic downstream blast-radius.
 * - Stale-context & abort protection: honors AbortSignal and captures sourceContextRevision.
 */

import {
  WarRoomScenarioAnalysisPort,
  RecalculateScenarioInput,
} from "../application/ports";
import {
  WarRoomSecurityContext,
  WarRoomServiceResult,
} from "../application/types";
import {
  WarRoomAnalysisRef,
  WarRoomBreakingChangeDto,
  ScenarioPatchOperation,
} from "../domain/types";
import {
  createDomainError,
  notFoundError,
  invalidInputError,
} from "../domain/errors";

export interface HttpScenarioAnalysisPortConfig {
  readonly endpointUrl?: string;
  readonly fetchFn?: typeof fetch;
}

export function createHttpScenarioAnalysisPort(
  config: HttpScenarioAnalysisPortConfig = {}
): WarRoomScenarioAnalysisPort {
  const fetchFn = config.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const endpointUrl =
    config.endpointUrl ??
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ANALYSIS_ENDPOINT
      ? process.env.NEXT_PUBLIC_ANALYSIS_ENDPOINT
      : "/api/analysis/scenarios/evaluate");

  return {
    async recalculateScenario(
      _sec: WarRoomSecurityContext,
      input: RecalculateScenarioInput,
      signal?: AbortSignal
    ): Promise<WarRoomServiceResult<WarRoomAnalysisRef>> {
      if (signal?.aborted) {
        return {
          ok: false,
          error: createDomainError("CANCELLED", "Operation was cancelled"),
        };
      }

      if (!input || !input.scenario) {
        return {
          ok: false,
          error: invalidInputError("Scenario must be provided"),
        };
      }

      const { scenario, sourceContextRevision } = input;

      if (!scenario.targetPackageId || scenario.targetPackageId.trim() === "") {
        return {
          ok: false,
          error: invalidInputError("Scenario targetPackageId must not be empty"),
        };
      }

      if (!scenario.baseVersion || scenario.baseVersion.trim() === "") {
        return {
          ok: false,
          error: invalidInputError(
            "Scenario must specify an authoritative baseVersion or snapshot reference"
          ),
        };
      }

      if (!fetchFn) {
        return {
          ok: false,
          error: createDomainError(
            "UNAVAILABLE",
            "HTTP fetch transport is not available in the current environment"
          ),
        };
      }

      // Map frontend ScenarioPatchOperation array to backend ScenarioPatch JSON
      const backendOperations = scenario.patchOperations.map(mapFrontendOperationToBackend);

      const requestPayload = {
        target_package_id: scenario.targetPackageId,
        base_version: scenario.baseVersion,
        patch: {
          scenario_id: scenario.id,
          target_package_id: scenario.targetPackageId,
          operations: backendOperations,
        },
      };

      try {
        const response = await fetchFn(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestPayload),
          signal,
        });

        if (signal?.aborted) {
          return {
            ok: false,
            error: createDomainError("CANCELLED", "Operation was cancelled"),
          };
        }

        if (!response.ok) {
          let errorBody: { code?: string; message?: string } | undefined;
          try {
            errorBody = await response.json();
          } catch {
            // Non-JSON error body
          }

          const message =
            errorBody?.message ??
            `Scenario evaluation failed with HTTP status ${response.status}`;

          if (response.status === 404) {
            return { ok: false, error: notFoundError(message) };
          }
          if (response.status === 400 || response.status === 422) {
            return { ok: false, error: invalidInputError(message) };
          }
          if (response.status === 503) {
            return {
              ok: false,
              error: createDomainError("UNAVAILABLE", message),
            };
          }
          return { ok: false, error: createDomainError("INTERNAL_ERROR", message) };
        }

        const data: {
          scenario_id?: string;
          baseline_surface_hash: string;
          candidate_surface_hash: string;
          changed: boolean;
          total_breaking_changes?: number;
          returned_breaking_changes?: number;
          breaking_changes_truncated?: boolean;
          breaking_changes: Array<{
            change_type: string;
            symbol_path: string;
            description: string;
            severity?: string;
            old_signature?: string;
            new_signature?: string;
            migration_hint?: string;
          }>;
        } = await response.json();

        const breakingChanges: WarRoomBreakingChangeDto[] = (
          data.breaking_changes || []
        ).map((bc) => ({
          changeType: bc.change_type,
          symbolPath: bc.symbol_path,
          description: bc.description,
          severity: bc.severity,
          oldSignature: bc.old_signature,
          newSignature: bc.new_signature,
          migrationHint: bc.migration_hint,
        }));

        const totalCount = data.total_breaking_changes ?? breakingChanges.length;
        const returnedCount = data.returned_breaking_changes ?? breakingChanges.length;
        const isTruncated = data.breaking_changes_truncated ?? (totalCount > returnedCount);

        const analysisRef: WarRoomAnalysisRef = {
          id: `analysis-${scenario.id}-${sourceContextRevision}`,
          scenarioId: scenario.id,
          sourceContextRevision,
          affectedEntityIds: [], // Truthful: 0 speculative downstream compatibility claims
          baselineSurfaceHash: data.baseline_surface_hash,
          candidateSurfaceHash: data.candidate_surface_hash,
          changed: data.changed,
          totalBreakingChanges: totalCount,
          returnedBreakingChanges: returnedCount,
          breakingChangesTruncated: isTruncated,
          breakingChanges,
        };

        return { ok: true, data: analysisRef };
      } catch (err: unknown) {
        if (
          signal?.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return {
            ok: false,
            error: createDomainError("CANCELLED", "Operation was cancelled"),
          };
        }
        return {
          ok: false,
          error: createDomainError(
            "UNAVAILABLE",
            `Scenario analysis transport error: ${
              err instanceof Error ? err.message : String(err)
            }`
          ),
        };
      }
    },
  };
}

function mapFrontendOperationToBackend(op: ScenarioPatchOperation): Record<string, unknown> {
  switch (op.kind) {
    case "REMOVE_SYMBOL":
      return {
        kind: "REMOVE_SYMBOL",
        operation_id: op.operationId,
        symbol_path: op.symbolPath,
      };
    case "RENAME_SYMBOL":
      return {
        kind: "RENAME_SYMBOL",
        operation_id: op.operationId,
        symbol_path: op.symbolPath,
        new_symbol_path: op.newSymbolPath,
      };
    case "CHANGE_RETURN_TYPE":
      return {
        kind: "CHANGE_RETURN_TYPE",
        operation_id: op.operationId,
        symbol_path: op.symbolPath,
        new_return_type: op.newReturnType,
      };
    case "CHANGE_PARAMETER_TYPE":
      return {
        kind: "CHANGE_PARAMETER_TYPE",
        operation_id: op.operationId,
        symbol_path: op.symbolPath,
        parameter_name: op.parameterName,
        new_type: op.newType,
      };
    case "ADD_REQUIRED_PARAMETER":
      return {
        kind: "ADD_REQUIRED_PARAMETER",
        operation_id: op.operationId,
        symbol_path: op.symbolPath,
        parameter_name: op.parameterName,
        parameter_type: op.parameterType,
      };
    case "CHANGE_VISIBILITY":
      return {
        kind: "CHANGE_VISIBILITY",
        operation_id: op.operationId,
        symbol_path: op.symbolPath,
        new_visibility: op.newVisibility,
      };
  }
}

export function createProductionScenarioAnalysisPort(
  config: HttpScenarioAnalysisPortConfig = {}
): WarRoomScenarioAnalysisPort {
  return createHttpScenarioAnalysisPort(config);
}

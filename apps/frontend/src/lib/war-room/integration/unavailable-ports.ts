/**
 * Unavailable Ports Implementation
 *
 * Implements truthful UNAVAILABLE stubs for phases not implemented in WMCP-2 (WMCP-2C, Section 24).
 */

import {
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
  RecalculateScenarioInput,
  GenerateMigrationPlanInput,
} from "../application/ports";
import {
  WarRoomSecurityContext,
  WarRoomServiceResult,
} from "../application/types";
import {
  WarRoomAnalysisRef,
  WarRoomPlanRef,
} from "../domain/types";
import { createDomainError } from "../domain/errors";

export function createUnavailableScenarioAnalysisPort(): WarRoomScenarioAnalysisPort {
  return {
    async recalculateScenario(
      _sec: WarRoomSecurityContext,
      _input: RecalculateScenarioInput,
      _signal?: AbortSignal
    ): Promise<WarRoomServiceResult<WarRoomAnalysisRef>> {
      return {
        ok: false,
        error: createDomainError(
          "UNAVAILABLE",
          "Scenario analysis engine is not available in baseline environment"
        ),
      };
    },
  };
}

export function createUnavailableMigrationPlanningPort(): WarRoomMigrationPlanningPort {
  return {
    async generateMigrationPlan(
      _sec: WarRoomSecurityContext,
      _input: GenerateMigrationPlanInput,
      _signal?: AbortSignal
    ): Promise<WarRoomServiceResult<WarRoomPlanRef>> {
      return {
        ok: false,
        error: createDomainError(
          "UNAVAILABLE",
          "Migration planning engine is not available in baseline environment"
        ),
      };
    },
  };
}

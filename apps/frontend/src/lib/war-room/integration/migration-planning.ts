import {
  MigrationPlanStep,
  WarRoomPlanRef,
  HumanReviewItem,
} from "../domain/types";
import { WarRoomMigrationPlanningPort, GenerateMigrationPlanInput } from "../application/ports";
import { WarRoomSecurityContext, WarRoomServiceResult } from "../application/types";
import { createDomainError } from "../domain/errors";

export const MAX_MIGRATION_STEPS = 50;

/** Deterministic, source-fact-only planner. It never assigns business priority. */
export function createDeterministicMigrationPlanningPort(): WarRoomMigrationPlanningPort {
  return {
    async generateMigrationPlan(
      _security: WarRoomSecurityContext,
      input: GenerateMigrationPlanInput,
      signal?: AbortSignal,
    ): Promise<WarRoomServiceResult<WarRoomPlanRef>> {
      if (signal?.aborted) return { ok: false, error: createDomainError("CANCELLED", "Operation was cancelled") };
      const reviewItems = input.review.items ?? [];
      const prioritized = reviewItems.filter((item: HumanReviewItem) => item.priority && item.excluded !== true);
      const steps: MigrationPlanStep[] = [];
      const affected = new Set(input.analysis?.affectedEntityIds ?? []);
      const breakingTypes = (input.analysis?.breakingChanges ?? []).map((finding) => finding.changeType).sort();

      for (const item of prioritized) {
        if (affected.has(item.entityId)) {
          steps.push({
            stepId: `validate:${item.entityId}`,
            kind: "VALIDATE_BREAKING_CHANGE",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "Validate the deterministic breaking-change findings for this reviewed entity.",
            sourceFacts: { breakingChangeTypes: breakingTypes },
          });
        } else if (input.analysis) {
          steps.push({
            stepId: `requirement:${item.entityId}`,
            kind: "REVIEW_REQUIREMENT",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "Review the declared dependency requirement against the proposed version.",
          });
        } else {
          steps.push({
            stepId: `metadata:${item.entityId}`,
            kind: "RESOLVE_REQUIREMENT_METADATA",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "Resolve dependency requirement metadata before making a compatibility decision.",
          });
        }
      }

      steps.sort((a, b) => {
        const p = a.priority.localeCompare(b.priority);
        return p || a.entityId.localeCompare(b.entityId) || a.kind.localeCompare(b.kind);
      });
      const bounded = steps.slice(0, MAX_MIGRATION_STEPS);
      const plan: WarRoomPlanRef = {
        id: `plan:${input.scenario.id}:${input.review.id}:${input.sourceContextRevision}`,
        scenarioId: input.scenario.id,
        sourceReviewId: input.review.id,
        sourceContextRevision: input.sourceContextRevision,
        stepsTotal: steps.length,
        returnedSteps: bounded.length,
        stepsTruncated: steps.length > bounded.length,
        steps: bounded,
      };
      return { ok: true, data: plan };
    },
  };
}

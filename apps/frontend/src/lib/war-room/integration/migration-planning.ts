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
      const exposureByEntity = new Map((input.versionExposure?.dependents ?? []).map((dependent) => [dependent.dependentPackageId, dependent]));
      const availablePaths = new Map((input.criticalPaths?.paths ?? []).filter((path) => path.status === "AVAILABLE").map((path) => [path.sourceEntityId, path]));
      const breakingTypes = (input.analysis?.breakingChanges ?? []).map((finding) => finding.changeType).sort();

      if (input.scenario.baseVersion && input.scenario.proposedVersion) {
        steps.push({
          stepId: `target:${input.scenario.targetPackageId}`,
          kind: "UPGRADE_TARGET",
          entityId: input.scenario.targetPackageId,
          priority: "P0",
          rationale: `Apply the declared scenario target change ${input.scenario.baseVersion} -> ${input.scenario.proposedVersion}.`,
          sourceFacts: { breakingChangeTypes: breakingTypes },
        });
      }

      for (const item of prioritized) {
        const exposure = exposureByEntity.get(item.entityId);
        if (exposure?.status === "DECLARED_RANGE_EXPOSED") {
          steps.push({
            stepId: `range-exposed:${item.entityId}`,
            kind: "VALIDATE_RANGE_EXPOSED_DEPENDENT",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "Declared dependency range admits the proposed target version. Validate the dependent against the breaking API candidate.",
            sourceFacts: { versionExposureStatus: exposure.status, rawRequirement: exposure.rawRequirement, breakingChangeTypes: breakingTypes },
          });
        } else if (exposure?.status === "DECLARED_RANGE_BLOCKED") {
          steps.push({
            stepId: `range-blocked:${item.entityId}`,
            kind: "REVIEW_BLOCKED_DEPENDENCY_REQUIREMENT",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "The declared dependency requirement blocks the proposed target version. Review the requirement without generating a replacement.",
            sourceFacts: { versionExposureStatus: exposure.status, rawRequirement: exposure.rawRequirement },
          });
        } else if (exposure) {
          steps.push({
            stepId: `unknown:${item.entityId}`,
            kind: "RESOLVE_UNKNOWN_DEPENDENCY_REQUIREMENT",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: `Resolve dependency metadata before compatibility can be evaluated (${exposure.status}).`,
            sourceFacts: { versionExposureStatus: exposure.status, rawRequirement: exposure.rawRequirement },
          });
        } else if (availablePaths.has(item.entityId)) {
          const path = availablePaths.get(item.entityId)!;
          steps.push({
            stepId: `path:${path.pathId}`,
            kind: "VALIDATE_CRITICAL_PATH",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "Validate the real dependency path to the scenario target.",
            criticalPathHopCount: path.hopCount,
            sourceFacts: { criticalPathId: path.pathId },
          });
        } else {
          steps.push({
            stepId: `verify:${item.entityId}`,
            kind: "VERIFY_BREAKING_CHANGES",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "Verify the deterministic API findings for this reviewed entity.",
            sourceFacts: { breakingChangeTypes: breakingTypes },
          });
        }

        if (input.evidence?.status === "AVAILABLE" && input.evidence.advisoriesReturned > 0) {
          steps.push({
            stepId: `security-evidence:${item.entityId}`,
            kind: "REVIEW_SECURITY_EVIDENCE",
            entityId: item.entityId,
            priority: item.priority!,
            rationale: "Review the available OSV advisories before approving the migration decision.",
            sourceFacts: { advisoryIds: input.evidence.advisories.map((advisory) => advisory.id) },
          });
        }
      }

      steps.sort((a, b) => {
        const targetFirst = a.entityId === input.scenario.targetPackageId ? -1 : b.entityId === input.scenario.targetPackageId ? 1 : 0;
        const p = a.priority.localeCompare(b.priority);
        return targetFirst || p || (a.criticalPathHopCount ?? Number.MAX_SAFE_INTEGER) - (b.criticalPathHopCount ?? Number.MAX_SAFE_INTEGER) || a.entityId.localeCompare(b.entityId) || a.kind.localeCompare(b.kind);
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

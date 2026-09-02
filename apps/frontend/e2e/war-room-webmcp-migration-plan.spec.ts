import { test, expect } from "@playwright/test";
import { createDeterministicMigrationPlanningPort } from "../src/lib/war-room/integration/migration-planning";
import { validateFocusCriticalPathInput } from "../src/lib/webmcp/bridge/adaptive-validation";

test.describe("WMCP-11/12 final deterministic contracts", () => {
  test("classifies source-backed exposure states and omits unreviewed entities", async () => {
    const port = createDeterministicMigrationPlanningPort();
    const result = await port.generateMigrationPlan({ tenantId: "t", userId: "u" }, {
      graph: { id: "g", rootPackage: { id: "target", name: "target", ecosystem: "NPM" }, packageIds: ["target", "exposed", "blocked", "unknown"] },
      selection: { package: { id: "target", name: "target", ecosystem: "NPM" } },
      scenario: { id: "s", targetPackageId: "target", baseVersion: "1.0.0", proposedVersion: "2.0.0", patchOperations: [] },
      review: { id: "r", scenarioId: "s", bindings: [], items: [
        { entityId: "exposed", priority: "P1" }, { entityId: "blocked", priority: "P2" }, { entityId: "unknown", priority: "P3" }, { entityId: "unreviewed" },
      ] },
      analysis: { id: "a", scenarioId: "s", sourceContextRevision: 1, affectedEntityIds: [], breakingChanges: [] },
      sourceContextRevision: 1,
      versionExposure: { targetPackageId: "target", proposedVersion: "2.0.0", breakingCandidate: true, directDependentsTotal: 3, declaredRangeExposed: 1, declaredRangeBlocked: 1, unknownTotal: 1, exposedDependentIds: ["exposed"], blockedDependentIds: ["blocked"], unknownDependentIds: ["unknown"], topologicalReachabilityCount: 3, returnedDependentsCount: 3, dependentsTruncated: false, dependents: [
        { dependentPackageId: "exposed", name: "e", ecosystem: "NPM", rawRequirement: "^1", status: "DECLARED_RANGE_EXPOSED", reason: "accepted" },
        { dependentPackageId: "blocked", name: "b", ecosystem: "NPM", rawRequirement: "<2", status: "DECLARED_RANGE_BLOCKED", reason: "blocked" },
        { dependentPackageId: "unknown", name: "u", ecosystem: "NPM", status: "UNKNOWN_MISSING_REQUIREMENT", reason: "missing" },
      ] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.steps?.map((step) => step.kind)).toEqual(["UPGRADE_TARGET", "VALIDATE_RANGE_EXPOSED_DEPENDENT", "REVIEW_BLOCKED_DEPENDENCY_REQUIREMENT", "RESOLVE_UNKNOWN_DEPENDENCY_REQUIREMENT"]);
      expect(result.data.steps?.some((step) => step.entityId === "unreviewed")).toBe(false);
      expect(JSON.stringify(result.data)).not.toMatch(/confirmed broken|dependent is broken/i);
    }
  });

  test("focus path input is pathId-only and rejects injection fields", () => {
    expect(validateFocusCriticalPathInput({ pathId: "s:consumer" }).ok).toBe(true);
    expect(validateFocusCriticalPathInput({ pathId: "s:consumer", nodeIds: ["fake"] }).ok).toBe(false);
  });
});

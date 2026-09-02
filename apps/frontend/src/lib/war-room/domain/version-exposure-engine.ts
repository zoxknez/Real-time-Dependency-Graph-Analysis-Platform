/**
 * Version-Aware Dependency Exposure Engine (WMCP-8)
 *
 * Evaluates declared dependency constraints across direct dependents of a target package
 * against a proposed package version.
 *
 * Invariants:
 * - Direct-edge evaluation only; no transitive version claims.
 * - Topological reachability is strictly separated from declared range exposure.
 * - Breaking candidate composition does NOT claim confirmed downstream breakage.
 * - Deterministic ordering: sorted by dependentPackageId ascending, then rawRequirement.
 */

import { PackageEcosystem } from "./types";
import {
  VersionConstraintEngine,
  VersionConstraintStatus,
} from "./version-constraint-engine";

export type VersionAwareExposureStatus =
  | "DECLARED_RANGE_EXPOSED"
  | "DECLARED_RANGE_BLOCKED"
  | "UNKNOWN_MISSING_REQUIREMENT"
  | "UNKNOWN_UNSUPPORTED_ECOSYSTEM"
  | "UNKNOWN_INVALID_REQUIREMENT"
  | "UNKNOWN_INVALID_VERSION";

export interface DirectDependentRecord {
  readonly dependentPackageId: string;
  readonly name: string;
  readonly ecosystem: PackageEcosystem;
  readonly rawRequirement?: string;
  readonly depth?: number;
}

export interface VersionAwareDependentDetail {
  readonly dependentPackageId: string;
  readonly name: string;
  readonly ecosystem: PackageEcosystem;
  readonly rawRequirement?: string;
  readonly status: VersionAwareExposureStatus;
  readonly reason: string;
}

export interface VersionAwareExposureResult {
  readonly targetPackageId: string;
  readonly proposedVersion: string;
  readonly breakingCandidate: boolean;
  readonly directDependentsTotal: number;
  readonly declaredRangeExposed: number;
  readonly declaredRangeBlocked: number;
  readonly unknownTotal: number;
  readonly exposedDependentIds: readonly string[];
  readonly blockedDependentIds: readonly string[];
  readonly unknownDependentIds: readonly string[];
  /** Optional legacy field; omitted when no transitive authority is supplied. */
  readonly topologicalReachabilityCount?: number;
  readonly dependents: readonly VersionAwareDependentDetail[];
  readonly returnedDependentsCount: number;
  readonly dependentsTruncated: boolean;
}

export interface EvaluateExposureInput {
  readonly targetPackageId: string;
  readonly proposedVersion: string;
  readonly breakingCandidate: boolean;
  readonly directDependents: readonly DirectDependentRecord[];
  readonly topologicalReachabilityCount?: number;
  readonly maxReturnedDependents?: number;
}

export function evaluateVersionAwareExposure(
  input: EvaluateExposureInput
): VersionAwareExposureResult {
  const {
    targetPackageId,
    proposedVersion,
    breakingCandidate,
    directDependents,
    topologicalReachabilityCount,
    maxReturnedDependents = 50,
  } = input;

  const evaluatedDetails: VersionAwareDependentDetail[] = [];
  const exposedIds: string[] = [];
  const blockedIds: string[] = [];
  const unknownIds: string[] = [];

  for (const dep of directDependents) {
    const evalRes = VersionConstraintEngine.evaluate(
      dep.ecosystem,
      dep.rawRequirement,
      proposedVersion
    );

    let exposureStatus: VersionAwareExposureStatus;
    switch (evalRes.status) {
      case "SATISFIES":
        exposureStatus = "DECLARED_RANGE_EXPOSED";
        exposedIds.push(dep.dependentPackageId);
        break;
      case "DOES_NOT_SATISFY":
        exposureStatus = "DECLARED_RANGE_BLOCKED";
        blockedIds.push(dep.dependentPackageId);
        break;
      case "UNKNOWN_MISSING_REQUIREMENT":
        exposureStatus = "UNKNOWN_MISSING_REQUIREMENT";
        unknownIds.push(dep.dependentPackageId);
        break;
      case "UNSUPPORTED_ECOSYSTEM":
        exposureStatus = "UNKNOWN_UNSUPPORTED_ECOSYSTEM";
        unknownIds.push(dep.dependentPackageId);
        break;
      case "INVALID_REQUIREMENT":
        exposureStatus = "UNKNOWN_INVALID_REQUIREMENT";
        unknownIds.push(dep.dependentPackageId);
        break;
      case "INVALID_VERSION":
        exposureStatus = "UNKNOWN_INVALID_VERSION";
        unknownIds.push(dep.dependentPackageId);
        break;
    }

    evaluatedDetails.push({
      dependentPackageId: dep.dependentPackageId,
      name: dep.name,
      ecosystem: dep.ecosystem,
      rawRequirement: dep.rawRequirement,
      status: exposureStatus,
      reason: evalRes.reason,
    });
  }

  // Deterministic stable sort: dependentPackageId ascending, then rawRequirement
  evaluatedDetails.sort((a, b) => {
    const idCmp = a.dependentPackageId.localeCompare(b.dependentPackageId);
    if (idCmp !== 0) return idCmp;
    return (a.rawRequirement ?? "").localeCompare(b.rawRequirement ?? "");
  });

  exposedIds.sort((a, b) => a.localeCompare(b));
  blockedIds.sort((a, b) => a.localeCompare(b));
  unknownIds.sort((a, b) => a.localeCompare(b));

  const totalCount = evaluatedDetails.length;
  const returnedDependents = evaluatedDetails.slice(0, maxReturnedDependents);
  const truncated = totalCount > returnedDependents.length;

  return {
    targetPackageId,
    proposedVersion,
    breakingCandidate,
    directDependentsTotal: totalCount,
    declaredRangeExposed: exposedIds.length,
    declaredRangeBlocked: blockedIds.length,
    unknownTotal: unknownIds.length,
    exposedDependentIds: exposedIds,
    blockedDependentIds: blockedIds,
    unknownDependentIds: unknownIds,
    topologicalReachabilityCount,
    dependents: returnedDependents,
    returnedDependentsCount: returnedDependents.length,
    dependentsTruncated: truncated,
  };
}

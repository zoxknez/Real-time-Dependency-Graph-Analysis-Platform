/**
 * SLSA Provenance Hook
 * 
 * React hooks for SLSA provenance queries and verification.
 */

import { useQuery, useLazyQuery } from "@apollo/client";
import { useMemo, useCallback } from "react";
import {
  GET_SLSA_ASSESSMENT,
  GET_SLSA_PROVENANCE,
  VERIFY_PROVENANCE,
} from "../graphql/queries";
import type {
  SlsaBuildLevel,
  SlsaAssessmentResponse,
  SlsaProvenanceResponse,
  VerifyProvenanceResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// SLSA ASSESSMENT HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseSlsaAssessmentOptions {
  packageId: string;
  skip?: boolean;
}

export function useSlsaAssessment(options: UseSlsaAssessmentOptions) {
  const { packageId, skip } = options;

  const { data, loading, error, refetch } = useQuery<SlsaAssessmentResponse>(
    GET_SLSA_ASSESSMENT,
    {
      variables: { packageId },
      skip: skip || !packageId,
      fetchPolicy: "cache-first",
    }
  );

  const assessment = data?.slsaAssessment;

  // Check if level meets requirement
  const meetsLevel = useCallback(
    (required: SlsaBuildLevel): boolean => {
      if (!assessment) return false;
      return SlsaUtils.levelMeetsRequirement(assessment.level, required);
    },
    [assessment]
  );

  return {
    assessment,
    level: assessment?.level,
    hasProvenance: assessment?.hasProvenance ?? false,
    provenanceSigned: assessment?.provenanceSigned ?? false,
    builder: assessment?.builder,
    sourceRepo: assessment?.sourceRepo,
    recommendations: assessment?.recommendations ?? [],
    meetsLevel,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// SLSA PROVENANCE HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseSlsaProvenanceOptions {
  packageId: string;
  skip?: boolean;
}

export function useSlsaProvenance(options: UseSlsaProvenanceOptions) {
  const { packageId, skip } = options;

  const { data, loading, error, refetch } = useQuery<SlsaProvenanceResponse>(
    GET_SLSA_PROVENANCE,
    {
      variables: { packageId },
      skip: skip || !packageId,
      fetchPolicy: "cache-first",
    }
  );

  const provenance = data?.slsaProvenance;

  return {
    provenance,
    subjects: provenance?.subjects ?? [],
    builder: provenance?.builder,
    repository: provenance?.repository,
    gitRef: provenance?.gitRef,
    workflow: provenance?.workflow,
    buildMetadata: provenance?.buildMetadata,
    hasProvenance: !!provenance,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// PROVENANCE VERIFICATION HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseVerifyProvenanceOptions {
  packageId: string;
  requiredLevel?: SlsaBuildLevel;
  skip?: boolean;
}

export function useVerifyProvenance(options: UseVerifyProvenanceOptions) {
  const { packageId, requiredLevel, skip } = options;

  const { data, loading, error, refetch } = useQuery<VerifyProvenanceResponse>(
    VERIFY_PROVENANCE,
    {
      variables: { packageId, requiredLevel },
      skip: skip || !packageId,
      fetchPolicy: "cache-first",
    }
  );

  const result = data?.verifyProvenance;

  // Calculate pass rate
  const passRate = useMemo(() => {
    if (!result?.checks?.length) return null;
    const passed = result.checks.filter((c) => c.passed).length;
    return Math.round((passed / result.checks.length) * 100);
  }, [result?.checks]);

  return {
    result,
    valid: result?.valid ?? false,
    slsaLevel: result?.slsaLevel,
    checks: result?.checks ?? [],
    passedChecks: result?.checks?.filter((c) => c.passed) ?? [],
    failedChecks: result?.checks?.filter((c) => !c.passed) ?? [],
    errors: result?.errors ?? [],
    warnings: result?.warnings ?? [],
    passRate,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// LAZY SLSA HOOKS
// ═══════════════════════════════════════════════════════════════

export function useLazySlsaAssessment() {
  const [assess, { data, loading, error }] = useLazyQuery<SlsaAssessmentResponse>(
    GET_SLSA_ASSESSMENT,
    { fetchPolicy: "cache-first" }
  );

  const assessPackage = useCallback(
    (packageId: string) => {
      return assess({ variables: { packageId } });
    },
    [assess]
  );

  return {
    assessPackage,
    assessment: data?.slsaAssessment,
    loading,
    error,
  };
}

export function useLazyVerifyProvenance() {
  const [verify, { data, loading, error }] = useLazyQuery<VerifyProvenanceResponse>(
    VERIFY_PROVENANCE,
    { fetchPolicy: "cache-first" }
  );

  const verifyPackage = useCallback(
    (packageId: string, requiredLevel?: SlsaBuildLevel) => {
      return verify({ variables: { packageId, requiredLevel } });
    },
    [verify]
  );

  return {
    verifyPackage,
    result: data?.verifyProvenance,
    loading,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════
// SLSA UTILITIES
// ═══════════════════════════════════════════════════════════════

export const SlsaUtils = {
  /**
   * SLSA level order for comparison
   */
  levelOrder: { L0: 0, L1: 1, L2: 2, L3: 3 } as const,

  /**
   * Check if a level meets the required level
   */
  levelMeetsRequirement(
    actual: SlsaBuildLevel,
    required: SlsaBuildLevel
  ): boolean {
    return this.levelOrder[actual] >= this.levelOrder[required];
  },

  /**
   * Get display name for SLSA level
   */
  getLevelDisplayName(level: SlsaBuildLevel): string {
    const names: Record<SlsaBuildLevel, string> = {
      L0: "Level 0 - No SLSA",
      L1: "Level 1 - Provenance Exists",
      L2: "Level 2 - Hosted Build Platform",
      L3: "Level 3 - Hardened Builds",
    };
    return names[level] ?? level;
  },

  /**
   * Get short display name for SLSA level
   */
  getLevelShortName(level: SlsaBuildLevel): string {
    return `SLSA ${level}`;
  },

  /**
   * Get description for SLSA level
   */
  getLevelDescription(level: SlsaBuildLevel): string {
    const descriptions: Record<SlsaBuildLevel, string> = {
      L0: "No provenance guarantees",
      L1: "Build attestation available",
      L2: "Signed provenance from hosted service",
      L3: "Isolated ephemeral environment, non-falsifiable provenance",
    };
    return descriptions[level] ?? "";
  },

  /**
   * Get requirements for SLSA level
   */
  getLevelRequirements(level: SlsaBuildLevel): string[] {
    const requirements: Record<SlsaBuildLevel, string[]> = {
      L0: [],
      L1: [
        "Provenance exists",
        "Provenance is authentic",
        "Build process documented",
      ],
      L2: [
        "All L1 requirements",
        "Hosted build service",
        "Signed provenance",
        "Build service generates provenance",
      ],
      L3: [
        "All L2 requirements",
        "Isolated build environment",
        "Ephemeral environment",
        "Non-falsifiable provenance",
        "Hardened builds",
      ],
    };
    return requirements[level] ?? [];
  },

  /**
   * Get color for SLSA level
   */
  getLevelColor(level: SlsaBuildLevel): string {
    const colors: Record<SlsaBuildLevel, string> = {
      L0: "gray",
      L1: "yellow",
      L2: "blue",
      L3: "green",
    };
    return colors[level] ?? "gray";
  },

  /**
   * Get badge variant for SLSA level
   */
  getLevelBadgeVariant(
    level: SlsaBuildLevel
  ): "default" | "secondary" | "success" | "warning" | "destructive" {
    const variants: Record<SlsaBuildLevel, "default" | "secondary" | "success" | "warning" | "destructive"> = {
      L0: "destructive",
      L1: "warning",
      L2: "secondary",
      L3: "success",
    };
    return variants[level] ?? "default";
  },

  /**
   * Calculate aggregate SLSA level from multiple packages
   */
  aggregateLevel(levels: SlsaBuildLevel[]): SlsaBuildLevel {
    if (levels.length === 0) return "L0";
    return levels.reduce((min, level) =>
      this.levelOrder[level] < this.levelOrder[min] ? level : min
    );
  },

  /**
   * Get improvement recommendations for a level
   */
  getImprovementRecommendations(level: SlsaBuildLevel): string[] {
    const recommendations: Record<SlsaBuildLevel, string[]> = {
      L0: [
        "Add build provenance generation to your CI/CD pipeline",
        "Document your build process",
        "Consider using GitHub Actions or similar for reproducible builds",
      ],
      L1: [
        "Move to a hosted build service (GitHub Actions, GitLab CI, etc.)",
        "Enable provenance signing",
        "Ensure build service generates provenance automatically",
      ],
      L2: [
        "Enable isolated build environments",
        "Use ephemeral build runners",
        "Implement hermetic builds",
        "Enable non-falsifiable provenance",
      ],
      L3: [
        "Maintain current security posture",
        "Consider additional supply chain security measures",
      ],
    };
    return recommendations[level] ?? [];
  },
};

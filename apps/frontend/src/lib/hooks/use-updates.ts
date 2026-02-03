/**
 * Update Recommendations Hook
 * 
 * React hooks for querying dependency update recommendations
 * with security-based prioritization.
 */

import { useQuery, useLazyQuery } from "@apollo/client";
import { useMemo, useCallback } from "react";
import { GET_UPDATE_RECOMMENDATIONS } from "../graphql/queries";
import type {
  UpdateUrgency,
  UpdateReason,
  UpdateRecommendation,
  UpdateRecommendationsResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// UPDATE RECOMMENDATIONS HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseUpdateRecommendationsOptions {
  skip?: boolean;
  urgencyFilter?: UpdateUrgency[];
  reasonFilter?: UpdateReason[];
}

export function useUpdateRecommendations(
  packageId: string,
  options: UseUpdateRecommendationsOptions = {}
) {
  const { skip, urgencyFilter, reasonFilter } = options;

  const { data, loading, error, refetch } = useQuery<UpdateRecommendationsResponse>(
    GET_UPDATE_RECOMMENDATIONS,
    {
      variables: { packageId },
      skip: skip || !packageId,
    }
  );

  const summary = data?.updateRecommendations;

  const allRecommendations = useMemo(
    () => summary?.recommendations ?? [],
    [summary?.recommendations]
  );

  // Apply filters
  const recommendations = useMemo(() => {
    let filtered = allRecommendations;

    if (urgencyFilter && urgencyFilter.length > 0) {
      filtered = filtered.filter((r: UpdateRecommendation) => urgencyFilter.includes(r.urgency));
    }

    if (reasonFilter && reasonFilter.length > 0) {
      filtered = filtered.filter((r: UpdateRecommendation) =>
        r.reasons.some((reason: UpdateReason) => reasonFilter.includes(reason))
      );
    }

    return filtered;
  }, [allRecommendations, urgencyFilter, reasonFilter]);

  // Group by urgency
  const byUrgency = useMemo(() => {
    const grouped: Record<UpdateUrgency, UpdateRecommendation[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
      OPTIONAL: [],
    };
    for (const rec of recommendations) {
      grouped[rec.urgency].push(rec);
    }
    return grouped;
  }, [recommendations]);

  // Count by urgency
  const urgencyCounts = useMemo(
    () => ({
      critical: byUrgency.CRITICAL.length,
      high: byUrgency.HIGH.length,
      medium: byUrgency.MEDIUM.length,
      low: byUrgency.LOW.length,
      optional: byUrgency.OPTIONAL.length,
      total: recommendations.length,
    }),
    [byUrgency, recommendations.length]
  );

  // Security updates only
  const securityUpdates = useMemo(
    () => recommendations.filter((r: UpdateRecommendation) =>
      r.reasons.includes("SECURITY_VULNERABILITY")
    ),
    [recommendations]
  );

  // Breaking changes
  const breakingChanges = useMemo(
    () => recommendations.filter((r: UpdateRecommendation) => r.breakingChanges),
    [recommendations]
  );

  return {
    recommendations,
    allRecommendations,
    summary,
    byUrgency,
    urgencyCounts,
    securityUpdates,
    breakingChanges,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// LAZY UPDATE RECOMMENDATIONS HOOK
// ═══════════════════════════════════════════════════════════════

export function useLazyUpdateRecommendations() {
  const [query, { data, loading, error }] = useLazyQuery<UpdateRecommendationsResponse>(
    GET_UPDATE_RECOMMENDATIONS,
    { fetchPolicy: "network-only" }
  );

  const getRecommendations = useCallback(
    (packageId: string) => query({ variables: { packageId } }),
    [query]
  );

  return {
    getRecommendations,
    recommendations: data?.updateRecommendations?.recommendations ?? [],
    summary: data?.updateRecommendations,
    loading,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════
// BATCH UPDATE RECOMMENDATIONS HOOK
// ═══════════════════════════════════════════════════════════════

export function useBatchUpdateRecommendations(packageIds: string[]) {
  // This hook would batch multiple queries in production
  // For now, we'll use the first package ID as a demo
  const primaryId = packageIds[0] ?? "";

  const result = useUpdateRecommendations(primaryId, {
    skip: packageIds.length === 0,
  });

  return {
    ...result,
    packageIds,
  };
}

// ═══════════════════════════════════════════════════════════════
// UPDATE UTILITIES
// ═══════════════════════════════════════════════════════════════

export const UpdateUtils = {
  /**
   * Get display name for urgency level
   */
  getUrgencyDisplayName(urgency: UpdateUrgency): string {
    const names: Record<UpdateUrgency, string> = {
      CRITICAL: "Critical",
      HIGH: "High",
      MEDIUM: "Medium",
      LOW: "Low",
      OPTIONAL: "Optional",
    };
    return names[urgency] ?? urgency;
  },

  /**
   * Get color for urgency level
   */
  getUrgencyColor(urgency: UpdateUrgency): string {
    const colors: Record<UpdateUrgency, string> = {
      CRITICAL: "red",
      HIGH: "orange",
      MEDIUM: "yellow",
      LOW: "blue",
      OPTIONAL: "gray",
    };
    return colors[urgency] ?? "gray";
  },

  /**
   * Get priority score for urgency (lower is more urgent)
   */
  getUrgencyPriority(urgency: UpdateUrgency): number {
    const priorities: Record<UpdateUrgency, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      OPTIONAL: 4,
    };
    return priorities[urgency] ?? 99;
  },

  /**
   * Get display name for update reason
   */
  getReasonDisplayName(reason: UpdateReason): string {
    const names: Record<UpdateReason, string> = {
      SECURITY_VULNERABILITY: "Security Fix",
      DEPRECATED_VERSION: "Deprecated",
      END_OF_LIFE: "End of Life",
      LICENSE_CHANGE: "License Change",
      MAJOR_BUG_FIX: "Bug Fix",
      PERFORMANCE_IMPROVEMENT: "Performance",
      NEW_FEATURES: "New Features",
      MAINTENANCE_UPDATE: "Maintenance",
    };
    return names[reason] ?? reason;
  },

  /**
   * Get icon for update reason
   */
  getReasonIcon(reason: UpdateReason): string {
    const icons: Record<UpdateReason, string> = {
      SECURITY_VULNERABILITY: "🔒",
      DEPRECATED_VERSION: "⚠️",
      END_OF_LIFE: "⛔",
      LICENSE_CHANGE: "📄",
      MAJOR_BUG_FIX: "🐛",
      PERFORMANCE_IMPROVEMENT: "⚡",
      NEW_FEATURES: "✨",
      MAINTENANCE_UPDATE: "🔧",
    };
    return icons[reason] ?? "📦";
  },

  /**
   * Get description for update reason
   */
  getReasonDescription(reason: UpdateReason): string {
    const descriptions: Record<UpdateReason, string> = {
      SECURITY_VULNERABILITY: "Contains security vulnerability patches",
      DEPRECATED_VERSION: "Current version is deprecated",
      END_OF_LIFE: "Current version is no longer supported",
      LICENSE_CHANGE: "License terms have changed",
      MAJOR_BUG_FIX: "Contains important bug fixes",
      PERFORMANCE_IMPROVEMENT: "Includes performance optimizations",
      NEW_FEATURES: "Introduces new functionality",
      MAINTENANCE_UPDATE: "General maintenance update",
    };
    return descriptions[reason] ?? "";
  },

  /**
   * Sort recommendations by priority
   */
  sortByPriority(recommendations: UpdateRecommendation[]): UpdateRecommendation[] {
    return [...recommendations].sort((a, b) => {
      // First by urgency
      const urgencyDiff =
        this.getUrgencyPriority(a.urgency) - this.getUrgencyPriority(b.urgency);
      if (urgencyDiff !== 0) return urgencyDiff;

      // Then by security fixes first
      const aHasSecurity = a.reasons.includes("SECURITY_VULNERABILITY");
      const bHasSecurity = b.reasons.includes("SECURITY_VULNERABILITY");
      if (aHasSecurity !== bHasSecurity) return aHasSecurity ? -1 : 1;

      // Then by number of fixed vulnerabilities
      return (b.vulnerabilitiesFixed ?? 0) - (a.vulnerabilitiesFixed ?? 0);
    });
  },

  /**
   * Filter security-related updates
   */
  filterSecurityUpdates(
    recommendations: UpdateRecommendation[]
  ): UpdateRecommendation[] {
    return recommendations.filter(
      (r) =>
        r.reasons.includes("SECURITY_VULNERABILITY") ||
        r.reasons.includes("END_OF_LIFE") ||
        (r.vulnerabilitiesFixed && r.vulnerabilitiesFixed > 0)
    );
  },

  /**
   * Calculate total fixed vulnerabilities
   */
  getTotalFixedVulnerabilities(recommendations: UpdateRecommendation[]): number {
    return recommendations.reduce(
      (sum, r) => sum + (r.vulnerabilitiesFixed ?? 0),
      0
    );
  },

  /**
   * Get breaking change summary
   */
  getBreakingChangeSummary(recommendations: UpdateRecommendation[]): {
    count: number;
    packages: string[];
  } {
    const breaking = recommendations.filter((r) => r.breakingChanges);
    return {
      count: breaking.length,
      packages: breaking.map((r) => r.packageName),
    };
  },

  /**
   * Format version change
   */
  formatVersionChange(current: string, recommended: string): string {
    return `${current} → ${recommended}`;
  },

  /**
   * Check if update is major version bump
   */
  isMajorUpdate(currentVersion: string, recommendedVersion: string): boolean {
    const currParts = currentVersion.split(".");
    const recParts = recommendedVersion.split(".");
    const currentMajor = parseInt(currParts[0] ?? "0", 10);
    const recommendedMajor = parseInt(recParts[0] ?? "0", 10);
    return recommendedMajor > currentMajor;
  },

  /**
   * Get semver update type
   */
  getUpdateType(
    currentVersion: string,
    recommendedVersion: string
  ): "major" | "minor" | "patch" | "unknown" {
    try {
      const currParts = currentVersion.split(".").map((n) => parseInt(n, 10));
      const recParts = recommendedVersion.split(".").map((n) => parseInt(n, 10));

      const currMajor = currParts[0] ?? 0;
      const currMinor = currParts[1] ?? 0;
      const currPatch = currParts[2] ?? 0;
      const recMajor = recParts[0] ?? 0;
      const recMinor = recParts[1] ?? 0;
      const recPatch = recParts[2] ?? 0;

      if (recMajor > currMajor) return "major";
      if (recMinor > currMinor) return "minor";
      if (recPatch > currPatch) return "patch";
      return "unknown";
    } catch {
      return "unknown";
    }
  },

  /**
   * Generate update command for package manager
   */
  generateUpdateCommand(
    recommendations: UpdateRecommendation[],
    packageManager: "npm" | "yarn" | "pnpm" | "cargo" = "npm"
  ): string {
    const packages = recommendations.map(
      (r) => `${r.packageName}@${r.recommendedVersion}`
    );

    switch (packageManager) {
      case "npm":
        return `npm install ${packages.join(" ")}`;
      case "yarn":
        return `yarn add ${packages.join(" ")}`;
      case "pnpm":
        return `pnpm add ${packages.join(" ")}`;
      case "cargo":
        return packages
          .map((p) => {
            const parts = p.split("@");
            return `cargo add ${parts[0]}@${parts[1]}`;
          })
          .join("\n");
      default:
        return packages.join("\n");
    }
  },
};

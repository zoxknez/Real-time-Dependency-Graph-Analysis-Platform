/**
 * Policy Engine Hook
 * 
 * React hooks for policy evaluation and management.
 */

import { useQuery, useLazyQuery } from "@apollo/client";
import { useMemo, useCallback } from "react";
import {
  GET_POLICY_SETS,
  EVALUATE_POLICY,
} from "../graphql/queries";
import type {
  PolicyResult,
  PolicySeverity,
  PolicyCategory,
  PolicySet,
  PolicyRule,
  PolicyEvaluationResult,
  RuleEvaluationResult,
  PolicyEvaluationInput,
  PolicySetsResponse,
  EvaluatePolicyResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// POLICY SETS HOOK
// ═══════════════════════════════════════════════════════════════

export interface UsePolicySetsOptions {
  skip?: boolean;
}

export function usePolicySets(options: UsePolicySetsOptions = {}) {
  const { skip } = options;

  const { data, loading, error, refetch } = useQuery<PolicySetsResponse>(
    GET_POLICY_SETS,
    {
      skip,
      fetchPolicy: "cache-first",
    }
  );

  const policySets = useMemo(() => data?.policySets ?? [], [data?.policySets]);

  // Get policy by ID
  const getPolicyById = useCallback(
    (id: string): PolicySet | undefined => {
      return policySets.find((p) => p.id === id);
    },
    [policySets]
  );

  // Get rules by category
  const getRulesByCategory = useCallback(
    (policyId: string, category: PolicyCategory): PolicyRule[] => {
      const policy = getPolicyById(policyId);
      return policy?.rules.filter((r) => r.category === category) ?? [];
    },
    [getPolicyById]
  );

  return {
    policySets,
    policyCount: policySets.length,
    getPolicyById,
    getRulesByCategory,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// POLICY EVALUATION HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseEvaluatePolicyOptions {
  packageId: string;
  policySetId?: string;
  skip?: boolean;
}

export function useEvaluatePolicy(options: UseEvaluatePolicyOptions) {
  const { packageId, policySetId, skip } = options;

  const { data, loading, error, refetch } = useQuery<EvaluatePolicyResponse>(
    EVALUATE_POLICY,
    {
      variables: {
        input: {
          packageId,
          policySetId,
          useDefaultIfNotSpecified: !policySetId,
        } as PolicyEvaluationInput,
      },
      skip: skip || !packageId,
      fetchPolicy: "cache-first",
    }
  );

  const result = data?.evaluatePolicy;

  // Group results by category
  const resultsByCategory = useMemo(() => {
    if (!result?.ruleResults) return {};
    const grouped: Record<PolicyCategory, RuleEvaluationResult[]> = {
      LICENSE: [],
      SECURITY: [],
      SUPPLY_CHAIN: [],
      QUALITY: [],
      COMPLIANCE: [],
      CUSTOM: [],
    };
    // Note: We don't have category on RuleEvaluationResult, so we'd need to enhance this
    // For now, just return the results
    return grouped;
  }, [result?.ruleResults]);

  // Get only failed or warning results
  const issues = useMemo(() => {
    return (
      result?.ruleResults?.filter(
        (r) => r.result === "FAIL" || r.result === "WARN"
      ) ?? []
    );
  }, [result?.ruleResults]);

  // Get blocking failures
  const blockingIssues = useMemo(() => {
    return result?.ruleResults?.filter((r) => r.result === "FAIL" && r.blocking) ?? [];
  }, [result?.ruleResults]);

  return {
    result,
    overallResult: result?.overallResult,
    ruleResults: result?.ruleResults ?? [],
    passedCount: result?.passedCount ?? 0,
    failedCount: result?.failedCount ?? 0,
    warningCount: result?.warningCount ?? 0,
    blockingFailures: result?.blockingFailures ?? 0,
    issues,
    blockingIssues,
    resultsByCategory,
    isCompliant: result?.overallResult === "PASS",
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// LAZY POLICY HOOKS
// ═══════════════════════════════════════════════════════════════

export function useLazyEvaluatePolicy() {
  const [evaluate, { data, loading, error }] = useLazyQuery<EvaluatePolicyResponse>(
    EVALUATE_POLICY,
    { fetchPolicy: "network-only" }
  );

  const evaluatePackage = useCallback(
    (packageId: string, policySetId?: string) => {
      return evaluate({
        variables: {
          input: {
            packageId,
            policySetId,
            useDefaultIfNotSpecified: !policySetId,
          },
        },
      });
    },
    [evaluate]
  );

  return {
    evaluatePackage,
    result: data?.evaluatePolicy,
    loading,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════
// POLICY UTILITIES
// ═══════════════════════════════════════════════════════════════

export const PolicyUtils = {
  /**
   * Get display name for policy result
   */
  getResultDisplayName(result: PolicyResult): string {
    const names: Record<PolicyResult, string> = {
      PASS: "Passed",
      FAIL: "Failed",
      WARN: "Warning",
      SKIP: "Skipped",
    };
    return names[result] ?? result;
  },

  /**
   * Get color for policy result
   */
  getResultColor(result: PolicyResult): string {
    const colors: Record<PolicyResult, string> = {
      PASS: "green",
      FAIL: "red",
      WARN: "yellow",
      SKIP: "gray",
    };
    return colors[result] ?? "gray";
  },

  /**
   * Get icon for policy result
   */
  getResultIcon(result: PolicyResult): string {
    const icons: Record<PolicyResult, string> = {
      PASS: "✓",
      FAIL: "✗",
      WARN: "⚠",
      SKIP: "○",
    };
    return icons[result] ?? "?";
  },

  /**
   * Get display name for severity
   */
  getSeverityDisplayName(severity: PolicySeverity): string {
    const names: Record<PolicySeverity, string> = {
      INFO: "Info",
      LOW: "Low",
      MEDIUM: "Medium",
      HIGH: "High",
      CRITICAL: "Critical",
    };
    return names[severity] ?? severity;
  },

  /**
   * Get color for severity
   */
  getSeverityColor(severity: PolicySeverity): string {
    const colors: Record<PolicySeverity, string> = {
      INFO: "blue",
      LOW: "green",
      MEDIUM: "yellow",
      HIGH: "orange",
      CRITICAL: "red",
    };
    return colors[severity] ?? "gray";
  },

  /**
   * Get display name for category
   */
  getCategoryDisplayName(category: PolicyCategory): string {
    const names: Record<PolicyCategory, string> = {
      LICENSE: "License",
      SECURITY: "Security",
      SUPPLY_CHAIN: "Supply Chain",
      QUALITY: "Quality",
      COMPLIANCE: "Compliance",
      CUSTOM: "Custom",
    };
    return names[category] ?? category;
  },

  /**
   * Get icon for category
   */
  getCategoryIcon(category: PolicyCategory): string {
    const icons: Record<PolicyCategory, string> = {
      LICENSE: "📜",
      SECURITY: "🔒",
      SUPPLY_CHAIN: "🔗",
      QUALITY: "✨",
      COMPLIANCE: "📋",
      CUSTOM: "🔧",
    };
    return icons[category] ?? "📁";
  },

  /**
   * Sort rules by severity (critical first)
   */
  sortBySeverity(rules: PolicyRule[]): PolicyRule[] {
    const order: Record<PolicySeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };
    return [...rules].sort((a, b) => order[a.severity] - order[b.severity]);
  },

  /**
   * Sort results by status (failures first)
   */
  sortByResult(results: RuleEvaluationResult[]): RuleEvaluationResult[] {
    const order: Record<PolicyResult, number> = {
      FAIL: 0,
      WARN: 1,
      PASS: 2,
      SKIP: 3,
    };
    return [...results].sort((a, b) => order[a.result] - order[b.result]);
  },

  /**
   * Calculate compliance score (0-100)
   */
  calculateComplianceScore(result: PolicyEvaluationResult): number {
    const total = result.passedCount + result.failedCount + result.warningCount;
    if (total === 0) return 100;
    // Failures count double against score
    const score = (result.passedCount / total) * 100 - (result.failedCount / total) * 50;
    return Math.max(0, Math.round(score));
  },

  /**
   * Get compliance grade
   */
  getComplianceGrade(score: number): string {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  },
};

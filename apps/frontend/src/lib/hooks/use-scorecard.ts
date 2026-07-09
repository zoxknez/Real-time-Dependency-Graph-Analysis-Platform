/**
 * OpenSSF Scorecard Hooks
 * 
 * React hooks for fetching and displaying OpenSSF Scorecard
 * results with 18+ security checks.
 */

import { useQuery, useLazyQuery } from "@apollo/client/react";
import { useMemo } from "react";
import { GET_SCORECARD, GET_SCORECARD_SUMMARY } from "../graphql/queries";
import type {
  ScorecardResult,
  ScorecardSummary,
  ScorecardCheck,
  RiskLevel,
  RiskCategory,
  GetScorecardResponse,
  GetScorecardSummaryResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface UseScorecardResult {
  scorecard: ScorecardResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  passingChecks: ScorecardCheck[];
  failingChecks: ScorecardCheck[];
  riskLevel: RiskLevel;
  gradeLabel: string;
  gradeColor: string;
}

export interface UseScorecardSummaryResult {
  summary: ScorecardSummary | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface CategoryBreakdown {
  category: RiskCategory;
  checks: ScorecardCheck[];
  avgScore: number;
  passCount: number;
  failCount: number;
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch full scorecard for a target (repository or package)
 */
export function useScorecard(target: string): UseScorecardResult {
  const { data, loading, error, refetch } = useQuery<
    GetScorecardResponse,
    { target: string }
  >(GET_SCORECARD, {
    variables: { target },
    skip: !target,
  });

  const scorecard = data?.scorecard ?? null;

  const { passingChecks, failingChecks, riskLevel } = useMemo(() => {
    if (!scorecard) {
      return {
        passingChecks: [],
        failingChecks: [],
        riskLevel: "CRITICAL" as RiskLevel,
      };
    }

    const passing = scorecard.checks.filter((c) => c.score >= 5);
    const failing = scorecard.checks.filter((c) => c.score < 5);
    const risk = getAggregateRiskLevel(scorecard.aggregateScore);

    return {
      passingChecks: passing,
      failingChecks: failing,
      riskLevel: risk,
    };
  }, [scorecard]);

  const { gradeLabel, gradeColor } = getGradeInfo(scorecard?.aggregateScore ?? 0);

  return {
    scorecard,
    loading,
    error: error ?? null,
    refetch,
    passingChecks,
    failingChecks,
    riskLevel,
    gradeLabel,
    gradeColor,
  };
}

/**
 * Fetch scorecard summary (for list views)
 */
export function useScorecardSummary(target: string): UseScorecardSummaryResult {
  const { data, loading, error, refetch } = useQuery<
    GetScorecardSummaryResponse,
    { target: string }
  >(GET_SCORECARD_SUMMARY, {
    variables: { target },
    skip: !target,
  });

  return {
    summary: data?.scorecardSummary ?? null,
    loading,
    error: error ?? null,
    refetch,
  };
}

/**
 * Lazy scorecard fetch (for on-demand loading)
 */
export function useLazyScorecard() {
  const [fetch, { data, loading, error }] = useLazyQuery<
    GetScorecardResponse,
    { target: string }
  >(GET_SCORECARD);

  return {
    fetch: (target: string) => fetch({ variables: { target } }),
    scorecard: data?.scorecard ?? null,
    loading,
    error: error ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get risk level from aggregate score
 */
export function getAggregateRiskLevel(score: number): RiskLevel {
  if (score >= 8) return "LOW";
  if (score >= 6) return "MEDIUM";
  if (score >= 4) return "HIGH";
  return "CRITICAL";
}

/**
 * Get letter grade and color from score
 */
export function getGradeInfo(score: number): { gradeLabel: string; gradeColor: string } {
  if (score >= 9) return { gradeLabel: "A+", gradeColor: "#22c55e" };
  if (score >= 8) return { gradeLabel: "A", gradeColor: "#22c55e" };
  if (score >= 7) return { gradeLabel: "B", gradeColor: "#84cc16" };
  if (score >= 6) return { gradeLabel: "C", gradeColor: "#eab308" };
  if (score >= 5) return { gradeLabel: "D", gradeColor: "#f97316" };
  return { gradeLabel: "F", gradeColor: "#ef4444" };
}

/**
 * Get category breakdown with statistics
 */
export function getCategoryBreakdown(scorecard: ScorecardResult): CategoryBreakdown[] {
  const categories: RiskCategory[] = ["HOLISTIC_SECURITY", "SOURCE_RISK", "BUILD_RISK"];
  
  return categories.map((category) => {
    const checks = scorecard.checks.filter((c) => c.riskCategory === category);
    const passCount = checks.filter((c) => c.score >= 5).length;
    const failCount = checks.length - passCount;
    const avgScore = checks.length > 0
      ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
      : 0;

    return {
      category,
      checks,
      avgScore,
      passCount,
      failCount,
    };
  });
}

/**
 * Format category name for display
 */
export function formatCategoryName(category: RiskCategory): string {
  const names: Record<RiskCategory, string> = {
    HOLISTIC_SECURITY: "Holistic Security",
    SOURCE_RISK: "Source Risk",
    BUILD_RISK: "Build Risk",
  };
  return names[category];
}

/**
 * Get risk level badge color classes
 */
export function getRiskLevelClasses(level: RiskLevel): string {
  const classes: Record<RiskLevel, string> = {
    CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    LOW: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };
  return classes[level];
}

/**
 * Get check description for tooltip
 */
export function getCheckDescription(checkName: string): string {
  const descriptions: Record<string, string> = {
    "Vulnerabilities": "Checks for known security vulnerabilities in the project.",
    "Maintained": "Determines if the project is actively maintained.",
    "Code-Review": "Checks if changes are reviewed before merging.",
    "CII-Best-Practices": "Checks for CII Best Practices badge.",
    "License": "Checks for a valid open source license.",
    "Signed-Releases": "Checks for cryptographically signed releases.",
    "Branch-Protection": "Checks for branch protection rules.",
    "Dangerous-Workflow": "Checks for dangerous patterns in CI workflows.",
    "Token-Permissions": "Checks for least-privilege token permissions.",
    "Security-Policy": "Checks for SECURITY.md file.",
    "SAST": "Checks for static analysis tools.",
    "Binary-Artifacts": "Checks for binary files in source.",
    "Pinned-Dependencies": "Checks for pinned dependency versions.",
    "Dependency-Update-Tool": "Checks for automated dependency updates.",
    "Fuzzing": "Checks for fuzzing integration.",
    "Packaging": "Checks for published packages.",
    "Webhooks": "Checks webhook configuration.",
    "CI-Tests": "Checks for CI test configuration.",
    "Contributors": "Checks for diverse contributor base.",
  };
  return descriptions[checkName] ?? "Security check from OpenSSF Scorecard.";
}

export default useScorecard;

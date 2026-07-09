/**
 * VEX (Vulnerability Exploitability eXchange) Hook
 * 
 * React hooks for VEX queries and utilities.
 */

import { useQuery, useLazyQuery } from "@apollo/client/react";
import { useMemo, useCallback } from "react";
import {
  GET_VEX_EXPLOITABILITY,
  GET_VEX_DOCUMENT,
  GET_VEX_STATISTICS,
} from "../graphql/queries";
import type {
  VexStatus,
  VexJustification,
  VexStatement,
  VexExploitabilityResponse,
  VexDocumentResponse,
  VexStatisticsResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// VEX EXPLOITABILITY HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseVexExploitabilityOptions {
  vulnerabilityId: string;
  productId: string;
  skip?: boolean;
}

export function useVexExploitability(options: UseVexExploitabilityOptions) {
  const { vulnerabilityId, productId, skip } = options;

  const { data, loading, error, refetch } = useQuery<VexExploitabilityResponse>(
    GET_VEX_EXPLOITABILITY,
    {
      variables: { vulnerabilityId, productId },
      skip: skip || !vulnerabilityId || !productId,
      fetchPolicy: "cache-first",
    }
  );

  return {
    result: data?.vexExploitability,
    loading,
    error,
    refetch,
    isExploitable: data?.vexExploitability?.exploitable ?? null,
    status: data?.vexExploitability?.status,
    justification: data?.vexExploitability?.justification,
  };
}

// ═══════════════════════════════════════════════════════════════
// VEX DOCUMENT HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseVexDocumentOptions {
  packageId: string;
  skip?: boolean;
}

export function useVexDocument(options: UseVexDocumentOptions) {
  const { packageId, skip } = options;

  const { data, loading, error, refetch } = useQuery<VexDocumentResponse>(
    GET_VEX_DOCUMENT,
    {
      variables: { packageId },
      skip: skip || !packageId,
      fetchPolicy: "cache-first",
    }
  );

  const document = data?.vexDocument;

  // Utility: Filter statements by status
  const statementsByStatus = useMemo(() => {
    if (!document?.statements) return {};
    const grouped: Record<VexStatus, VexStatement[]> = {
      NOT_AFFECTED: [],
      AFFECTED: [],
      FIXED: [],
      UNDER_INVESTIGATION: [],
    };
    for (const stmt of document.statements) {
      grouped[stmt.status].push(stmt);
    }
    return grouped;
  }, [document?.statements]);

  // Utility: Find statement by vulnerability ID
  const findByVulnerability = useCallback(
    (vulnId: string): VexStatement | undefined => {
      return document?.statements.find((s) => s.vulnerabilityId === vulnId);
    },
    [document?.statements]
  );

  return {
    document,
    statements: document?.statements ?? [],
    statementCount: document?.statementCount ?? 0,
    statementsByStatus,
    findByVulnerability,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// VEX STATISTICS HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseVexStatisticsOptions {
  packageId?: string;
  skip?: boolean;
}

export function useVexStatistics(options: UseVexStatisticsOptions = {}) {
  const { packageId, skip } = options;

  const { data, loading, error, refetch } = useQuery<VexStatisticsResponse>(
    GET_VEX_STATISTICS,
    {
      variables: { packageId },
      skip,
      fetchPolicy: "cache-first",
    }
  );

  const stats = data?.vexStatistics;

  // Calculate coverage percentage
  const coverage = useMemo(() => {
    if (!stats || stats.totalStatements === 0) return null;
    const resolved = stats.notAffectedCount + stats.fixedCount;
    return Math.round((resolved / stats.totalStatements) * 100);
  }, [stats]);

  return {
    statistics: stats,
    totalStatements: stats?.totalStatements ?? 0,
    notAffectedCount: stats?.notAffectedCount ?? 0,
    affectedCount: stats?.affectedCount ?? 0,
    fixedCount: stats?.fixedCount ?? 0,
    underInvestigationCount: stats?.underInvestigationCount ?? 0,
    coverage,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// LAZY VEX HOOKS
// ═══════════════════════════════════════════════════════════════

export function useLazyVexExploitability() {
  const [check, { data, loading, error }] = useLazyQuery<VexExploitabilityResponse>(
    GET_VEX_EXPLOITABILITY,
    { fetchPolicy: "cache-first" }
  );

  const checkExploitability = useCallback(
    (vulnerabilityId: string, productId: string) => {
      return check({ variables: { vulnerabilityId, productId } });
    },
    [check]
  );

  return {
    checkExploitability,
    result: data?.vexExploitability,
    loading,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════
// VEX UTILITIES
// ═══════════════════════════════════════════════════════════════

export const VexUtils = {
  /**
   * Get display name for VEX status
   */
  getStatusDisplayName(status: VexStatus): string {
    const names: Record<VexStatus, string> = {
      NOT_AFFECTED: "Not Affected",
      AFFECTED: "Affected",
      FIXED: "Fixed",
      UNDER_INVESTIGATION: "Under Investigation",
    };
    return names[status] ?? status;
  },

  /**
   * Get icon for VEX status
   */
  getStatusIcon(status: VexStatus): string {
    const icons: Record<VexStatus, string> = {
      NOT_AFFECTED: "✓",
      AFFECTED: "✗",
      FIXED: "🔧",
      UNDER_INVESTIGATION: "🔍",
    };
    return icons[status] ?? "?";
  },

  /**
   * Get CSS classes for VEX status
   */
  getStatusClasses(status: VexStatus): string {
    const classes: Record<VexStatus, string> = {
      NOT_AFFECTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      AFFECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      FIXED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      UNDER_INVESTIGATION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
    return classes[status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  },

  /**
   * Get display name for VEX justification
   */
  getJustificationDisplayName(justification: VexJustification): string {
    const names: Record<VexJustification, string> = {
      COMPONENT_NOT_PRESENT: "Component Not Present",
      VULNERABLE_CODE_NOT_PRESENT: "Vulnerable Code Not Present",
      VULNERABLE_CODE_NOT_IN_EXECUTE_PATH: "Code Not in Execute Path",
      VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY: "Cannot Be Controlled",
      INLINE_MITIGATIONS_ALREADY_EXIST: "Mitigations Exist",
    };
    return names[justification] ?? justification;
  },

  /**
   * Get description for VEX justification
   */
  getJustificationDescription(justification: VexJustification): string {
    const descriptions: Record<VexJustification, string> = {
      COMPONENT_NOT_PRESENT:
        "The vulnerable component is not present in the product",
      VULNERABLE_CODE_NOT_PRESENT:
        "The product uses the component but does not include the vulnerable code",
      VULNERABLE_CODE_NOT_IN_EXECUTE_PATH:
        "The vulnerable code is present but cannot be executed in the product's context",
      VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY:
        "The vulnerable code requires conditions that cannot be achieved by an adversary",
      INLINE_MITIGATIONS_ALREADY_EXIST:
        "The product has inline mitigations that prevent exploitation",
    };
    return descriptions[justification] ?? "";
  },

  /**
   * Get color for VEX status
   */
  getStatusColor(status: VexStatus): string {
    const colors: Record<VexStatus, string> = {
      NOT_AFFECTED: "green",
      AFFECTED: "red",
      FIXED: "blue",
      UNDER_INVESTIGATION: "yellow",
    };
    return colors[status] ?? "gray";
  },

  /**
   * Check if status requires action
   */
  requiresAction(status: VexStatus): boolean {
    return status === "AFFECTED" || status === "UNDER_INVESTIGATION";
  },

  /**
   * Sort statements by priority (affected first)
   */
  sortByPriority(statements: VexStatement[]): VexStatement[] {
    const priority: Record<VexStatus, number> = {
      AFFECTED: 0,
      UNDER_INVESTIGATION: 1,
      FIXED: 2,
      NOT_AFFECTED: 3,
    };
    return [...statements].sort(
      (a, b) => priority[a.status] - priority[b.status]
    );
  },
};

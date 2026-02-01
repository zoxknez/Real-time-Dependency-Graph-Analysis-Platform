/**
 * VEX Status Component
 * 
 * Displays VEX (Vulnerability Exploitability eXchange) status badges
 * and detailed vulnerability exploitability information.
 */

"use client";

import React from "react";
import { 
  useVexExploitability, 
  useVexStatistics,
  VexUtils 
} from "@/lib/hooks";
import type { VexStatus, VexJustification, VexStatistics } from "@/lib/graphql/types";

// ═══════════════════════════════════════════════════════════════
// VEX STATUS BADGE
// ═══════════════════════════════════════════════════════════════

interface VexStatusBadgeProps {
  status: VexStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function VexStatusBadge({ 
  status, 
  size = "md", 
  showIcon = true,
  className = "" 
}: VexStatusBadgeProps) {
  const colorClasses = VexUtils.getStatusClasses(status);
  const icon = VexUtils.getStatusIcon(status);
  
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md ${colorClasses} ${sizeClasses[size]} ${className}`}
      title={VexUtils.getStatusDisplayName(status)}
    >
      {showIcon && <span aria-hidden="true">{icon}</span>}
      <span>{VexUtils.getStatusDisplayName(status)}</span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEX JUSTIFICATION BADGE
// ═══════════════════════════════════════════════════════════════

interface VexJustificationBadgeProps {
  justification: VexJustification;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function VexJustificationBadge({
  justification,
  size = "md",
  className = "",
}: VexJustificationBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md ${sizeClasses[size]} ${className}`}
      title={VexUtils.getJustificationDescription(justification)}
    >
      {VexUtils.getJustificationDisplayName(justification)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEX EXPLOITABILITY CARD
// ═══════════════════════════════════════════════════════════════

interface VexExploitabilityCardProps {
  packageId: string;
  vulnerabilityId: string;
  compact?: boolean;
  className?: string;
}

export function VexExploitabilityCard({
  packageId,
  vulnerabilityId,
  compact = false,
  className = "",
}: VexExploitabilityCardProps) {
  const { result, status, justification, loading, error } = useVexExploitability({
    productId: packageId,
    vulnerabilityId,
  });

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-gray-500 ${className}`}>
        VEX data not available
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {status && <VexStatusBadge status={status} size="sm" />}
        {justification && (
          <VexJustificationBadge
            justification={justification}
            size="sm"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            VEX Assessment
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {vulnerabilityId}
          </p>
        </div>
        {status && <VexStatusBadge status={status} />}
      </div>

      {justification && (
        <div className="mb-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">Justification:</span>
          <VexJustificationBadge
            justification={justification}
            size="sm"
            className="ml-2"
          />
        </div>
      )}

      {result.recommendation && (
        <div className="mb-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
            Recommendation
          </span>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {result.recommendation}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
        <span>Exploitable: {result.exploitable ? "Yes" : "No"}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEX STATISTICS PANEL
// ═══════════════════════════════════════════════════════════════

interface VexStatisticsPanelProps {
  packageId: string;
  className?: string;
}

export function VexStatisticsPanel({ packageId, className = "" }: VexStatisticsPanelProps) {
  const { statistics, totalStatements, coverage, loading, error } = useVexStatistics({ packageId });

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !statistics) {
    return null;
  }

  const statuses: { key: keyof VexStatistics; label: string; color: string }[] = [
    { key: "notAffectedCount", label: "Not Affected", color: "text-green-600 dark:text-green-400" },
    { key: "affectedCount", label: "Affected", color: "text-red-600 dark:text-red-400" },
    { key: "fixedCount", label: "Fixed", color: "text-blue-600 dark:text-blue-400" },
    { key: "underInvestigationCount", label: "Investigating", color: "text-yellow-600 dark:text-yellow-400" },
  ];

  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
        VEX Statistics
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statuses.map(({ key, label, color }) => (
          <div
            key={key}
            className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div className={`text-2xl font-bold ${color}`}>
              {statistics[key]}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Total Statements:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {totalStatements}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-gray-600 dark:text-gray-400">Coverage:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {coverage ?? 0}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEX STATUS DISTRIBUTION CHART
// ═══════════════════════════════════════════════════════════════

interface VexStatusDistributionProps {
  statistics: VexStatistics;
  className?: string;
}

export function VexStatusDistribution({ statistics, className = "" }: VexStatusDistributionProps) {
  const total = statistics.totalStatements || 1;
  
  const segments = [
    { 
      count: statistics.notAffectedCount, 
      color: "bg-green-500", 
      label: "Not Affected" 
    },
    { 
      count: statistics.fixedCount, 
      color: "bg-blue-500", 
      label: "Fixed" 
    },
    { 
      count: statistics.underInvestigationCount, 
      color: "bg-yellow-500", 
      label: "Investigating" 
    },
    { 
      count: statistics.affectedCount, 
      color: "bg-red-500", 
      label: "Affected" 
    },
  ].filter(s => s.count > 0);

  return (
    <div className={className}>
      {/* Bar */}
      <div className="h-3 flex rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={`${segment.color} transition-all duration-300`}
            style={{ width: `${(segment.count / total) * 100}%` }}
            title={`${segment.label}: ${segment.count}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${segment.color}`} />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {segment.label} ({segment.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Update Recommendations Component
 * 
 * Displays dependency update recommendations with security-based
 * prioritization and actionable guidance.
 */

"use client";

import React, { useState, useMemo } from "react";
import {
  useUpdateRecommendations,
  UpdateUtils,
} from "@/lib/hooks";
import type {
  UpdateRecommendation,
  UpdateUrgency,
  UpdateReason,
} from "@/lib/graphql/types";

// ═══════════════════════════════════════════════════════════════
// UPDATE URGENCY BADGE
// ═══════════════════════════════════════════════════════════════

interface UpdateUrgencyBadgeProps {
  urgency: UpdateUrgency;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UpdateUrgencyBadge({
  urgency,
  size = "md",
  className = "",
}: UpdateUrgencyBadgeProps) {
  const color = UpdateUtils.getUrgencyColor(urgency);
  
  const colorClasses: Record<string, string> = {
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md ${colorClasses[color]} ${sizeClasses[size]} ${className}`}
    >
      {UpdateUtils.getUrgencyDisplayName(urgency)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// UPDATE REASON TAG
// ═══════════════════════════════════════════════════════════════

interface UpdateReasonTagProps {
  reason: UpdateReason;
  size?: "sm" | "md";
  className?: string;
}

export function UpdateReasonTag({
  reason,
  size = "sm",
  className = "",
}: UpdateReasonTagProps) {
  const icon = UpdateUtils.getReasonIcon(reason);

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded ${sizeClasses[size]} ${className}`}
      title={UpdateUtils.getReasonDescription(reason)}
    >
      <span>{icon}</span>
      <span>{UpdateUtils.getReasonDisplayName(reason)}</span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// UPDATE RECOMMENDATION CARD
// ═══════════════════════════════════════════════════════════════

interface UpdateRecommendationCardProps {
  recommendation: UpdateRecommendation;
  onUpdate?: (recommendation: UpdateRecommendation) => void;
  className?: string;
}

export function UpdateRecommendationCard({
  recommendation,
  onUpdate,
  className = "",
}: UpdateRecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);

  const updateType = UpdateUtils.getUpdateType(
    recommendation.currentVersion,
    recommendation.recommendedVersion
  );

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {recommendation.packageName}
              </h4>
              <UpdateUrgencyBadge urgency={recommendation.urgency} size="sm" />
              {recommendation.breakingChanges && (
                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded">
                  Breaking Change
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                {recommendation.currentVersion}
              </span>
              <span className="text-gray-400">→</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {recommendation.recommendedVersion}
              </span>
              <span className="text-xs text-gray-400 uppercase">
                ({updateType})
              </span>
            </div>
          </div>

          {onUpdate && (
            <button
              onClick={() => onUpdate(recommendation)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
            >
              Update
            </button>
          )}
        </div>

        {/* Reasons */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {recommendation.reasons.map((reason) => (
            <UpdateReasonTag key={reason} reason={reason} />
          ))}
        </div>

        {/* Fixed Vulnerabilities */}
        {recommendation.vulnerabilitiesFixed > 0 && (
          <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm text-green-700 dark:text-green-400">
            🔒 Fixes {recommendation.vulnerabilitiesFixed} known vulnerabilit{recommendation.vulnerabilitiesFixed === 1 ? 'y' : 'ies'}
          </div>
        )}
      </div>

      {/* Changelog Link */}
      {recommendation.changelogUrl && (
        <div className="px-4 pb-4">
          <a
            href={recommendation.changelogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View changelog →
          </a>
        </div>
      )}

      {/* Recommendation Text */}
      {recommendation.recommendationText && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-400 max-h-48 overflow-auto">
              {recommendation.recommendationText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UPDATE RECOMMENDATIONS LIST
// ═══════════════════════════════════════════════════════════════

interface UpdateRecommendationsListProps {
  packageId: string;
  urgencyFilter?: UpdateUrgency[];
  reasonFilter?: UpdateReason[];
  onUpdate?: (recommendation: UpdateRecommendation) => void;
  className?: string;
}

export function UpdateRecommendationsList({
  packageId,
  urgencyFilter,
  reasonFilter,
  onUpdate,
  className = "",
}: UpdateRecommendationsListProps) {
  const { recommendations, loading, error, securityUpdates, urgencyCounts } =
    useUpdateRecommendations(packageId, { urgencyFilter, reasonFilter });

  const sortedRecommendations = useMemo(
    () => UpdateUtils.sortByPriority(recommendations),
    [recommendations]
  );

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse h-28 bg-gray-100 dark:bg-gray-800 rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-sm text-red-600 dark:text-red-400 ${className}`}>
        Error loading update recommendations: {error.message}
      </div>
    );
  }

  if (sortedRecommendations.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-4xl mb-2">✅</div>
        <p className="text-gray-600 dark:text-gray-400">
          All dependencies are up to date!
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Summary */}
      <UpdateSummaryBar counts={urgencyCounts} className="mb-4" />

      {/* Security Updates Alert */}
      {securityUpdates.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <span className="text-xl">🔒</span>
            <span className="font-medium">
              {securityUpdates.length} security update{securityUpdates.length === 1 ? '' : 's'} available
            </span>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
            Fixes {UpdateUtils.getTotalFixedVulnerabilities(securityUpdates)} known vulnerabilities
          </p>
        </div>
      )}

      {/* Recommendations List */}
      <div className="space-y-3">
        {sortedRecommendations.map((rec, index) => (
          <UpdateRecommendationCard
            key={`${rec.packageName}-${index}`}
            recommendation={rec}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UPDATE SUMMARY BAR
// ═══════════════════════════════════════════════════════════════

interface UpdateSummaryBarProps {
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    optional: number;
    total: number;
  };
  className?: string;
}

export function UpdateSummaryBar({ counts, className = "" }: UpdateSummaryBarProps) {
  if (counts.total === 0) return null;

  const segments = [
    { count: counts.critical, color: "bg-red-500", label: "Critical" },
    { count: counts.high, color: "bg-orange-500", label: "High" },
    { count: counts.medium, color: "bg-yellow-500", label: "Medium" },
    { count: counts.low, color: "bg-blue-500", label: "Low" },
    { count: counts.optional, color: "bg-gray-400", label: "Optional" },
  ].filter((s) => s.count > 0);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {counts.total} update{counts.total === 1 ? '' : 's'} available
        </span>
        <div className="flex items-center gap-3">
          {segments.map((seg) => (
            <span
              key={seg.label}
              className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400"
            >
              <span className={`w-2 h-2 rounded-full ${seg.color}`} />
              {seg.count} {seg.label}
            </span>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 flex rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={seg.color}
            style={{ width: `${(seg.count / counts.total) * 100}%` }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UPDATE COMMAND PANEL
// ═══════════════════════════════════════════════════════════════

interface UpdateCommandPanelProps {
  recommendations: UpdateRecommendation[];
  packageManager?: "npm" | "yarn" | "pnpm" | "cargo";
  className?: string;
}

export function UpdateCommandPanel({
  recommendations,
  packageManager = "npm",
  className = "",
}: UpdateCommandPanelProps) {
  const [copied, setCopied] = useState(false);

  const command = useMemo(
    () => UpdateUtils.generateUpdateCommand(recommendations, packageManager),
    [recommendations, packageManager]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (recommendations.length === 0) return null;

  return (
    <div className={`bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
        <span className="text-sm text-gray-400">
          Update command ({recommendations.length} package{recommendations.length === 1 ? '' : 's'})
        </span>
        <button
          onClick={handleCopy}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-sm text-green-400 overflow-auto max-h-32">
        {command}
      </pre>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BREAKING CHANGES WARNING
// ═══════════════════════════════════════════════════════════════

interface BreakingChangesWarningProps {
  recommendations: UpdateRecommendation[];
  className?: string;
}

export function BreakingChangesWarning({
  recommendations,
  className = "",
}: BreakingChangesWarningProps) {
  const breaking = recommendations.filter((r) => r.breakingChanges);

  if (breaking.length === 0) return null;

  return (
    <div
      className={`p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg ${className}`}
    >
      <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 mb-2">
        <span className="text-xl">⚠️</span>
        <span className="font-medium">
          {breaking.length} update{breaking.length === 1 ? '' : 's'} with breaking changes
        </span>
      </div>
      <ul className="text-sm text-yellow-600 dark:text-yellow-400 space-y-1">
        {breaking.map((rec, i) => (
          <li key={i}>
            • {rec.packageName}: {rec.currentVersion} → {rec.recommendedVersion}
          </li>
        ))}
      </ul>
      <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
        Review the release notes before updating to avoid compatibility issues.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UPDATE FILTERS PANEL
// ═══════════════════════════════════════════════════════════════

interface UpdateFiltersPanelProps {
  urgencyFilter: UpdateUrgency[];
  reasonFilter: UpdateReason[];
  onUrgencyChange: (urgencies: UpdateUrgency[]) => void;
  onReasonChange: (reasons: UpdateReason[]) => void;
  className?: string;
}

export function UpdateFiltersPanel({
  urgencyFilter,
  reasonFilter,
  onUrgencyChange,
  onReasonChange,
  className = "",
}: UpdateFiltersPanelProps) {
  const urgencies: UpdateUrgency[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "OPTIONAL"];
  const reasons: UpdateReason[] = [
    "SECURITY_VULNERABILITY",
    "MAJOR_BUG_FIX",
    "NEW_FEATURES",
    "PERFORMANCE_IMPROVEMENT",
    "DEPRECATED_VERSION",
    "LICENSE_CHANGE",
    "END_OF_LIFE",
    "MAINTENANCE_UPDATE",
  ];

  const toggleUrgency = (urgency: UpdateUrgency) => {
    if (urgencyFilter.includes(urgency)) {
      onUrgencyChange(urgencyFilter.filter((u) => u !== urgency));
    } else {
      onUrgencyChange([...urgencyFilter, urgency]);
    }
  };

  const toggleReason = (reason: UpdateReason) => {
    if (reasonFilter.includes(reason)) {
      onReasonChange(reasonFilter.filter((r) => r !== reason));
    } else {
      onReasonChange([...reasonFilter, reason]);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Urgency Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Urgency
        </label>
        <div className="flex flex-wrap gap-2">
          {urgencies.map((urgency) => (
            <button
              key={urgency}
              onClick={() => toggleUrgency(urgency)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                urgencyFilter.includes(urgency)
                  ? "bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400"
              }`}
            >
              {UpdateUtils.getUrgencyDisplayName(urgency)}
            </button>
          ))}
        </div>
      </div>

      {/* Reason Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Update Reason
        </label>
        <div className="flex flex-wrap gap-2">
          {reasons.map((reason) => (
            <button
              key={reason}
              onClick={() => toggleReason(reason)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                reasonFilter.includes(reason)
                  ? "bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400"
              }`}
            >
              {UpdateUtils.getReasonIcon(reason)} {UpdateUtils.getReasonDisplayName(reason)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

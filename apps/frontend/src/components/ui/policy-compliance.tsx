/**
 * Policy Compliance Component
 * 
 * Displays policy evaluation results and compliance status
 * with configurable rules and visual indicators.
 */

"use client";

import React, { useState } from "react";
import {
  useEvaluatePolicy,
  usePolicySets,
  PolicyUtils,
} from "@/lib/hooks";
import type {
  PolicyResult,
  PolicyCategory,
  PolicySeverity,
} from "@/lib/graphql/types";

// ═══════════════════════════════════════════════════════════════
// POLICY RESULT BADGE
// ═══════════════════════════════════════════════════════════════

interface PolicyResultBadgeProps {
  result: PolicyResult;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function PolicyResultBadge({
  result,
  size = "md",
  showIcon = true,
  className = "",
}: PolicyResultBadgeProps) {
  const colorClasses = {
    PASS: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    FAIL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    WARN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    SKIP: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  }[result];
  const icon = PolicyUtils.getResultIcon(result);

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md ${colorClasses} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && <span aria-hidden="true">{icon}</span>}
      <span>{PolicyUtils.getResultDisplayName(result)}</span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// POLICY CATEGORY BADGE
// ═══════════════════════════════════════════════════════════════

interface PolicyCategoryBadgeProps {
  category: PolicyCategory;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PolicyCategoryBadge({
  category,
  size = "md",
  className = "",
}: PolicyCategoryBadgeProps) {
  const icon = PolicyUtils.getCategoryIcon(category);

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md ${sizeClasses[size]} ${className}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{PolicyUtils.getCategoryDisplayName(category)}</span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// POLICY SEVERITY INDICATOR
// ═══════════════════════════════════════════════════════════════

interface PolicySeverityIndicatorProps {
  severity: PolicySeverity;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PolicySeverityIndicator({
  severity,
  size = "md",
  className = "",
}: PolicySeverityIndicatorProps) {
  const colorClasses = {
    INFO: "bg-blue-500",
    LOW: "bg-green-500",
    MEDIUM: "bg-yellow-500",
    HIGH: "bg-orange-500",
    CRITICAL: "bg-red-500",
  }[severity];

  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={`inline-block rounded-full ${colorClasses} ${sizeClasses[size]} ${className}`}
      title={PolicyUtils.getSeverityDisplayName(severity)}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// POLICY EVALUATION CARD
// ═══════════════════════════════════════════════════════════════

interface PolicyEvaluationCardProps {
  packageId: string;
  policySetId?: string;
  compact?: boolean;
  className?: string;
}

export function PolicyEvaluationCard({
  packageId,
  policySetId,
  compact = false,
  className = "",
}: PolicyEvaluationCardProps) {
  const { result, overallResult, ruleResults, passedCount, failedCount, warningCount, loading, error, refetch } = useEvaluatePolicy({
    packageId,
    policySetId,
  });
  const [showDetails, setShowDetails] = useState(false);

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 dark:bg-red-900/20 rounded-lg p-4 ${className}`}>
        <p className="text-sm text-red-600 dark:text-red-400">
          Error evaluating policy: {error.message}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-red-700 dark:text-red-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <p className="text-sm text-gray-500">Policy not yet evaluated.</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Evaluate Policy
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {overallResult && <PolicyResultBadge result={overallResult} size="sm" />}
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {passedCount}/{passedCount + failedCount + warningCount} rules passed
        </span>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div
        className={`p-4 ${
          overallResult === "PASS"
            ? "bg-green-50 dark:bg-green-900/20"
            : overallResult === "FAIL"
            ? "bg-red-50 dark:bg-red-900/20"
            : "bg-yellow-50 dark:bg-yellow-900/20"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              Policy Compliance
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {result?.policySetId ?? "Default Policy Set"}
            </p>
          </div>
          {overallResult && <PolicyResultBadge result={overallResult} />}
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {passedCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Passed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {failedCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Failed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {warningCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Warnings</div>
          </div>
        </div>
      </div>

      {/* Rule Details Toggle */}
      <div className="p-4">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        >
          <span>Rule Details ({ruleResults?.length ?? 0})</span>
          <span>{showDetails ? "▲" : "▼"}</span>
        </button>

        {showDetails && ruleResults && (
          <div className="mt-3 space-y-2">
            {ruleResults.map((rule, index) => (
              <PolicyRuleResult key={index} rule={rule} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
        {result?.evaluatedAt && (
          <span>Evaluated: {new Date(result.evaluatedAt).toLocaleString()}</span>
        )}
        <button
          onClick={() => refetch()}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Re-evaluate
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POLICY RULE RESULT
// ═══════════════════════════════════════════════════════════════

interface PolicyRuleResultProps {
  rule: {
    ruleId: string;
    ruleName: string;
    result: PolicyResult;
    message?: string;
    category?: PolicyCategory;
    severity?: PolicySeverity;
  };
  className?: string;
}

export function PolicyRuleResult({ rule, className = "" }: PolicyRuleResultProps) {
  const resultIcon = PolicyUtils.getResultIcon(rule.result);
  const resultColor =
    rule.result === "PASS"
      ? "text-green-500"
      : rule.result === "FAIL"
      ? "text-red-500"
      : rule.result === "WARN"
      ? "text-yellow-500"
      : "text-gray-400";

  return (
    <div
      className={`flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}
    >
      <span className={`mt-0.5 text-lg ${resultColor}`}>{resultIcon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {rule.ruleName}
          </span>
          {rule.category && (
            <PolicyCategoryBadge category={rule.category} size="sm" />
          )}
          {rule.severity && (
            <PolicySeverityIndicator severity={rule.severity} size="sm" />
          )}
        </div>
        {rule.message && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {rule.message}
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POLICY SETS LIST
// ═══════════════════════════════════════════════════════════════

interface PolicySetsListProps {
  onSelect?: (policySetId: string) => void;
  selectedId?: string;
  className?: string;
}

export function PolicySetsList({
  onSelect,
  selectedId,
  className = "",
}: PolicySetsListProps) {
  const { policySets, loading, error } = usePolicySets();

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse h-16 bg-gray-100 dark:bg-gray-800 rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-sm text-red-600 dark:text-red-400 ${className}`}>
        Error loading policy sets
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {policySets.map((policySet) => (
        <button
          key={policySet.id}
          onClick={() => onSelect?.(policySet.id)}
          className={`w-full text-left p-4 rounded-lg border transition-colors ${
            selectedId === policySet.id
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {policySet.name}
              </h4>
              {policySet.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {policySet.description}
                </p>
              )}
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {policySet.ruleCount} rules
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <span className="text-xs text-gray-400">
              v{policySet.version}
            </span>
            {policySet.blockingRuleCount > 0 && (
              <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                {policySet.blockingRuleCount} blocking
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPLIANCE SCORE GAUGE
// ═══════════════════════════════════════════════════════════════

interface ComplianceScoreGaugeProps {
  passed: number;
  total: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ComplianceScoreGauge({
  passed,
  total,
  size = "md",
  className = "",
}: ComplianceScoreGaugeProps) {
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;

  const sizeClasses = {
    sm: { container: "w-16 h-16", text: "text-lg", label: "text-xs" },
    md: { container: "w-24 h-24", text: "text-2xl", label: "text-sm" },
    lg: { container: "w-32 h-32", text: "text-3xl", label: "text-base" },
  };

  const getColor = () => {
    if (percentage >= 90) return "stroke-green-500";
    if (percentage >= 70) return "stroke-yellow-500";
    return "stroke-red-500";
  };

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className={`relative ${sizeClasses[size].container}`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            className="stroke-gray-200 dark:stroke-gray-700"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            className={`${getColor()} transition-all duration-500`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold text-gray-900 dark:text-gray-100 ${sizeClasses[size].text}`}>
            {percentage}%
          </span>
        </div>
      </div>
      <span className={`mt-2 text-gray-600 dark:text-gray-400 ${sizeClasses[size].label}`}>
        {passed}/{total} passed
      </span>
    </div>
  );
}

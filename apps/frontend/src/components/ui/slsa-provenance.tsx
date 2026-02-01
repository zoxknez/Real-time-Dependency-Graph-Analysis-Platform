/**
 * SLSA Provenance Component
 * 
 * Displays SLSA (Supply-chain Levels for Software Artifacts) build levels
 * and provenance verification status.
 */

"use client";

import React, { useState } from "react";
import {
  useSlsaAssessment,
  useVerifyProvenance,
  SlsaUtils,
} from "@/lib/hooks";
import type { SlsaBuildLevel } from "@/lib/graphql/types";

// ═══════════════════════════════════════════════════════════════
// SLSA LEVEL BADGE
// ═══════════════════════════════════════════════════════════════

interface SlsaLevelBadgeProps {
  level: SlsaBuildLevel;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function SlsaLevelBadge({
  level,
  size = "md",
  showLabel = true,
  className = "",
}: SlsaLevelBadgeProps) {
  const colorClasses = {
    L0: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    L1: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    L2: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    L3: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  }[level];
  const icon = { L0: "○", L1: "◐", L2: "◕", L3: "●" }[level];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md ${colorClasses} ${sizeClasses[size]} ${className}`}
      title={SlsaUtils.getLevelDescription(level)}
    >
      <span aria-hidden="true">{icon}</span>
      {showLabel && <span>SLSA {SlsaUtils.getLevelDisplayName(level)}</span>}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// SLSA VERIFICATION BADGE
// ═══════════════════════════════════════════════════════════════

interface SlsaVerificationBadgeProps {
  verified: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SlsaVerificationBadge({
  verified,
  size = "md",
  className = "",
}: SlsaVerificationBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const colorClasses = verified
    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md ${colorClasses} ${sizeClasses[size]} ${className}`}
    >
      <span aria-hidden="true">{verified ? "✓" : "✗"}</span>
      <span>{verified ? "Verified" : "Unverified"}</span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// SLSA ASSESSMENT CARD
// ═══════════════════════════════════════════════════════════════

interface SlsaAssessmentCardProps {
  packageId: string;
  compact?: boolean;
  className?: string;
}

export function SlsaAssessmentCard({
  packageId,
  compact = false,
  className = "",
}: SlsaAssessmentCardProps) {
  const { assessment, level, hasProvenance, provenanceSigned, recommendations, loading, error } = useSlsaAssessment({ packageId });

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-gray-500 ${className}`}>
        SLSA assessment not available
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {level && <SlsaLevelBadge level={level} size="sm" />}
        {provenanceSigned && (
          <SlsaVerificationBadge verified size="sm" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            SLSA Provenance
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Supply-chain Level for Software Artifacts
          </p>
        </div>
        {level && <SlsaLevelBadge level={level} />}
      </div>

      {/* Status Checklist */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
              hasProvenance
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {hasProvenance ? "✓" : "✗"}
          </span>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Has Provenance
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
              provenanceSigned
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {provenanceSigned ? "✓" : "✗"}
          </span>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Provenance Signed
          </span>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="mb-4">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">
            Recommendations to improve:
          </span>
          <ul className="space-y-1">
            {recommendations.map((rec, idx) => (
              <li
                key={idx}
                className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2"
              >
                <span className="text-blue-500">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
        <span>
          Signed:{" "}
          <span className={provenanceSigned ? "text-green-600" : "text-red-600"}>
            {provenanceSigned ? "Yes" : "No"}
          </span>
        </span>
        {assessment?.assessedAt && (
          <span>
            Assessed: {new Date(assessment.assessedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SLSA LEVEL PROGRESS
// ═══════════════════════════════════════════════════════════════

interface SlsaLevelProgressProps {
  currentLevel: SlsaBuildLevel;
  className?: string;
}

export function SlsaLevelProgress({ currentLevel, className = "" }: SlsaLevelProgressProps) {
  const levels: SlsaBuildLevel[] = ["L0", "L1", "L2", "L3"];
  const currentIndex = levels.indexOf(currentLevel);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        {levels.map((level, index) => {
          const isAchieved = index <= currentIndex;
          const isCurrent = level === currentLevel;

          return (
            <div key={level} className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  isAchieved
                    ? "bg-green-500 border-green-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400"
                } ${isCurrent ? "ring-2 ring-green-300 ring-offset-2 dark:ring-offset-gray-900" : ""}`}
              >
                {level}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {SlsaUtils.getLevelDisplayName(level)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-4">
        <div
          className="absolute h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
          style={{ width: `${((currentIndex + 1) / levels.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROVENANCE VERIFICATION PANEL
// ═══════════════════════════════════════════════════════════════

interface ProvenanceVerificationPanelProps {
  packageId: string;
  provenanceId: string;
  className?: string;
}

export function ProvenanceVerificationPanel({
  packageId,
  provenanceId: _provenanceId,
  className = "",
}: ProvenanceVerificationPanelProps) {
  const { result, valid, slsaLevel, checks, loading, error, refetch } = useVerifyProvenance({ packageId });
  const [expanded, setExpanded] = useState(false);

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
          Error verifying provenance: {error.message}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-red-700 dark:text-red-300 underline"
        >
          Retry verification
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <p className="text-sm text-gray-500">
          Provenance not yet verified.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Verify Now
        </button>
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
          valid
            ? "bg-green-50 dark:bg-green-900/20"
            : "bg-red-50 dark:bg-red-900/20"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`text-2xl ${
                valid ? "text-green-600" : "text-red-600"
              }`}
            >
              {valid ? "✓" : "✗"}
            </span>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                Provenance Verification
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {valid ? "All checks passed" : "Verification failed"}
              </p>
            </div>
          </div>
          {slsaLevel && (
            <SlsaLevelBadge level={slsaLevel} />
          )}
        </div>
      </div>

      {/* Checks */}
      <div className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        >
          <span>Verification Checks ({checks?.length ?? 0})</span>
          <span>{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && checks && (
          <div className="mt-3 space-y-2">
            {checks.map((check, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded"
              >
                <span
                  className={`mt-0.5 ${
                    check.passed ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {check.passed ? "✓" : "✗"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {check.name}
                  </p>
                  {check.message && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {check.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Errors/Warnings */}
      {result.errors && result.errors.length > 0 && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
              Errors:
            </p>
            <ul className="space-y-1">
              {result.errors.map((err, i) => (
                <li key={i} className="text-sm text-red-600 dark:text-red-400">
                  • {err}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pb-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
        <span>SLSA Level: {slsaLevel ?? "Unknown"}</span>
        <button
          onClick={() => refetch()}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Re-verify
        </button>
      </div>
    </div>
  );
}

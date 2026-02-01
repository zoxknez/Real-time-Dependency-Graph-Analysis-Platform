/**
 * Enhanced SLSA Components
 * 
 * Implements SLSA (Supply-chain Levels for Software Artifacts) v1.0 specification
 * with complete requirements tracking for all build levels.
 * 
 * @see https://slsa.dev/spec/v1.0/requirements
 * @see https://slsa.dev/spec/v1.0/levels
 */

"use client";

import React, { useMemo, useState } from "react";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Server,
  FileText,
  Package,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// TYPES - Based on SLSA v1.0 Specification
// ═══════════════════════════════════════════════════════════════

export type SlsaBuildLevel = "L0" | "L1" | "L2" | "L3";

export type RequirementCategory = 
  | "provenance"
  | "build-platform"
  | "producer";

export type RequirementStatus = "met" | "partial" | "not-met" | "not-applicable" | "unknown";

export interface SlsaRequirement {
  id: string;
  name: string;
  description: string;
  level: SlsaBuildLevel;
  category: RequirementCategory;
  status: RequirementStatus;
  details?: string;
  documentation?: string;
}

export interface SlsaAssessment {
  currentLevel: SlsaBuildLevel;
  targetLevel?: SlsaBuildLevel;
  buildPlatform: string;
  buildType: string;
  requirements: SlsaRequirement[];
  provenanceUri?: string;
  lastAssessed: string;
}

// ═══════════════════════════════════════════════════════════════
// SLSA v1.0 REQUIREMENTS DEFINITIONS
// ═══════════════════════════════════════════════════════════════

interface RequirementDefinition {
  id: string;
  name: string;
  description: string;
  level: SlsaBuildLevel;
  category: RequirementCategory;
  documentation: string;
}

const slsaRequirements: RequirementDefinition[] = [
  // ─────────────────────────────────────────────────────────────
  // LEVEL 1 - Build Provenance Exists
  // ─────────────────────────────────────────────────────────────
  {
    id: "provenance-exists",
    name: "Provenance Exists",
    description: "The package has SLSA provenance generated during the build process",
    level: "L1",
    category: "provenance",
    documentation: "https://slsa.dev/spec/v1.0/requirements#provenance-exists",
  },
  {
    id: "provenance-authentic",
    name: "Provenance Authentic",
    description: "The provenance's authenticity and integrity can be verified",
    level: "L1",
    category: "provenance",
    documentation: "https://slsa.dev/spec/v1.0/requirements#provenance-authentic",
  },

  // ─────────────────────────────────────────────────────────────
  // LEVEL 2 - Hosted Build Platform
  // ─────────────────────────────────────────────────────────────
  {
    id: "hosted-build",
    name: "Hosted Build Platform",
    description: "Build runs on a hosted platform, not on a developer workstation",
    level: "L2",
    category: "build-platform",
    documentation: "https://slsa.dev/spec/v1.0/requirements#hosted",
  },
  {
    id: "provenance-signed",
    name: "Provenance Signed",
    description: "Provenance is digitally signed by the build platform",
    level: "L2",
    category: "provenance",
    documentation: "https://slsa.dev/spec/v1.0/requirements#provenance-authentic",
  },
  {
    id: "build-service",
    name: "Build as a Service",
    description: "Build executed using a build service with defined entry points",
    level: "L2",
    category: "build-platform",
    documentation: "https://slsa.dev/spec/v1.0/requirements#build-service",
  },

  // ─────────────────────────────────────────────────────────────
  // LEVEL 3 - Hardened Builds
  // ─────────────────────────────────────────────────────────────
  {
    id: "isolated-builds",
    name: "Isolated Build Environment",
    description: "Build runs in an ephemeral isolated environment",
    level: "L3",
    category: "build-platform",
    documentation: "https://slsa.dev/spec/v1.0/requirements#isolated",
  },
  {
    id: "unforgeable-provenance",
    name: "Unforgeable Provenance",
    description: "Provenance cannot be forged by a build administrator",
    level: "L3",
    category: "provenance",
    documentation: "https://slsa.dev/spec/v1.0/requirements#provenance-unforgeable",
  },
  {
    id: "hermetic-builds",
    name: "Hermetic Builds",
    description: "Build cannot access external resources beyond declared dependencies",
    level: "L3",
    category: "build-platform",
    documentation: "https://slsa.dev/spec/v1.0/requirements#hermetic",
  },
  {
    id: "reproducible-builds",
    name: "Reproducible Builds",
    description: "Build can be reproduced bit-for-bit from the same source",
    level: "L3",
    category: "build-platform",
    documentation: "https://slsa.dev/spec/v1.0/requirements#reproducible",
  },
  {
    id: "secret-isolation",
    name: "Secret Isolation",
    description: "Secrets are isolated from the build process",
    level: "L3",
    category: "build-platform",
    documentation: "https://slsa.dev/spec/v1.0/requirements#isolated",
  },
  {
    id: "parameter-verification",
    name: "Parameter Verification",
    description: "Build parameters are verified and constrained",
    level: "L3",
    category: "producer",
    documentation: "https://slsa.dev/spec/v1.0/requirements#parameter-verification",
  },
];

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function getLevelNumber(level: SlsaBuildLevel): number {
  return parseInt(level.replace("L", ""));
}

function getLevelColor(level: SlsaBuildLevel): string {
  switch (level) {
    case "L0": return "text-gray-500 dark:text-gray-400";
    case "L1": return "text-yellow-600 dark:text-yellow-400";
    case "L2": return "text-blue-600 dark:text-blue-400";
    case "L3": return "text-green-600 dark:text-green-400";
  }
}

function getLevelBgColor(level: SlsaBuildLevel): string {
  switch (level) {
    case "L0": return "bg-gray-100 dark:bg-gray-800";
    case "L1": return "bg-yellow-100 dark:bg-yellow-900/30";
    case "L2": return "bg-blue-100 dark:bg-blue-900/30";
    case "L3": return "bg-green-100 dark:bg-green-900/30";
  }
}

function getStatusIcon(status: RequirementStatus) {
  switch (status) {
    case "met":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "partial":
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    case "not-met":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "not-applicable":
      return <Info className="w-5 h-5 text-gray-400" />;
    case "unknown":
      return <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />;
  }
}

function getStatusColor(status: RequirementStatus): string {
  switch (status) {
    case "met":
      return "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20";
    case "partial":
      return "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20";
    case "not-met":
      return "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20";
    case "not-applicable":
      return "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50";
    case "unknown":
      return "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50";
  }
}

function getCategoryIcon(category: RequirementCategory) {
  switch (category) {
    case "provenance":
      return <FileText className="w-4 h-4" />;
    case "build-platform":
      return <Server className="w-4 h-4" />;
    case "producer":
      return <Package className="w-4 h-4" />;
  }
}

function getCategoryLabel(category: RequirementCategory): string {
  switch (category) {
    case "provenance": return "Provenance Requirements";
    case "build-platform": return "Build Platform Requirements";
    case "producer": return "Producer Requirements";
  }
}

// ═══════════════════════════════════════════════════════════════
// SLSA LEVEL BADGE (Enhanced)
// ═══════════════════════════════════════════════════════════════

interface SlsaLevelBadgeEnhancedProps {
  level: SlsaBuildLevel;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
}

export function SlsaLevelBadgeEnhanced({ 
  level, 
  size = "md", 
  showLabel = true,
  animated = false,
}: SlsaLevelBadgeEnhancedProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-12 h-12 text-lg",
    lg: "w-16 h-16 text-xl",
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} ${getLevelBgColor(level)} ${getLevelColor(level)} rounded-full flex items-center justify-center font-bold border-2 border-current ${animated ? "animate-pulse" : ""}`}
      >
        {level}
      </div>
      {showLabel && (
        <div className="text-left">
          <div className={`font-medium ${getLevelColor(level)}`}>
            SLSA {level}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {level === "L0" && "No guarantees"}
            {level === "L1" && "Provenance exists"}
            {level === "L2" && "Hosted build"}
            {level === "L3" && "Hardened builds"}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REQUIREMENT CARD
// ═══════════════════════════════════════════════════════════════

interface RequirementCardProps {
  requirement: SlsaRequirement;
  compact?: boolean;
}

export function RequirementCard({ requirement, compact = false }: RequirementCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (compact) {
    return (
      <div className={`flex items-center justify-between p-2 rounded-lg border ${getStatusColor(requirement.status)}`}>
        <div className="flex items-center gap-2">
          {getStatusIcon(requirement.status)}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {requirement.name}
          </span>
        </div>
        <span className={`text-xs font-medium ${getLevelColor(requirement.level)}`}>
          {requirement.level}
        </span>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${getStatusColor(requirement.status)}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-white/50 dark:hover:bg-gray-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {getStatusIcon(requirement.status)}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {requirement.name}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getLevelBgColor(requirement.level)} ${getLevelColor(requirement.level)}`}>
                {requirement.level}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {requirement.description}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="p-3 bg-white/50 dark:bg-gray-900/50 border-t border-inherit">
          {requirement.details && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {requirement.details}
            </p>
          )}
          {requirement.documentation && (
            <a
              href={requirement.documentation}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              View specification <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEVEL PROGRESS TRACKER
// ═══════════════════════════════════════════════════════════════

interface SlsaLevelTrackerProps {
  currentLevel: SlsaBuildLevel;
  targetLevel?: SlsaBuildLevel;
  requirements: SlsaRequirement[];
}

export function SlsaLevelTracker({ currentLevel, targetLevel, requirements }: SlsaLevelTrackerProps) {
  const levels: SlsaBuildLevel[] = ["L0", "L1", "L2", "L3"];
  const currentIdx = getLevelNumber(currentLevel);
  const targetIdx = targetLevel ? getLevelNumber(targetLevel) : null;

  const getRequirementProgress = (level: SlsaBuildLevel) => {
    const levelReqs = requirements.filter(r => r.level === level);
    const metCount = levelReqs.filter(r => r.status === "met").length;
    return { met: metCount, total: levelReqs.length };
  };

  return (
    <div className="space-y-4">
      {/* Level Progress Bar */}
      <div className="relative">
        <div className="flex justify-between">
          {levels.map((level, idx) => {
            const progress = getRequirementProgress(level);
            const isComplete = idx <= currentIdx;
            const isTarget = targetIdx !== null && idx === targetIdx;
            const isCurrent = idx === currentIdx;

            return (
              <div key={level} className="flex flex-col items-center relative z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all ${
                    isComplete
                      ? `${getLevelBgColor(level)} ${getLevelColor(level)} border-current`
                      : "bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-300 dark:border-gray-600"
                  } ${isCurrent ? "ring-2 ring-offset-2 ring-blue-500" : ""} ${isTarget ? "ring-2 ring-offset-2 ring-purple-500" : ""}`}
                >
                  {level}
                </div>
                <div className="mt-2 text-center">
                  <div className={`text-xs font-medium ${isComplete ? getLevelColor(level) : "text-gray-400"}`}>
                    {level === "L0" && "No assurance"}
                    {level === "L1" && "Provenance"}
                    {level === "L2" && "Hosted"}
                    {level === "L3" && "Hardened"}
                  </div>
                  {level !== "L0" && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {progress.met}/{progress.total} requirements
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Connection Lines */}
        <div className="absolute top-5 left-0 right-0 h-0.5 -z-0">
          <div className="mx-5 h-full bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div
            className="absolute top-0 left-5 h-full bg-gradient-to-r from-yellow-500 via-blue-500 to-green-500 rounded-full transition-all"
            style={{ width: `${(currentIdx / 3) * 100}%`, maxWidth: "calc(100% - 2.5rem)" }}
          />
        </div>
      </div>

      {/* Current Level Details */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className={`w-5 h-5 ${getLevelColor(currentLevel)}`} />
            <span className="font-medium text-gray-900 dark:text-gray-100">
              Current Level: SLSA {currentLevel}
            </span>
          </div>
          {targetLevel && targetLevel !== currentLevel && (
            <span className="text-sm text-purple-600 dark:text-purple-400">
              Target: {targetLevel}
            </span>
          )}
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          {currentLevel === "L0" && "No SLSA level achieved. Provenance is not generated or not in SLSA format."}
          {currentLevel === "L1" && "Documentation of the build process in the form of provenance. Helps consumers understand the build but offers limited integrity guarantees."}
          {currentLevel === "L2" && "Builds run on a hosted build service. Provenance is signed by the build platform."}
          {currentLevel === "L3" && "Hardened build platform with strong isolation guarantees. Provenance is unforgeable and builds are hermetic."}
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REQUIREMENTS CHECKLIST
// ═══════════════════════════════════════════════════════════════

interface RequirementsChecklistProps {
  requirements: SlsaRequirement[];
  groupByCategory?: boolean;
  groupByLevel?: boolean;
  compact?: boolean;
}

export function RequirementsChecklist({
  requirements,
  groupByCategory = false,
  groupByLevel = false,
  compact = false,
}: RequirementsChecklistProps) {
  const grouped = useMemo(() => {
    if (groupByCategory) {
      const groups: Record<RequirementCategory, SlsaRequirement[]> = {
        provenance: [],
        "build-platform": [],
        producer: [],
      };
      for (const req of requirements) {
        groups[req.category].push(req);
      }
      return groups;
    }
    if (groupByLevel) {
      const groups: Record<SlsaBuildLevel, SlsaRequirement[]> = {
        L0: [],
        L1: [],
        L2: [],
        L3: [],
      };
      for (const req of requirements) {
        groups[req.level].push(req);
      }
      return groups;
    }
    return { all: requirements };
  }, [requirements, groupByCategory, groupByLevel]);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([key, reqs]) => (
        <div key={key}>
          {(groupByCategory || groupByLevel) && reqs.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              {groupByCategory && getCategoryIcon(key as RequirementCategory)}
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {groupByCategory 
                  ? getCategoryLabel(key as RequirementCategory)
                  : `Level ${key}`}
              </h3>
              <span className="text-xs text-gray-500">
                ({reqs.filter(r => r.status === "met").length}/{reqs.length} met)
              </span>
            </div>
          )}
          <div className={compact ? "grid grid-cols-1 md:grid-cols-2 gap-2" : "space-y-2"}>
            {reqs.map((req) => (
              <RequirementCard key={req.id} requirement={req} compact={compact} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SLSA ASSESSMENT PANEL
// ═══════════════════════════════════════════════════════════════

interface SlsaAssessmentPanelProps {
  assessment: SlsaAssessment;
  className?: string;
}

export function SlsaAssessmentPanel({ assessment, className = "" }: SlsaAssessmentPanelProps) {
  const [view, setView] = useState<"level" | "category">("level");

  const stats = useMemo(() => {
    const total = assessment.requirements.length;
    const met = assessment.requirements.filter(r => r.status === "met").length;
    const partial = assessment.requirements.filter(r => r.status === "partial").length;
    const notMet = assessment.requirements.filter(r => r.status === "not-met").length;
    return { total, met, partial, notMet };
  }, [assessment.requirements]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://slsa.dev/images/gh-badge-level3.svg"
                alt="SLSA"
                className="h-6"
              />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                SLSA Assessment
              </h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Supply-chain Levels for Software Artifacts v1.0
            </p>
          </div>
          <SlsaLevelBadgeEnhanced level={assessment.currentLevel} size="lg" showLabel={true} />
        </div>

        {/* Build Info */}
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Server className="w-4 h-4" />
            {assessment.buildPlatform}
          </span>
          <span>•</span>
          <span>Build Type: {assessment.buildType}</span>
          <span>•</span>
          <span>Assessed: {new Date(assessment.lastAssessed).toLocaleDateString()}</span>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Requirements</div>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.met}</div>
            <div className="text-xs text-green-600/80 dark:text-green-400/80">Met</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.partial}</div>
            <div className="text-xs text-yellow-600/80 dark:text-yellow-400/80">Partial</div>
          </div>
          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.notMet}</div>
            <div className="text-xs text-red-600/80 dark:text-red-400/80">Not Met</div>
          </div>
        </div>
      </div>

      {/* Level Tracker */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Level Progress
        </h3>
        <SlsaLevelTracker
          currentLevel={assessment.currentLevel}
          targetLevel={assessment.targetLevel}
          requirements={assessment.requirements}
        />
      </div>

      {/* Requirements */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Requirements
          </h3>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setView("level")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                view === "level"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              By Level
            </button>
            <button
              onClick={() => setView("category")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                view === "category"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              By Category
            </button>
          </div>
        </div>

        <RequirementsChecklist
          requirements={assessment.requirements}
          groupByLevel={view === "level"}
          groupByCategory={view === "category"}
        />
      </div>

      {/* Provenance Link */}
      {assessment.provenanceUri && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div className="flex-1">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Provenance Available
              </h4>
              <a
                href={assessment.provenanceUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                View provenance attestation <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Learn More */}
      <div className="text-center">
        <a
          href="https://slsa.dev/spec/v1.0/requirements"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
        >
          Learn more about SLSA requirements <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPACT SLSA WIDGET
// ═══════════════════════════════════════════════════════════════

interface SlsaWidgetProps {
  level: SlsaBuildLevel;
  requirementsMet?: number;
  requirementsTotal?: number;
}

export function SlsaWidget({ level, requirementsMet = 0, requirementsTotal = 0 }: SlsaWidgetProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          SLSA Build Level
        </span>
        <SlsaLevelBadgeEnhanced level={level} size="sm" showLabel={false} />
      </div>

      {requirementsTotal > 0 && (
        <>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Requirements met</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {requirementsMet}/{requirementsTotal}
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getLevelBgColor(level).replace("bg-", "bg-gradient-to-r from-")}`}
              style={{ width: `${(requirementsMet / requirementsTotal) * 100}%` }}
            />
          </div>
        </>
      )}

      <a
        href="https://slsa.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-xs text-center text-blue-600 dark:text-blue-400 hover:underline"
      >
        Learn about SLSA →
      </a>
    </div>
  );
}

// Export helper for creating requirements from definitions
export function createSlsaRequirement(
  id: string,
  status: RequirementStatus,
  details?: string
): SlsaRequirement {
  const def = slsaRequirements.find(r => r.id === id);
  if (!def) {
    throw new Error(`Unknown SLSA requirement: ${id}`);
  }
  return {
    ...def,
    status,
    details,
  };
}

export { slsaRequirements };
export default SlsaAssessmentPanel;

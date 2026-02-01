/**
 * OpenSSF Scorecard Integration Component
 * 
 * Implements the OpenSSF Scorecard security assessment framework
 * following official specifications from scorecard.dev and github.com/ossf/scorecard
 * 
 * Checks are organized into three categories:
 * 1. Holistic Security Practices
 * 2. Source Code Risk Assessment  
 * 3. Build Process Risk Assessment
 * 
 * @see https://scorecard.dev/
 * @see https://github.com/ossf/scorecard
 */

"use client";

import React, { useMemo } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  Activity,
  Package,
  Lock,
  FileSearch,
  Users,
  Code,
  Terminal,
  Bug,
  FileText,
  RefreshCw,
  Award,
  AlertOctagon,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// TYPES - Based on OpenSSF Scorecard Schema
// ═══════════════════════════════════════════════════════════════

export type ScorecardRisk = "Critical" | "High" | "Medium" | "Low";

export type ScorecardCheckName =
  | "Binary-Artifacts"
  | "Branch-Protection"
  | "CI-Tests"
  | "CII-Best-Practices"
  | "Code-Review"
  | "Contributors"
  | "Dangerous-Workflow"
  | "Dependency-Update-Tool"
  | "Fuzzing"
  | "License"
  | "Maintained"
  | "Packaging"
  | "Pinned-Dependencies"
  | "SAST"
  | "Security-Policy"
  | "Signed-Releases"
  | "Token-Permissions"
  | "Vulnerabilities"
  | "Webhooks";

export type CheckCategory = 
  | "holistic-security"
  | "source-risk"
  | "build-risk";

export interface ScorecardCheck {
  name: ScorecardCheckName;
  score: number;        // 0-10, -1 for unknown
  reason: string;
  details?: string[];
  risk: ScorecardRisk;
  category: CheckCategory;
  documentation: string;
}

export interface ScorecardResult {
  repo: string;
  commit: string;
  date: string;
  version: string;
  score: number;        // Aggregate score 0-10
  checks: ScorecardCheck[];
}

// ═══════════════════════════════════════════════════════════════
// CHECK METADATA - Based on Official Scorecard Documentation
// ═══════════════════════════════════════════════════════════════

interface CheckMetadata {
  name: ScorecardCheckName;
  risk: ScorecardRisk;
  category: CheckCategory;
  question: string;
  description: string;
  icon: React.ReactNode;
  documentation: string;
}

const checkMetadata: Record<ScorecardCheckName, CheckMetadata> = {
  "Binary-Artifacts": {
    name: "Binary-Artifacts",
    risk: "High",
    category: "source-risk",
    question: "Is the project free of checked-in binaries?",
    description: "Binary artifacts in the repository increase the risk of undetected malicious code.",
    icon: <Package className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#binary-artifacts",
  },
  "Branch-Protection": {
    name: "Branch-Protection",
    risk: "High",
    category: "source-risk",
    question: "Does the project use Branch Protection?",
    description: "Branch protection prevents direct commits and enforces code review.",
    icon: <Lock className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#branch-protection",
  },
  "CI-Tests": {
    name: "CI-Tests",
    risk: "Low",
    category: "holistic-security",
    question: "Does the project run tests in CI?",
    description: "CI tests help catch bugs and vulnerabilities before code is merged.",
    icon: <Activity className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#ci-tests",
  },
  "CII-Best-Practices": {
    name: "CII-Best-Practices",
    risk: "Low",
    category: "holistic-security",
    question: "Has the project earned an OpenSSF Best Practices Badge?",
    description: "The CII Best Practices badge indicates adherence to security best practices.",
    icon: <Award className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#cii-best-practices",
  },
  "Code-Review": {
    name: "Code-Review",
    risk: "High",
    category: "source-risk",
    question: "Does the project require code review before code is merged?",
    description: "Code review helps identify security issues and improves code quality.",
    icon: <FileSearch className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#code-review",
  },
  "Contributors": {
    name: "Contributors",
    risk: "Low",
    category: "source-risk",
    question: "Does the project have contributors from multiple organizations?",
    description: "Projects with diverse contributors are less likely to be abandoned.",
    icon: <Users className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#contributors",
  },
  "Dangerous-Workflow": {
    name: "Dangerous-Workflow",
    risk: "Critical",
    category: "source-risk",
    question: "Does the project avoid dangerous coding patterns in GitHub Actions?",
    description: "Dangerous workflows can lead to code injection or credential theft.",
    icon: <AlertOctagon className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#dangerous-workflow",
  },
  "Dependency-Update-Tool": {
    name: "Dependency-Update-Tool",
    risk: "High",
    category: "holistic-security",
    question: "Does the project use tools to help update its dependencies?",
    description: "Dependency update tools help keep dependencies secure and up-to-date.",
    icon: <RefreshCw className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#dependency-update-tool",
  },
  "Fuzzing": {
    name: "Fuzzing",
    risk: "Medium",
    category: "holistic-security",
    question: "Does the project use fuzzing tools?",
    description: "Fuzzing helps discover security vulnerabilities and bugs.",
    icon: <Bug className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#fuzzing",
  },
  "License": {
    name: "License",
    risk: "Low",
    category: "holistic-security",
    question: "Does the project declare a license?",
    description: "A clear license helps users understand their rights and obligations.",
    icon: <FileText className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#license",
  },
  "Maintained": {
    name: "Maintained",
    risk: "High",
    category: "holistic-security",
    question: "Is the project at least 90 days old, and maintained?",
    description: "Maintained projects are more likely to receive security updates.",
    icon: <Activity className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#maintained",
  },
  "Packaging": {
    name: "Packaging",
    risk: "Medium",
    category: "build-risk",
    question: "Does the project build and publish official packages from CI/CD?",
    description: "Publishing from CI/CD ensures reproducible and verifiable builds.",
    icon: <Package className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#packaging",
  },
  "Pinned-Dependencies": {
    name: "Pinned-Dependencies",
    risk: "Medium",
    category: "build-risk",
    question: "Does the project declare and pin dependencies?",
    description: "Pinning dependencies prevents supply chain attacks via compromised packages.",
    icon: <Lock className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies",
  },
  "SAST": {
    name: "SAST",
    risk: "Medium",
    category: "holistic-security",
    question: "Does the project use static code analysis tools?",
    description: "SAST tools help identify security vulnerabilities in source code.",
    icon: <Code className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#sast",
  },
  "Security-Policy": {
    name: "Security-Policy",
    risk: "Medium",
    category: "holistic-security",
    question: "Does the project contain a security policy?",
    description: "A security policy helps users report vulnerabilities responsibly.",
    icon: <Shield className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#security-policy",
  },
  "Signed-Releases": {
    name: "Signed-Releases",
    risk: "High",
    category: "build-risk",
    question: "Does the project cryptographically sign releases?",
    description: "Signed releases help verify the integrity and authenticity of packages.",
    icon: <Lock className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#signed-releases",
  },
  "Token-Permissions": {
    name: "Token-Permissions",
    risk: "High",
    category: "build-risk",
    question: "Does the project declare GitHub workflow tokens as read only?",
    description: "Read-only tokens reduce the attack surface of compromised workflows.",
    icon: <Lock className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#token-permissions",
  },
  "Vulnerabilities": {
    name: "Vulnerabilities",
    risk: "High",
    category: "holistic-security",
    question: "Does the project have unfixed vulnerabilities?",
    description: "Uses the OSV service to check for known vulnerabilities.",
    icon: <AlertTriangle className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#vulnerabilities",
  },
  "Webhooks": {
    name: "Webhooks",
    risk: "Critical",
    category: "source-risk",
    question: "Does the webhook have a token configured to authenticate request origins?",
    description: "Webhook authentication prevents unauthorized requests.",
    icon: <Terminal className="w-4 h-4" />,
    documentation: "github.com/ossf/scorecard/blob/main/docs/checks.md#webhooks",
  },
};

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const riskWeights: Record<ScorecardRisk, number> = {
  Critical: 10,
  High: 7.5,
  Medium: 5,
  Low: 2.5,
};

function _calculateAggregateScore(checks: ScorecardCheck[]): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const check of checks) {
    if (check.score >= 0) {
      const weight = riskWeights[check.risk];
      totalWeight += weight;
      weightedScore += check.score * weight;
    }
  }

  return totalWeight > 0 ? weightedScore / totalWeight : 0;
}

function getScoreColor(score: number): string {
  if (score < 0) return "text-gray-400";
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBgColor(score: number): string {
  if (score < 0) return "bg-gray-100 dark:bg-gray-800";
  if (score >= 8) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 5) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

function getRiskColor(risk: ScorecardRisk): string {
  switch (risk) {
    case "Critical": return "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30";
    case "High": return "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30";
    case "Medium": return "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30";
    case "Low": return "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30";
  }
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD BADGE
// ═══════════════════════════════════════════════════════════════

interface ScorecardBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function ScorecardBadge({ score, size = "md", showLabel = true }: ScorecardBadgeProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-16 h-16 text-lg",
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} ${getScoreBgColor(score)} rounded-full flex items-center justify-center font-bold ${getScoreColor(score)}`}
      >
        {score < 0 ? "?" : score.toFixed(1)}
      </div>
      {showLabel && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          OpenSSF Scorecard
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RISK BADGE
// ═══════════════════════════════════════════════════════════════

interface RiskBadgeProps {
  risk: ScorecardRisk;
  size?: "sm" | "md";
}

export function RiskBadge({ risk, size = "sm" }: RiskBadgeProps) {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
  };

  return (
    <span
      className={`${sizeClasses[size]} ${getRiskColor(risk)} rounded-full font-medium`}
    >
      {risk}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHECK SCORE INDICATOR
// ═══════════════════════════════════════════════════════════════

interface CheckScoreProps {
  score: number;
  showLabel?: boolean;
}

export function CheckScore({ score, showLabel = false }: CheckScoreProps) {
  const getIcon = () => {
    if (score < 0) return <HelpCircle className="w-4 h-4 text-gray-400" />;
    if (score >= 8) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (score >= 5) return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  return (
    <div className="flex items-center gap-2">
      {getIcon()}
      <span className={`font-mono font-medium ${getScoreColor(score)}`}>
        {score < 0 ? "?" : `${score}/10`}
      </span>
      {showLabel && (
        <span className="text-sm text-gray-500">
          {score < 0 ? "Unknown" : score >= 8 ? "Good" : score >= 5 ? "Needs work" : "Poor"}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD CHECK CARD
// ═══════════════════════════════════════════════════════════════

interface ScorecardCheckCardProps {
  check: ScorecardCheck;
  expanded?: boolean;
  onToggle?: () => void;
}

export function ScorecardCheckCard({ check, expanded = false, onToggle }: ScorecardCheckCardProps) {
  const metadata = checkMetadata[check.name];

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-all ${
        check.score >= 8
          ? "border-green-200 dark:border-green-800"
          : check.score >= 5
          ? "border-yellow-200 dark:border-yellow-800"
          : check.score < 0
          ? "border-gray-200 dark:border-gray-700"
          : "border-red-200 dark:border-red-800"
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getScoreBgColor(check.score)}`}>
            {metadata.icon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {check.name}
              </span>
              <RiskBadge risk={check.risk} />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {metadata.question}
            </p>
          </div>
        </div>
        <CheckScore score={check.score} />
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {check.reason}
              </p>
            </div>

            {check.details && check.details.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Details
                </h4>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  {check.details.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <a
                href={`https://${metadata.documentation}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                View documentation <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY SUMMARY
// ═══════════════════════════════════════════════════════════════

interface CategorySummaryProps {
  category: CheckCategory;
  checks: ScorecardCheck[];
}

const categoryLabels: Record<CheckCategory, { label: string; description: string; icon: React.ReactNode }> = {
  "holistic-security": {
    label: "Holistic Security Practices",
    description: "Vulnerability management, testing, and security policies",
    icon: <Shield className="w-5 h-5" />,
  },
  "source-risk": {
    label: "Source Code Risk Assessment",
    description: "Code review, branch protection, and contributor analysis",
    icon: <Code className="w-5 h-5" />,
  },
  "build-risk": {
    label: "Build Process Risk Assessment",
    description: "Dependency pinning, signed releases, and token permissions",
    icon: <Package className="w-5 h-5" />,
  },
};

export function CategorySummary({ category, checks }: CategorySummaryProps) {
  const categoryInfo = categoryLabels[category];
  const avgScore = checks.length > 0
    ? checks.reduce((sum, c) => sum + (c.score >= 0 ? c.score : 0), 0) / checks.filter(c => c.score >= 0).length
    : 0;
  const passedCount = checks.filter(c => c.score >= 7).length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            {categoryInfo.icon}
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100">
              {categoryInfo.label}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {categoryInfo.description}
            </p>
          </div>
        </div>
        <ScorecardBadge score={avgScore} size="sm" showLabel={false} />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600 dark:text-gray-400">
          {passedCount}/{checks.length} checks passed
        </span>
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(passedCount / checks.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN SCORECARD PANEL
// ═══════════════════════════════════════════════════════════════

interface OpenSSFScorecardPanelProps {
  result: ScorecardResult;
  className?: string;
}

export function OpenSSFScorecardPanel({ result, className = "" }: OpenSSFScorecardPanelProps) {
  const [expandedChecks, setExpandedChecks] = React.useState<Set<string>>(new Set());

  const toggleCheck = (name: string) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const checksByCategory = useMemo(() => {
    const grouped: Record<CheckCategory, ScorecardCheck[]> = {
      "holistic-security": [],
      "source-risk": [],
      "build-risk": [],
    };

    for (const check of result.checks) {
      grouped[check.category].push(check);
    }

    return grouped;
  }, [result.checks]);

  const criticalCount = result.checks.filter(c => c.risk === "Critical" && c.score < 7).length;
  const highCount = result.checks.filter(c => c.risk === "High" && c.score < 7).length;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with aggregate score */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://raw.githubusercontent.com/ossf/scorecard/main/artwork/openssf_security_compressed.png"
                alt="OpenSSF Scorecard"
                className="h-8"
              />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                OpenSSF Scorecard
              </h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Security health metrics for {result.repo}
            </p>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>Commit: <code className="font-mono">{result.commit.slice(0, 7)}</code></span>
              <span>•</span>
              <span>Date: {new Date(result.date).toLocaleDateString()}</span>
              <span>•</span>
              <span>Scorecard {result.version}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-2 mb-2">
              <ScorecardBadge score={result.score} size="lg" showLabel={false} />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Aggregate Score</p>
          </div>
        </div>

        {/* Warnings */}
        {(criticalCount > 0 || highCount > 0) && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Security issues detected</span>
            </div>
            <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
              {criticalCount > 0 && `${criticalCount} critical `}
              {criticalCount > 0 && highCount > 0 && "and "}
              {highCount > 0 && `${highCount} high `}
              risk checks need attention
            </p>
          </div>
        )}
      </div>

      {/* Category Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(checksByCategory) as CheckCategory[]).map((category) => (
          <CategorySummary
            key={category}
            category={category}
            checks={checksByCategory[category]}
          />
        ))}
      </div>

      {/* Detailed Checks by Category */}
      {(Object.keys(checksByCategory) as CheckCategory[]).map((category) => (
        <div key={category}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {categoryLabels[category].label}
          </h3>
          <div className="space-y-2">
            {checksByCategory[category].map((check) => (
              <ScorecardCheckCard
                key={check.name}
                check={check}
                expanded={expandedChecks.has(check.name)}
                onToggle={() => toggleCheck(check.name)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Link to full results */}
      <div className="text-center pt-4">
        <a
          href={`https://scorecard.dev/viewer/?uri=${result.repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
        >
          View full results on scorecard.dev <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPACT SCORECARD WIDGET
// ═══════════════════════════════════════════════════════════════

interface ScorecardWidgetProps {
  score: number;
  repo?: string;
  checksCount?: number;
  passedCount?: number;
}

export function ScorecardWidget({ score, repo, checksCount = 18, passedCount }: ScorecardWidgetProps) {
  const passed = passedCount ?? Math.round((score / 10) * checksCount);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          OpenSSF Scorecard
        </span>
        <ScorecardBadge score={score} size="sm" showLabel={false} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Checks passed</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {passed}/{checksCount}
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500"
            }`}
            style={{ width: `${(passed / checksCount) * 100}%` }}
          />
        </div>
      </div>

      {repo && (
        <a
          href={`https://scorecard.dev/viewer/?uri=${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-xs text-blue-600 dark:text-blue-400 hover:underline text-center"
        >
          View details →
        </a>
      )}
    </div>
  );
}

export default OpenSSFScorecardPanel;

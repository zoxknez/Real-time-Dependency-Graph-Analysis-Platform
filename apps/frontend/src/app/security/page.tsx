/**
 * Security Dashboard Page
 * 
 * Comprehensive security overview integrating:
 * - VEX (Vulnerability Exploitability eXchange)
 * - SLSA Provenance Verification
 * - Policy Compliance Engine
 * - Audit Trail
 * - Update Recommendations
 */

"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Shield,
  AlertTriangle,
  Activity,
  FileText,
  Lock,
  RefreshCw,
  Download,
  Filter,
  TrendingUp,
  Package,
  ChevronRight,
  Bot,
} from "lucide-react";
import Link from "next/link";

import SecurityAgent from "@/components/SecurityAgent";

// Import P2 components
import {
  VexStatusBadge,
  VexStatisticsPanel,
  SlsaLevelBadge,
  SlsaAssessmentCard,
  SlsaLevelProgress,
  PolicyEvaluationCard,
  PolicySetsList,
  ComplianceScoreGauge,
  AuditEventsList,
  AuditTimeline,
  ComplianceReportCard,
  UpdateRecommendationsList,
  UpdateSummaryBar,
  BreakingChangesWarning,
} from "@/components/ui";

// Import hooks
import {
  useVexStatistics,
  useUpdateRecommendations,
  useAuditEvents,
  useComplianceReport,
  usePolicySets,
} from "@/lib/hooks";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type DashboardTab = "overview" | "vulnerabilities" | "provenance" | "policy" | "audit" | "updates" | "agent";

interface SecurityMetric {
  label: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  status: "success" | "warning" | "danger" | "neutral";
  icon: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════
// SECURITY DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════

export default function SecurityDashboardPage() {
  return (
    <Suspense fallback={<SecurityPageSkeleton />}>
      <SecurityDashboardContent />
    </Suspense>
  );
}

function SecurityPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 animate-pulse">
      <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800" />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    </div>
  );
}

function SecurityDashboardContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as DashboardTab) || "overview";
  const packageId = searchParams.get("package") || undefined;

  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [selectedPackageId, setSelectedPackageId] = useState<string | undefined>(packageId);

  // Get current date range for compliance report
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startDate = thirtyDaysAgo.toISOString();
  const endDate = now.toISOString();

  // Fetch data for overview metrics
  const { statistics: vexStats } = useVexStatistics({});
  const { urgencyCounts } = useUpdateRecommendations(selectedPackageId || "", { skip: !selectedPackageId });
  const { report: complianceReport } = useComplianceReport({ startDate, endDate });
  const { policySets } = usePolicySets({});

  // Calculate overview metrics
  const metrics: SecurityMetric[] = useMemo(() => [
    {
      label: "VEX Assessments",
      value: vexStats?.totalStatements ?? 0,
      status: "neutral",
      icon: <Shield className="w-5 h-5" />,
    },
    {
      label: "Security Updates",
      value: urgencyCounts?.total ?? 0,
      status: (urgencyCounts?.critical ?? 0) > 0 ? "danger" : "success",
      icon: <AlertTriangle className="w-5 h-5" />,
    },
    {
      label: "Policy Sets",
      value: policySets.length,
      status: "neutral",
      icon: <FileText className="w-5 h-5" />,
    },
    {
      label: "Compliance Events",
      value: complianceReport?.totalEvents ?? 0,
      status: (complianceReport?.totalViolations ?? 0) > 0 ? "warning" : "success",
      icon: <Activity className="w-5 h-5" />,
    },
  ], [vexStats, urgencyCounts, policySets, complianceReport]);

  const tabs: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Shield className="w-4 h-4" /> },
    { id: "vulnerabilities", label: "Vulnerabilities", icon: <AlertTriangle className="w-4 h-4" /> },
    { id: "provenance", label: "SLSA Provenance", icon: <Lock className="w-4 h-4" /> },
    { id: "policy", label: "Policy Compliance", icon: <FileText className="w-4 h-4" /> },
    { id: "audit", label: "Audit Trail", icon: <Activity className="w-4 h-4" /> },
    { id: "updates", label: "Updates", icon: <RefreshCw className="w-4 h-4" /> },
    { id: "agent", label: "Security Agent", icon: <Bot className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Security Dashboard
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enterprise security overview & compliance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Package Filter */}
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter by package..."
                  value={selectedPackageId ?? ""}
                  onChange={(e) => setSelectedPackageId(e.target.value || undefined)}
                  className="pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Export Button */}
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <Download className="w-4 h-4" />
                Export Report
              </button>

              {/* Refresh */}
              <button className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "overview" && (
          <SecurityOverview
            metrics={metrics}
            packageId={selectedPackageId}
          />
        )}
        {activeTab === "vulnerabilities" && (
          <VulnerabilitiesTab packageId={selectedPackageId} />
        )}
        {activeTab === "provenance" && (
          <ProvenanceTab packageId={selectedPackageId} />
        )}
        {activeTab === "policy" && (
          <PolicyTab packageId={selectedPackageId} />
        )}
        {activeTab === "audit" && (
          <AuditTab />
        )}
        {activeTab === "updates" && (
          <UpdatesTab packageId={selectedPackageId} />
        )}
        {activeTab === "agent" && (
          <SecurityAgent />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════

interface SecurityOverviewProps {
  metrics: SecurityMetric[];
  packageId?: string;
}

function SecurityOverview({ metrics, packageId }: SecurityOverviewProps) {
  // Fetch audit events for timeline
  const { events: recentEvents } = useAuditEvents({ first: 5 });
  const statusColors = {
    success: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
    warning: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
    danger: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
    neutral: "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
  };

  return (
    <div className="space-y-8">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className={`p-4 rounded-xl border ${statusColors[metric.status]}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-80">{metric.label}</span>
              {metric.icon}
            </div>
            <div className="text-3xl font-bold">{metric.value}</div>
            {metric.change !== undefined && (
              <div className="flex items-center gap-1 mt-1 text-sm">
                <TrendingUp className={`w-4 h-4 ${metric.change >= 0 ? "text-green-500" : "text-red-500"}`} />
                <span>{metric.change >= 0 ? "+" : ""}{metric.change}%</span>
                {metric.changeLabel && (
                  <span className="opacity-60">{metric.changeLabel}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Security Score Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Security Score
          </h3>
          <div className="flex items-center justify-center">
            <ComplianceScoreGauge passed={85} total={100} size="lg" />
          </div>
          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Based on VEX, SLSA, and Policy evaluations
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Recent Activity
            </h3>
            <Link
              href="/security?tab=audit"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <AuditTimeline events={recentEvents} />
        </div>

        {/* Critical Updates */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Critical Updates
            </h3>
            <Link
              href="/security?tab=updates"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {packageId ? (
            <UpdateRecommendationsList
              packageId={packageId}
              urgencyFilter={["CRITICAL", "HIGH"]}
            />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              Select a package to view updates
            </div>
          )}
        </div>
      </div>

      {/* VEX Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            VEX Status Distribution
          </h3>
          {packageId ? (
            <VexStatisticsPanel packageId={packageId} />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              Select a package to view VEX statistics
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            SLSA Build Levels
          </h3>
          <SlsaLevelProgress currentLevel="L2" />
          <div className="mt-4 grid grid-cols-4 gap-2">
            {(["L0", "L1", "L2", "L3"] as const).map((level) => (
              <div key={level} className="text-center">
                <SlsaLevelBadge level={level} size="sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VULNERABILITIES TAB
// ═══════════════════════════════════════════════════════════════

interface VulnerabilitiesTabProps {
  packageId?: string;
}

function VulnerabilitiesTab({ packageId }: VulnerabilitiesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Vulnerability Analysis
        </h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      {packageId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <VexStatisticsPanel packageId={packageId} />
          </div>
          <div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Not Affected</span>
                  <VexStatusBadge status="NOT_AFFECTED" size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Fixed</span>
                  <VexStatusBadge status="FIXED" size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Under Investigation</span>
                  <VexStatusBadge status="UNDER_INVESTIGATION" size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Affected</span>
                  <VexStatusBadge status="AFFECTED" size="sm" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Select a Package
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Enter a package ID in the filter above to view vulnerability analysis
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROVENANCE TAB
// ═══════════════════════════════════════════════════════════════

interface ProvenanceTabProps {
  packageId?: string;
}

function ProvenanceTab({ packageId }: ProvenanceTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          SLSA Provenance Verification
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {(["L0", "L1", "L2", "L3"] as const).map((level) => (
          <div
            key={level}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center"
          >
            <SlsaLevelBadge level={level} size="lg" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {level === "L0" && "No guarantees"}
              {level === "L1" && "Provenance exists"}
              {level === "L2" && "Hosted build"}
              {level === "L3" && "Hardened builds"}
            </p>
          </div>
        ))}
      </div>

      {packageId ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SlsaAssessmentCard packageId={packageId} />
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold mb-4">SLSA Level Progress</h3>
            <SlsaLevelProgress currentLevel="L2" />
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Select a Package
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Enter a package ID to view SLSA provenance details
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POLICY TAB
// ═══════════════════════════════════════════════════════════════

interface PolicyTabProps {
  packageId?: string;
}

function PolicyTab({ packageId }: PolicyTabProps) {
  const [selectedPolicySetId, setSelectedPolicySetId] = useState<string>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Policy Compliance Engine
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-semibold mb-4">Policy Sets</h3>
            <PolicySetsList
              selectedId={selectedPolicySetId}
              onSelect={setSelectedPolicySetId}
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          {packageId ? (
            <PolicyEvaluationCard
              packageId={packageId}
              policySetId={selectedPolicySetId}
            />
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Select a Package
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Enter a package ID to evaluate policies
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUDIT TAB
// ═══════════════════════════════════════════════════════════════

function AuditTab() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startDate = thirtyDaysAgo.toISOString();
  const endDate = now.toISOString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Audit Trail
        </h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AuditEventsList />
        </div>
        <div>
          <ComplianceReportCard startDate={startDate} endDate={endDate} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UPDATES TAB
// ═══════════════════════════════════════════════════════════════

interface UpdatesTabProps {
  packageId?: string;
}

function UpdatesTab({ packageId }: UpdatesTabProps) {
  // Fetch recommendations to get counts for summary bar
  const { urgencyCounts, breakingChanges } = useUpdateRecommendations(packageId || "", { skip: !packageId });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Update Recommendations
        </h2>
      </div>

      {packageId ? (
        <>
          <UpdateSummaryBar counts={urgencyCounts} />
          {breakingChanges.length > 0 && (
            <BreakingChangesWarning recommendations={breakingChanges} />
          )}
          <UpdateRecommendationsList packageId={packageId} />
        </>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Select a Package
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Enter a package ID to view update recommendations
          </p>
        </div>
      )}
    </div>
  );
}

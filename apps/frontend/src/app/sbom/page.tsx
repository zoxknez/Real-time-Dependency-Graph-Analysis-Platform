/**
 * SBOM (Software Bill of Materials) Page
 * 
 * Comprehensive SBOM management following CycloneDX 1.5 and SPDX 2.3 standards.
 * Features:
 * - SBOM generation and export
 * - Component inventory
 * - Dependency tree visualization
 * - License summary
 * - Vulnerability correlation
 */

"use client";

import React, { useState, useMemo, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Package,
  RefreshCw,
  Search,
  ChevronRight,
  AlertTriangle,
  Scale,
  GitBranch,
  Layers,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useGenerateSbom } from "@/lib/hooks";
import type { SbomEncoding, SbomFormat } from "@/lib/graphql/types";

// Import components
import {
  SbomExportButton,
  LicenseBadge,
  VexStatusBadge,
} from "@/components/ui";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type SbomTab = "components" | "dependencies" | "licenses" | "vulnerabilities";

interface SbomComponent {
  name: string;
  version: string;
  purl: string;
  ecosystem: string;
  license: string;
  directDependency: boolean;
  vulnerabilities: number | null;
  depth: number;
}

interface LicenseSummary {
  license: string;
  count: number;
  components: string[];
  category: "permissive" | "copyleft" | "weak-copyleft" | "proprietary" | "unknown";
}

// ═══════════════════════════════════════════════════════════════
// SBOM PAGE
// ═══════════════════════════════════════════════════════════════

export default function SbomPage() {
  return (
    <Suspense fallback={<SbomPageSkeleton />}>
      <SbomPageContent />
    </Suspense>
  );
}

function SbomPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 animate-pulse">
      <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800" />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl mb-6" />
        <div className="h-96 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    </div>
  );
}

function SbomPageContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as SbomTab) || "components";
  const initialPackageId =
    searchParams.get("packageId") || searchParams.get("package") || "";

  const [activeTab, setActiveTab] = useState<SbomTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [ecosystemFilter, setEcosystemFilter] = useState<string>("all");
  const [packageId, setPackageId] = useState(initialPackageId);
  const [packageInput, setPackageInput] = useState(initialPackageId);

  const { sbom, loading: sbomLoading, error: sbomError, generate, download } =
    useGenerateSbom(packageId);

  useEffect(() => {
    if (!packageId) return;
    generate({
      format: "CYCLONE_DX",
      encoding: "JSON",
      includeTransitive: true,
      includeVulnerabilities: false,
    });
  }, [packageId, generate]);

  useEffect(() => {
    if (!packageId || activeTab !== "vulnerabilities") return;
    const hasVulnSignal = components.some((c) => c.vulnerabilities !== null);
    if (hasVulnSignal) return;
    generate({
      format: "CYCLONE_DX",
      encoding: "JSON",
      includeTransitive: true,
      includeVulnerabilities: true,
    });
  }, [activeTab, components, generate, packageId]);

  const components = useMemo(
    () => parseSbomComponents(sbom?.content),
    [sbom?.content]
  );

  const licenseSummary = useMemo(
    () => buildLicenseSummary(components),
    [components]
  );

  // Filter components
  const filteredComponents = useMemo(() => {
    return components.filter((comp) => {
      const matchesSearch =
        searchQuery === "" ||
        comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        comp.purl.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEcosystem =
        ecosystemFilter === "all" || comp.ecosystem === ecosystemFilter;
      return matchesSearch && matchesEcosystem;
    });
  }, [components, searchQuery, ecosystemFilter]);

  // Summary stats
  const stats = useMemo(() => ({
    totalComponents: components.length,
    directDeps: components.filter((c) => c.directDependency).length,
    transitiveDeps: components.filter((c) => !c.directDependency).length,
    uniqueLicenses: new Set(components.map((c) => c.license)).size,
    vulnerableComponents: components.filter((c) => (c.vulnerabilities ?? 0) > 0).length,
  }), [components]);

  const tabs: { id: SbomTab; label: string; icon: React.ReactNode }[] = [
    { id: "components", label: "Components", icon: <Package className="w-4 h-4" /> },
    { id: "dependencies", label: "Dependency Tree", icon: <GitBranch className="w-4 h-4" /> },
    { id: "licenses", label: "Licenses", icon: <Scale className="w-4 h-4" /> },
    { id: "vulnerabilities", label: "Vulnerabilities", icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Layers className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  SBOM Management
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Software Bill of Materials • CycloneDX 1.5
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SbomExportButton
                projectName="my-project"
                projectVersion="1.0.0"
                disabled={!packageId || sbomLoading}
                onExport={async (format, encoding) => {
                  if (!packageId) return;
                  await generate({
                    format: format as SbomFormat,
                    encoding: encoding as SbomEncoding,
                    includeTransitive: true,
                    includeVulnerabilities: true,
                  });
                  download();
                }}
              />
              <button
                type="button"
                disabled={!packageId || sbomLoading}
                onClick={() =>
                  packageId &&
                  generate({
                    format: "CYCLONE_DX",
                    encoding: "JSON",
                    includeTransitive: true,
                    includeVulnerabilities: false,
                  })
                }
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
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
                    ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
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

      {/* Stats Banner */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              label="Total Components"
              value={stats.totalComponents}
              icon={<Package className="w-5 h-5" />}
              color="purple"
            />
            <StatCard
              label="Direct Dependencies"
              value={stats.directDeps}
              icon={<Layers className="w-5 h-5" />}
              color="blue"
            />
            <StatCard
              label="Transitive Dependencies"
              value={stats.transitiveDeps}
              icon={<GitBranch className="w-5 h-5" />}
              color="cyan"
            />
            <StatCard
              label="Unique Licenses"
              value={stats.uniqueLicenses}
              icon={<Scale className="w-5 h-5" />}
              color="green"
            />
            <StatCard
              label="Vulnerable"
              value={stats.vulnerableComponents}
              icon={<AlertTriangle className="w-5 h-5" />}
              color={stats.vulnerableComponents > 0 ? "red" : "green"}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search & Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Root package
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="npm:react or cargo:serde"
                value={packageInput}
                onChange={(e) => setPackageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPackageId(packageInput.trim());
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setPackageId(packageInput.trim())}
                disabled={!packageInput.trim()}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                Load
              </button>
            </div>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search components by name or PURL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <select
            value={ecosystemFilter}
            onChange={(e) => setEcosystemFilter(e.target.value)}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="all">All Ecosystems</option>
            <option value="NPM">NPM</option>
            <option value="CARGO">Cargo</option>
            <option value="PYPI">PyPI</option>
            <option value="MAVEN">Maven</option>
          </select>
        </div>

        {!packageId && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-500">
            Provide a root package to generate a live SBOM.
          </div>
        )}

        {packageId && sbomError && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-6 text-red-700 dark:text-red-300">
            Failed to generate SBOM. Please try again.
          </div>
        )}

        {packageId && !sbomError && (
          <>
            {activeTab === "components" && (
              <ComponentsTab components={filteredComponents} loading={sbomLoading} />
            )}
            {activeTab === "dependencies" && (
              <DependencyTreeTab components={filteredComponents} />
            )}
            {activeTab === "licenses" && (
              <LicensesTab licenses={licenseSummary} />
            )}
            {activeTab === "vulnerabilities" && (
              <VulnerabilitiesTab components={filteredComponents} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "purple" | "blue" | "cyan" | "green" | "red";
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
    cyan: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20",
    green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  };

  return (
    <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTS TAB
// ═══════════════════════════════════════════════════════════════

interface ComponentsTabProps {
  components: SbomComponent[];
  loading?: boolean;
}

function ComponentsTab({ components, loading = false }: ComponentsTabProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-gray-500">
        Generating SBOM...
      </div>
    );
  }

  if (!components.length) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-gray-500">
        No components found.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Component
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Version
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Ecosystem
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                License
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {components.map((comp, index) => (
              <tr
                key={index}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {comp.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {comp.purl}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                    {comp.version}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <EcosystemBadge ecosystem={comp.ecosystem} />
                </td>
                <td className="px-4 py-3">
                  <LicenseBadge license={comp.license || "Unknown"} size="sm" />
                </td>
                <td className="px-4 py-3">
                  {comp.directDependency ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      Direct
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      Transitive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {comp.vulnerabilities === null ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      Unknown
                    </span>
                  ) : comp.vulnerabilities > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                      <AlertTriangle className="w-3 h-3" />
                      {comp.vulnerabilities} vuln
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <CheckCircle2 className="w-3 h-3" />
                      Secure
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ECOSYSTEM BADGE
// ═══════════════════════════════════════════════════════════════

function EcosystemBadge({ ecosystem }: { ecosystem: string }) {
  const colors: Record<string, string> = {
    NPM: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    CARGO: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    PYPI: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    MAVEN: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    GO: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[ecosystem] || "bg-gray-100 text-gray-700"}`}>
      {ecosystem}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// DEPENDENCY TREE TAB
// ═══════════════════════════════════════════════════════════════

interface DependencyTreeTabProps {
  components: SbomComponent[];
}

function DependencyTreeTab({ components }: DependencyTreeTabProps) {
  const directDeps = components.filter((c) => c.directDependency);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="space-y-4">
        {directDeps.map((dep, index) => (
          <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-5 h-5 text-blue-500" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {dep.name}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                @{dep.version}
              </span>
              <EcosystemBadge ecosystem={dep.ecosystem} />
            </div>
            
            {/* Transitive dependencies */}
            <div className="ml-8 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-2 mt-3">
              {components
                .filter((c) => !c.directDependency && c.ecosystem === dep.ecosystem)
                .slice(0, 3)
                .map((transitive, tIndex) => (
                  <div key={tIndex} className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">{transitive.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 font-mono text-xs">
                      @{transitive.version}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LICENSES TAB
// ═══════════════════════════════════════════════════════════════

interface LicensesTabProps {
  licenses: LicenseSummary[];
}

function LicensesTab({ licenses }: LicensesTabProps) {
  const categoryColors = {
    permissive: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    copyleft: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    "weak-copyleft": "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
    proprietary: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    unknown: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  };

  const totalComponents = licenses.reduce((sum, l) => sum + l.count, 0);
  const totalForWidth = totalComponents === 0 ? 1 : totalComponents;

  if (licenses.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-gray-500">
        No license data available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* License Distribution Chart */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          License Distribution
        </h3>
        <div className="h-4 flex rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
          {licenses.map((license, index) => (
            <div
              key={index}
              className={`${categoryColors[license.category]}`}
              style={{ width: `${(license.count / totalForWidth) * 100}%` }}
              title={`${license.license}: ${license.count} components`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-4">
          {licenses.map((license, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div className={`w-3 h-3 rounded ${categoryColors[license.category]}`} />
              <span className="text-gray-600 dark:text-gray-400">
                {license.license} ({license.count})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* License List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                License
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Components
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {licenses.map((license, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {license.license}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[license.category]}`}>
                    {license.category}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-900 dark:text-gray-100">{license.count}</span>
                </td>
                <td className="px-4 py-3">
                  <button className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    View Components
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VULNERABILITIES TAB
// ═══════════════════════════════════════════════════════════════

interface VulnerabilitiesTabProps {
  components: SbomComponent[];
}

function VulnerabilitiesTab({ components }: VulnerabilitiesTabProps) {
  const vulnerableComponents = components.filter((c) => (c.vulnerabilities ?? 0) > 0);
  const hasSignal = components.some((c) => c.vulnerabilities !== null);

  if (!components.length) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
        <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No SBOM data
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Generate an SBOM to see vulnerability status.
        </p>
      </div>
    );
  }

  if (!hasSignal) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
        <CheckCircle2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Vulnerability data unavailable
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          SBOM generation did not include vulnerability data.
        </p>
      </div>
    );
  }

  if (vulnerableComponents.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No Vulnerabilities Found
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          All components in this SBOM are secure.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {vulnerableComponents.map((comp, index) => (
        <div
          key={index}
          className="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {comp.name}
                </span>
                <span className="text-gray-500 dark:text-gray-400 ml-2 font-mono text-sm">
                  @{comp.version}
                </span>
              </div>
            </div>
            <VexStatusBadge status="AFFECTED" size="sm" />
          </div>
          
          <div className="pl-8 space-y-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {comp.vulnerabilities} known vulnerability
            </div>
            <Link
              href={`/security?tab=vulnerabilities&package=${comp.purl}`}
              className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              View details <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SBOM PARSING HELPERS
// ═══════════════════════════════════════════════════════════════

function parseSbomComponents(content?: string | null): SbomComponent[] {
  if (!content) return [];
  try {
    const data = JSON.parse(content);
    if (data?.bomFormat === "CycloneDX") {
      return parseCycloneDxComponents(data);
    }
    if (data?.spdxVersion) {
      return parseSpdxComponents(data);
    }
  } catch {
    return [];
  }
  return [];
}

function parseCycloneDxComponents(data: any): SbomComponent[] {
  const components = Array.isArray(data?.components) ? data.components : [];
  const dependencyMap = new Set<string>();

  if (Array.isArray(data?.dependencies)) {
    const rootDep = data.dependencies.find((d: any) => d?.ref === "root");
    if (rootDep?.dependsOn) {
      for (const dep of rootDep.dependsOn) {
        if (typeof dep === "string") dependencyMap.add(dep);
      }
    }
  }

  return components
    .map((component: any) => {
      const purl = typeof component?.purl === "string" ? component.purl : "";
      const { ecosystem } = parsePurl(purl);
      const license = extractCycloneDxLicense(component) || "Unknown";
      const vulnCount = typeof component?.vulnerabilityCount === "number"
        ? component.vulnerabilityCount
        : null;
      const isDirect = dependencyMap.size
        ? dependencyMap.has(purl)
        : true;

      return {
        name: component?.name ?? "",
        version: component?.version ?? "",
        purl,
        ecosystem,
        license,
        directDependency: isDirect,
        vulnerabilities: vulnCount,
        depth: isDirect ? 1 : 2,
      };
    })
    .filter((component) => component.name);
}

function parseSpdxComponents(data: any): SbomComponent[] {
  const packages = Array.isArray(data?.packages) ? data.packages : [];
  return packages
    .filter((pkg: any) => pkg?.SPDXID !== "SPDXRef-Root")
    .map((pkg: any) => {
      const purl = typeof pkg?.purl === "string" ? pkg.purl : "";
      const { ecosystem } = parsePurl(purl);
      const license = typeof pkg?.licenseConcluded === "string" && pkg.licenseConcluded !== "NOASSERTION"
        ? pkg.licenseConcluded
        : "Unknown";

      return {
        name: pkg?.name ?? "",
        version: pkg?.versionInfo ?? "",
        purl,
        ecosystem,
        license,
        directDependency: true,
        vulnerabilities: null,
        depth: 1,
      };
    })
    .filter((component) => component.name);
}

function extractCycloneDxLicense(component: any): string | null {
  const licenses = component?.licenses;
  if (Array.isArray(licenses) && licenses.length > 0) {
    const entry = licenses[0];
    if (entry?.license?.id) return entry.license.id;
    if (entry?.license?.name) return entry.license.name;
  }
  return null;
}

function parsePurl(purl: string): { ecosystem: string } {
  if (!purl.startsWith("pkg:")) return { ecosystem: "UNKNOWN" };
  const trimmed = purl.replace("pkg:", "");
  const [ecoRaw] = trimmed.split("/");
  const ecosystem = (ecoRaw || "unknown").toUpperCase();
  return { ecosystem };
}

function buildLicenseSummary(components: SbomComponent[]): LicenseSummary[] {
  const licenseMap = new Map<string, LicenseSummary>();
  components.forEach((component) => {
    const license = component.license || "Unknown";
    const entry = licenseMap.get(license);
    if (entry) {
      entry.count += 1;
      entry.components.push(component.name);
    } else {
      licenseMap.set(license, {
        license,
        count: 1,
        components: [component.name],
        category: getLicenseCategory(license),
      });
    }
  });

  return Array.from(licenseMap.values()).sort((a, b) => b.count - a.count);
}

function getLicenseCategory(license: string): LicenseSummary["category"] {
  const normalized = license.toLowerCase();
  if (normalized.includes("gpl") || normalized.includes("agpl")) return "copyleft";
  if (normalized.includes("lgpl")) return "weak-copyleft";
  if (normalized.includes("mit") || normalized.includes("apache") || normalized.includes("bsd") || normalized.includes("isc")) {
    return "permissive";
  }
  if (normalized.includes("proprietary")) return "proprietary";
  return "unknown";
}

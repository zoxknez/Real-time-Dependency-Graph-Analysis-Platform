"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@apollo/client";
import { AlertTriangle, ExternalLink, GitBranch, Shield, Zap } from "lucide-react";
import {
  GET_PACKAGE,
  GET_PACKAGE_METADATA,
  GET_REVERSE_DEPENDENTS,
  GET_SCORECARD_SUMMARY,
  GET_VULNERABILITY_COUNTS,
} from "@/lib/graphql/queries";
import type {
  GetPackageResponse,
  GetPackageMetadataResponse,
  GetReverseDependentsResponse,
  GetScorecardSummaryResponse,
  GetVulnerabilityCountsResponse,
} from "@/lib/graphql/types";
import { DependencyGraph, type GraphData } from "@/components/graph/dependency-graph";
import { formatEcosystemName, getEcosystemColor, parsePackageId } from "@/lib/utils";

const registryLinks: Record<string, (name: string) => string> = {
  npm: (name) => `https://www.npmjs.com/package/${name}`,
  pypi: (name) => `https://pypi.org/project/${name}`,
  py_pi: (name) => `https://pypi.org/project/${name}`,
  cargo: (name) => `https://crates.io/crates/${name}`,
  maven: (name) => `https://mvnrepository.com/artifact/${name}`,
  nuget: (name) => `https://www.nuget.org/packages/${name}`,
  go: (name) => `https://pkg.go.dev/${name}`,
};

type PackageTab = "overview" | "graph" | "scorecard" | "supply";

const tabs: { id: PackageTab; label: string; description: string }[] = [
  { id: "overview", label: "Overview", description: "Key stats and actions" },
  { id: "graph", label: "Graph", description: "Reverse dependents map" },
  { id: "scorecard", label: "Scorecard", description: "OpenSSF summary" },
  { id: "supply", label: "Supply Chain", description: "SBOM and SLSA" },
];

const scorecardRiskStyles: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-200 border border-red-500/40",
  HIGH: "bg-orange-500/15 text-orange-200 border border-orange-500/40",
  MEDIUM: "bg-amber-500/15 text-amber-200 border border-amber-500/40",
  LOW: "bg-emerald-500/15 text-emerald-200 border border-emerald-500/40",
};

export default function PackageDetailPage() {
  const params = useParams();
  const ecosystemParam = decodeURIComponent(
    Array.isArray(params.ecosystem) ? params.ecosystem[0] ?? "" : params.ecosystem ?? ""
  );
  const nameParam = decodeURIComponent(
    Array.isArray(params.name) ? params.name[0] ?? "" : params.name ?? ""
  );

  const ecosystemKey = ecosystemParam.toUpperCase();
  const packageId = ecosystemParam && nameParam
    ? `${ecosystemParam}:${nameParam}`
    : ecosystemParam || nameParam || "";

  const registryLink = registryLinks[ecosystemParam.toLowerCase()]?.(nameParam);
  const accent = getEcosystemColor(ecosystemKey);
  const [activeTab, setActiveTab] = useState<PackageTab>("overview");

  const { data: packageData, loading: packageLoading } = useQuery<GetPackageResponse>(
    GET_PACKAGE,
    {
      variables: { id: packageId },
      skip: !packageId,
    }
  );

  const { data: metadataData } = useQuery<GetPackageMetadataResponse>(
    GET_PACKAGE_METADATA,
    {
      variables: { packageId },
      skip: !packageId,
    }
  );

  const scorecardTarget = metadataData?.packageMetadata?.scorecardTarget;

  const {
    data: scorecardData,
    loading: scorecardLoading,
    error: scorecardError,
  } = useQuery<GetScorecardSummaryResponse>(GET_SCORECARD_SUMMARY, {
    variables: { target: scorecardTarget ?? "" },
    skip: !scorecardTarget,
  });

  const { data: reverseData } = useQuery<GetReverseDependentsResponse>(
    GET_REVERSE_DEPENDENTS,
    {
      variables: { packageId, maxDepth: 1, first: 1 },
      skip: !packageId,
    }
  );

  const { data: graphDataRaw, loading: graphLoading } = useQuery<GetReverseDependentsResponse>(
    GET_REVERSE_DEPENDENTS,
    {
      variables: { packageId, maxDepth: 2, first: 60 },
      skip: !packageId || activeTab !== "graph",
    }
  );

  const { data: vulnData } = useQuery<GetVulnerabilityCountsResponse>(
    GET_VULNERABILITY_COUNTS,
    {
      variables: { packageId, includeTransitive: true },
      skip: !packageId,
    }
  );

  const latestVersion = metadataData?.packageMetadata?.latestVersion || "0.0.0";
  const license = metadataData?.packageMetadata?.license || "Unknown";
  const repositoryUrl = metadataData?.packageMetadata?.repositoryUrl;
  const reverseCount = reverseData?.reverseDependents?.totalCount ?? 0;
  const vulnCounts = vulnData?.vulnerabilityCounts ?? {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  const totalVulns =
    vulnCounts.critical + vulnCounts.high + vulnCounts.medium + vulnCounts.low;

  const scorecardSummary = scorecardData?.scorecardSummary;
  const scorecardViewerUrl = scorecardTarget
    ? `https://scorecard.dev/viewer/?uri=${encodeURIComponent(scorecardTarget)}`
    : "";

  const rootRiskLevel = useMemo<GraphData["nodes"][number]["riskLevel"]>(() => {
    if (vulnCounts.critical > 0) return "CRITICAL";
    if (vulnCounts.high > 0) return "HIGH";
    if (vulnCounts.medium > 0) return "MEDIUM";
    if (vulnCounts.low > 0) return "LOW";
    return undefined;
  }, [vulnCounts]);

  const graphEdges = graphDataRaw?.reverseDependents?.edges ?? [];
  const graphData = useMemo<GraphData>(() => {
    if (!packageId) {
      return { nodes: [], links: [] };
    }

    const nodesMap = new Map<string, GraphData["nodes"][number]>();
    const links: GraphData["links"] = [];
    const root = parsePackageId(packageId);

    nodesMap.set(packageId, {
      id: packageId,
      name: root.name,
      ecosystem: root.ecosystem.toUpperCase(),
      depth: 0,
      isRoot: true,
      hasVulnerabilities: totalVulns > 0,
      vulnerabilityCount: totalVulns,
      riskLevel: rootRiskLevel,
    });

    graphEdges.forEach((edge) => {
      const depth = edge.depth ?? 1;
      if (!nodesMap.has(edge.node.id)) {
        nodesMap.set(edge.node.id, {
          id: edge.node.id,
          name: edge.node.name,
          ecosystem: edge.node.ecosystem,
          depth,
        });
      }

      links.push({
        source: edge.node.id,
        target: packageId,
        type: depth > 1 ? "transitive" : "direct",
      });
    });

    return {
      nodes: Array.from(nodesMap.values()),
      links,
    };
  }, [graphEdges, packageId, rootRiskLevel, totalVulns]);

  const graphStats = useMemo(() => {
    if (!graphData.nodes.length) return null;
    const maxDepth = graphData.nodes.reduce((max, node) => Math.max(max, node.depth), 0);
    return {
      nodes: graphData.nodes.length,
      links: graphData.links.length,
      maxDepth,
    };
  }, [graphData]);

  const graphHasEdges = graphEdges.length > 0;

  const showNotFound = !packageLoading && packageId && !packageData?.package;
  const supplyChainUrl = packageId
    ? `/supply-chain?package=${encodeURIComponent(packageId)}`
    : "/supply-chain";

  return (
    <div className="min-h-screen bg-surface-950 text-white selection:bg-primary-500/30 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="glass-card p-6 border theme-border">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span
                  className="uppercase tracking-widest px-2 py-1 rounded-full border"
                  style={{ borderColor: `${accent}40`, color: accent }}
                >
                  {formatEcosystemName(ecosystemKey)}
                </span>
                <span className="theme-text-faint font-mono">
                  {packageId || "unknown"}
                </span>
              </div>
              <h1 data-testid="package-name" className="text-3xl font-bold mt-3">
                {nameParam || "Unknown package"}
              </h1>
              <p
                data-testid="package-description"
                className="text-sm theme-text-muted mt-2 max-w-2xl"
              >
                Package overview for {packageId || "this package"}. Use the links below
                to drill into dependency graphs, impact analysis, and supply-chain posture.
              </p>
              {showNotFound && (
                <div className="mt-4 inline-flex items-center gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4" />
                  Package not found in the graph yet. Showing registry metadata when available.
                </div>
              )}
            </div>

            <div className="flex flex-col items-start lg:items-end gap-3">
              <div className="text-xs theme-text-faint uppercase tracking-widest">Latest Version</div>
              <span
                data-testid="package-version"
                className="text-xl font-semibold theme-text-primary"
              >
                {latestVersion}
              </span>
              <div className="text-xs theme-text-muted">
                License: {" "}
                <span data-testid="package-license" className="theme-text-primary">
                  {license}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {registryLink && (
                  <a
                    href={registryLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1"
                  >
                    View on registry <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {repositoryUrl && (
                  <a
                    href={repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1"
                  >
                    Repository <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-2 border theme-border">
          <div role="tablist" aria-label="Package sections" className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`tab-panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col gap-1 px-4 py-2 rounded-lg border text-left transition-colors ${
                    isActive
                      ? "border-primary-500/40 bg-primary-500/15 text-primary-200"
                      : "border-transparent theme-text-muted hover:text-white hover:border-white/10 hover:bg-white/5"
                  }`}
                >
                  <span className="text-sm font-semibold">{tab.label}</span>
                  <span className="text-[11px] theme-text-faint">{tab.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          role="tabpanel"
          id={`tab-panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="glass-card p-6 border theme-border"
        >
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-card p-5 border theme-border">
                <h2 className="text-sm font-semibold theme-text-primary mb-2 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-accent-400" />
                  Reverse Dependents
                </h2>
                <p className="text-2xl font-bold theme-text-primary">{reverseCount}</p>
                <p className="text-xs theme-text-faint mt-1">Total packages depending on this package.</p>
              </div>

              <div className="glass-card p-5 border theme-border">
                <h2 className="text-sm font-semibold theme-text-primary mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-danger" />
                  Vulnerabilities
                </h2>
                <p className="text-2xl font-bold theme-text-primary">{totalVulns}</p>
                <div className="mt-2 text-xs theme-text-faint grid grid-cols-2 gap-y-1">
                  <span>Critical: {vulnCounts.critical}</span>
                  <span>High: {vulnCounts.high}</span>
                  <span>Medium: {vulnCounts.medium}</span>
                  <span>Low: {vulnCounts.low}</span>
                </div>
              </div>

              <div className="glass-card p-5 border theme-border">
                <h2 className="text-sm font-semibold theme-text-primary mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-warning" />
                  Install Command
                </h2>
                <p className="text-xs font-mono theme-text-muted break-all">
                  {ecosystemParam.toLowerCase() === "npm" ? "npm install " : "install "}
                  {nameParam || packageId}
                </p>
              </div>

              <div className="glass-card p-5 border theme-border">
                <h2 className="text-sm font-semibold theme-text-primary mb-3">Actions</h2>
                <div className="flex flex-col gap-2 text-sm">
                  <Link
                    href={packageId ? `/graph?pkg=${encodeURIComponent(packageId)}` : "/graph"}
                    className="theme-text-muted theme-hover-text transition-colors"
                  >
                    View dependency graph
                  </Link>
                  <Link
                    href={packageId ? `/impact?pkg=${encodeURIComponent(packageId)}` : "/impact"}
                    className="theme-text-muted theme-hover-text transition-colors"
                  >
                    Impact analysis
                  </Link>
                  <Link
                    href={supplyChainUrl}
                    className="theme-text-muted theme-hover-text transition-colors"
                  >
                    Supply chain dashboard
                  </Link>
                </div>
              </div>
            </div>
          )}

          {activeTab === "graph" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold theme-text-primary">
                    Dependency Graph Preview
                  </h2>
                  <p className="text-sm theme-text-muted">
                    Reverse dependents up to depth 2. Open the full graph for 3D view and exports.
                  </p>
                </div>
                <Link
                  href={packageId ? `/graph?pkg=${encodeURIComponent(packageId)}` : "/graph"}
                  className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  Open full graph
                </Link>
              </div>

              {graphLoading && (
                <div className="glass-card p-6 border theme-border theme-text-muted">
                  Loading graph data...
                </div>
              )}

              {!graphLoading && !graphHasEdges && (
                <div className="glass-card p-6 border theme-border theme-text-muted">
                  No reverse dependents found yet. Try the full graph view for deeper scans.
                </div>
              )}

              {!graphLoading && graphHasEdges && (
                <div className="glass-card p-4 border theme-border" data-testid="dependency-graph">
                  <div className="flex flex-wrap gap-4 text-xs theme-text-faint mb-3">
                    <span>Nodes: {graphStats?.nodes ?? graphData.nodes.length}</span>
                    <span>Edges: {graphStats?.links ?? graphData.links.length}</span>
                    {graphStats && <span>Max depth: {graphStats.maxDepth}</span>}
                  </div>
                  <DependencyGraph
                    data={graphData}
                    className="min-h-[420px]"
                    showLabels={graphData.nodes.length <= 25}
                    showVulnerabilities
                    colorByEcosystem
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "scorecard" && (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex-1 glass-card p-6 border theme-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold theme-text-primary">
                        OpenSSF Scorecard
                      </h2>
                      <p className="text-sm theme-text-muted mt-1">
                        Security checks for the source repository.
                      </p>
                    </div>
                    {scorecardSummary && (
                      <span
                        className={`text-xs uppercase tracking-widest px-2 py-1 rounded-full ${
                          scorecardRiskStyles[scorecardSummary.riskLevel] ??
                          "bg-white/5 text-white/70 border border-white/10"
                        }`}
                      >
                        {scorecardSummary.riskLevel}
                      </span>
                    )}
                  </div>

                  {scorecardTarget && (
                    <p className="text-xs theme-text-faint mt-3">
                      Target: {scorecardTarget}
                    </p>
                  )}

                  {!scorecardTarget && (
                    <p className="text-sm theme-text-muted mt-4">
                      No repository target detected yet. Add a GitHub repository to enable the
                      OpenSSF Scorecard summary.
                    </p>
                  )}

                  {scorecardTarget && scorecardLoading && (
                    <p className="text-sm theme-text-muted mt-4">Loading scorecard summary...</p>
                  )}

                  {scorecardTarget && !scorecardLoading && scorecardError && (
                    <p className="text-sm text-amber-200 mt-4">
                      Scorecard data is temporarily unavailable.
                    </p>
                  )}

                  {scorecardTarget && !scorecardLoading && !scorecardError && !scorecardSummary && (
                    <p className="text-sm theme-text-muted mt-4">
                      Scorecard data not available for this repository yet.
                    </p>
                  )}

                  {scorecardTarget && !scorecardLoading && scorecardSummary && (
                    <div className="mt-4 flex items-end gap-3">
                      <span className="text-4xl font-bold theme-text-primary">
                        {scorecardSummary.aggregateScore.toFixed(1)}
                      </span>
                      <span className="text-sm theme-text-faint">out of 10</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="glass-card p-4 border theme-border">
                    <div className="text-xs theme-text-faint uppercase">Checks passed</div>
                    <div className="text-2xl font-bold theme-text-primary">
                      {scorecardSummary?.passedChecks ?? "-"}
                    </div>
                  </div>
                  <div className="glass-card p-4 border theme-border">
                    <div className="text-xs theme-text-faint uppercase">Checks failed</div>
                    <div className="text-2xl font-bold theme-text-primary">
                      {scorecardSummary?.failedChecks ?? "-"}
                    </div>
                  </div>
                  <div className="glass-card p-4 border theme-border">
                    <div className="text-xs theme-text-faint uppercase">Critical issues</div>
                    <div className="text-2xl font-bold theme-text-primary">
                      {scorecardSummary?.criticalIssues ?? "-"}
                    </div>
                  </div>
                </div>
              </div>

              {scorecardTarget && (
                <div className="flex flex-wrap gap-3 text-sm">
                  <a
                    href={scorecardViewerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1"
                  >
                    View full scorecard <ExternalLink className="w-3 h-3" />
                  </a>
                  {repositoryUrl && (
                    <a
                      href={repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1"
                    >
                      Repository <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "supply" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold theme-text-primary">Supply Chain Workbench</h2>
                <p className="text-sm theme-text-muted mt-1">
                  Jump into the supply chain dashboard, SBOM tooling, and provenance checks for this
                  package.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  href={supplyChainUrl}
                  className="glass-card p-5 border theme-border theme-inner-card-hover transition-colors"
                >
                  <div className="text-xs theme-text-faint uppercase">Dashboard</div>
                  <div className="text-lg font-semibold theme-text-primary mt-2">
                    Supply Chain Overview
                  </div>
                  <p className="text-sm theme-text-muted mt-2">
                    OpenSSF Scorecard, OSV, SLSA, and SBOM views.
                  </p>
                </Link>

                <Link
                  href={packageId ? `/sbom?packageId=${encodeURIComponent(packageId)}` : "/sbom"}
                  className="glass-card p-5 border theme-border theme-inner-card-hover transition-colors"
                >
                  <div className="text-xs theme-text-faint uppercase">SBOM</div>
                  <div className="text-lg font-semibold theme-text-primary mt-2">
                    Generate SBOM
                  </div>
                  <p className="text-sm theme-text-muted mt-2">
                    Produce CycloneDX or SPDX for audit readiness.
                  </p>
                </Link>

                <Link
                  href={
                    packageId
                      ? `/supply-chain?view=slsa&package=${encodeURIComponent(packageId)}`
                      : "/supply-chain?view=slsa"
                  }
                  className="glass-card p-5 border theme-border theme-inner-card-hover transition-colors"
                >
                  <div className="text-xs theme-text-faint uppercase">SLSA</div>
                  <div className="text-lg font-semibold theme-text-primary mt-2">
                    Provenance Assessment
                  </div>
                  <p className="text-sm theme-text-muted mt-2">
                    Review build provenance, signatures, and policy gaps.
                  </p>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@apollo/client";
import { AlertTriangle, ExternalLink, GitBranch, Shield, Zap } from "lucide-react";
import {
  GET_PACKAGE,
  GET_PACKAGE_METADATA,
  GET_REVERSE_DEPENDENTS,
  GET_VULNERABILITY_COUNTS,
} from "@/lib/graphql/queries";
import type {
  GetPackageResponse,
  GetPackageMetadataResponse,
  GetReverseDependentsResponse,
  GetVulnerabilityCountsResponse,
} from "@/lib/graphql/types";
import { formatEcosystemName, getEcosystemColor } from "@/lib/utils";

const registryLinks: Record<string, (name: string) => string> = {
  npm: (name) => `https://www.npmjs.com/package/${name}`,
  pypi: (name) => `https://pypi.org/project/${name}`,
  py_pi: (name) => `https://pypi.org/project/${name}`,
  cargo: (name) => `https://crates.io/crates/${name}`,
  maven: (name) => `https://mvnrepository.com/artifact/${name}`,
  nuget: (name) => `https://www.nuget.org/packages/${name}`,
  go: (name) => `https://pkg.go.dev/${name}`,
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

  const { data: reverseData } = useQuery<GetReverseDependentsResponse>(
    GET_REVERSE_DEPENDENTS,
    {
      variables: { packageId, maxDepth: 1, first: 1 },
      skip: !packageId,
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
                href={`/graph?pkg=${encodeURIComponent(packageId)}`}
                className="theme-text-muted theme-hover-text transition-colors"
              >
                View dependency graph
              </Link>
              <Link
                href={`/impact?pkg=${encodeURIComponent(packageId)}`}
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
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo, Suspense, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useLazyQuery } from "@apollo/client";
import {
  Shield,
  AlertTriangle,
  Package,
  Zap,
  Loader2,
  ChevronRight,
  Target,
  Flame,
  TrendingUp,
  AlertOctagon,
  ExternalLink,
  Share2,
  Download,
  GitBranch,
  Copy,
  Check,
  FileJson,
  Sparkles,
} from "lucide-react";
import { GET_IMPACT_RADIUS } from "@/lib/graphql/queries";
import { cn, formatNumber, formatEcosystemName, getEcosystemColor, getEcosystemBadgeClass } from "@/lib/utils";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SkeletonCard, SkeletonText } from "@/components/ui/skeleton";
import { QueryError, EmptyState } from "@/components/ui/error-display";

// Severity thresholds
const getSeverity = (impactedPackages: number): { level: string; color: string; bgColor: string; icon: typeof Shield } => {
  if (impactedPackages >= 100) return { level: "CRITICAL", color: "text-red-500", bgColor: "bg-red-500/20", icon: AlertOctagon };
  if (impactedPackages >= 50) return { level: "HIGH", color: "text-orange-500", bgColor: "bg-orange-500/20", icon: AlertTriangle };
  if (impactedPackages >= 20) return { level: "MEDIUM", color: "text-yellow-500", bgColor: "bg-yellow-500/20", icon: Shield };
  if (impactedPackages >= 5) return { level: "LOW", color: "text-blue-500", bgColor: "bg-blue-500/20", icon: Shield };
  return { level: "MINIMAL", color: "text-green-500", bgColor: "bg-green-500/20", icon: Shield };
};

// Popular packages for quick analysis
const POPULAR_PACKAGES = [
  { id: "cargo:tokio", name: "tokio", ecosystem: "CARGO" },
  { id: "cargo:serde", name: "serde", ecosystem: "CARGO" },
  { id: "npm:lodash", name: "lodash", ecosystem: "NPM" },
  { id: "pypi:requests", name: "requests", ecosystem: "PYPI" },
  { id: "cargo:axum", name: "axum", ecosystem: "CARGO" },
];

function ImpactPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPkg = searchParams.get("pkg") || "";

  const [packageId, setPackageId] = useState(initialPkg);
  const [inputValue, setInputValue] = useState(initialPkg);
  const [versionRange, setVersionRange] = useState("");
  const [maxDepth, setMaxDepth] = useState(3);
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [getImpact, { data, loading, error }] = useLazyQuery(GET_IMPACT_RADIUS);

  // Auto-analyze if URL has package param
  useEffect(() => {
    if (initialPkg && !data && !loading) {
      getImpact({
        variables: {
          packageId: initialPkg,
          vulnerableVersionRange: null,
          maxDepth: 3,
          limit: 100,
        },
      });
    }
  }, [initialPkg, data, loading, getImpact]);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setPackageId(inputValue.trim());
      getImpact({
        variables: {
          packageId: inputValue.trim(),
          vulnerableVersionRange: versionRange || null,
          maxDepth,
          limit: 100,
        },
      });
      // Update URL
      router.push(`/impact?pkg=${encodeURIComponent(inputValue.trim())}`, { scroll: false });
    }
  };

  const analyzePackage = useCallback((pkgId: string) => {
    setPackageId(pkgId);
    setInputValue(pkgId);
    getImpact({
      variables: {
        packageId: pkgId,
        vulnerableVersionRange: null,
        maxDepth: 3,
        limit: 100,
      },
    });
    router.push(`/impact?pkg=${encodeURIComponent(pkgId)}`, { scroll: false });
  }, [getImpact, router]);

  const copyShareLink = useCallback(async () => {
    const url = `${window.location.origin}/impact?pkg=${encodeURIComponent(packageId)}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [packageId]);

  const navigateToGraph = useCallback((pkgId: string) => {
    router.push(`/graph?pkg=${encodeURIComponent(pkgId)}`);
  }, [router]);

  const impact = data?.impactRadius;

  // Calculate severity based on impact
  const severity = useMemo(() => {
    if (!impact) return null;
    return getSeverity(impact.impactedPackages);
  }, [impact]);

  const exportAsJSON = useCallback(() => {
    if (!impact) return;
    const report = {
      generatedAt: new Date().toISOString(),
      package: packageId,
      versionRange: versionRange || "all",
      severity: severity?.level,
      summary: {
        impactedPackages: impact.impactedPackages,
        impactedVersions: impact.impactedVersions,
        maxDepth: impact.maxDepth,
      },
      topImpacted: impact.topImpacted.map((item: any) => ({
        id: item.package.id,
        name: item.package.name,
        ecosystem: item.package.ecosystem,
        depth: item.depth,
        estimatedAffectedVersions: item.estimatedAffectedVersions,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impact-analysis-${packageId.replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [impact, packageId, versionRange, severity]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold theme-text-primary flex items-center gap-3">
          <Shield className="w-8 h-8 text-danger" />
          Impact Analysis
        </h1>
        <p className="theme-text-muted mt-1">
          Simulate CVE impact and assess vulnerability blast radius
        </p>
      </motion.div>

      {/* Input Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6"
      >
        <form onSubmit={handleAnalyze} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="text-sm theme-text-tertiary mb-2 block">
                Package ID
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g., cargo:tokio, pypi:requests"
                className="input-search"
              />
            </div>
            <div>
              <label className="text-sm theme-text-tertiary mb-2 block">
                Version Range (optional)
              </label>
              <input
                type="text"
                value={versionRange}
                onChange={(e) => setVersionRange(e.target.value)}
                placeholder="e.g., >=1.0.0 <2.0.0"
                className="input-search"
              />
            </div>
            <div>
              <label className="text-sm theme-text-tertiary mb-2 block">
                Max Depth
              </label>
              <select
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                className="input-search"
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d} level{d > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5" />
              )}
              Analyze Impact
            </button>
            
            {/* Quick Analysis Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs theme-text-faint flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Quick:
              </span>
              {POPULAR_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => analyzePackage(pkg.id)}
                  className="px-3 py-1.5 text-xs rounded-lg theme-inner-card theme-inner-card-hover 
                           theme-text-tertiary theme-hover-text transition-colors theme-border 
                           hover:border-primary-500/30 flex items-center gap-1.5"
                  style={{ borderColor: `${getEcosystemColor(pkg.ecosystem)}30` }}
                >
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: getEcosystemColor(pkg.ecosystem) }}
                  />
                  {pkg.name}
                </button>
              ))}
            </div>
          </div>
        </form>
      </motion.div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Skeleton Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
            {/* Skeleton List */}
            <div className="glass-card p-6 space-y-3">
              <div className="h-6 w-48 theme-skeleton rounded animate-pulse" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 theme-skeleton rounded-xl animate-pulse" />
              ))}
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <QueryError
              error={error}
              onRetry={() => packageId && getImpact({
                variables: {
                  packageId,
                  vulnerableVersionRange: versionRange || null,
                  maxDepth,
                  limit: 100,
                },
              })}
            />
          </motion.div>
        )}

        {impact && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Severity Banner */}
            {severity && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn("glass-card p-4 flex items-center gap-4", severity.bgColor)}
              >
                <severity.icon className={cn("w-8 h-8", severity.color)} />
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className={cn("text-lg font-bold", severity.color)}>
                      {severity.level} SEVERITY
                    </span>
                    <span className="theme-text-muted">|</span>
                    <span className="theme-text-tertiary">
                      {impact.impactedPackages} packages potentially affected
                    </span>
                  </div>
                  <p className="text-sm theme-text-muted mt-1">
                    A vulnerability in <span className="font-mono theme-text-primary">{packageId}</span> could cascade to dependent packages up to {impact.maxDepth} levels deep.
                  </p>
                </div>
                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateToGraph(packageId)}
                    className="p-2 rounded-lg theme-inner-card theme-inner-card-hover transition-colors"
                    title="View in Graph"
                  >
                    <GitBranch className="w-5 h-5 text-primary-400" />
                  </button>
                  <button
                    onClick={copyShareLink}
                    className="p-2 rounded-lg theme-inner-card theme-inner-card-hover transition-colors"
                    title="Copy share link"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-success" />
                    ) : (
                      <Share2 className="w-5 h-5 theme-text-muted" />
                    )}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="p-2 rounded-lg theme-inner-card theme-inner-card-hover transition-colors"
                      title="Export report"
                    >
                      <Download className="w-5 h-5 theme-text-muted" />
                    </button>
                    <AnimatePresence>
                      {showExportMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute top-full right-0 mt-2 glass-card py-2 min-w-[160px] z-50"
                        >
                          <button
                            onClick={exportAsJSON}
                            className="w-full px-4 py-2 flex items-center gap-3 text-sm theme-text-tertiary 
                                     theme-hover-text theme-inner-card-hover transition-colors"
                          >
                            <FileJson className="w-4 h-4" />
                            Export as JSON
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Impact Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-6 border-danger/30 group hover:border-danger/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-danger/20 group-hover:scale-110 transition-transform">
                    <Flame className="w-6 h-6 text-danger" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold theme-text-primary">
                      <AnimatedCounter value={impact.impactedPackages} />
                    </p>
                    <p className="text-sm theme-text-muted">Impacted Packages</p>
                  </div>
                </div>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-6 border-warning/30 group hover:border-warning/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-warning/20 group-hover:scale-110 transition-transform">
                    <Package className="w-6 h-6 text-warning" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold theme-text-primary">
                      <AnimatedCounter value={impact.impactedVersions} />
                    </p>
                    <p className="text-sm theme-text-muted">Impacted Versions</p>
                  </div>
                </div>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card p-6 border-primary-500/30 group hover:border-primary-500/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary-500/20 group-hover:scale-110 transition-transform">
                    <Target className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold theme-text-primary">{impact.maxDepth}</p>
                    <p className="text-sm theme-text-muted">Max Depth Analyzed</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Top Impacted Packages */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold theme-text-primary mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Top Impacted Packages
                <span className="ml-auto text-sm font-normal theme-text-muted">
                  Showing top {Math.min(impact.topImpacted.length, 10)} of{" "}
                  <AnimatedCounter value={impact.impactedPackages} duration={0.5} /> packages
                </span>
              </h3>
              <div className="space-y-2">
                {impact.topImpacted.map((item: any, index: number) => {
                  const depthColor = item.depth === 1 
                    ? "text-red-400" 
                    : item.depth === 2 
                      ? "text-orange-400" 
                      : "text-yellow-400";
                  
                  return (
                    <motion.div
                      key={item.package.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-4 p-4 rounded-xl theme-inner-card theme-inner-card-hover 
                               transition-all group border border-transparent hover:border-primary-500/30"
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition-transform group-hover:scale-110"
                        style={{
                          backgroundColor:
                            index === 0
                              ? "rgba(239, 68, 68, 0.2)"
                              : index === 1
                              ? "rgba(245, 158, 11, 0.2)"
                              : index === 2
                              ? "rgba(234, 179, 8, 0.2)"
                              : "rgba(100, 116, 139, 0.2)",
                          color:
                            index === 0
                              ? "#ef4444"
                              : index === 1
                              ? "#f59e0b"
                              : index === 2
                              ? "#eab308"
                              : "#64748b",
                        }}
                      >
                        {index + 1}
                      </div>
                      <div
                        className="w-3 h-3 rounded-full ring-2 ring-white/10"
                        style={{ backgroundColor: getEcosystemColor(item.package.ecosystem) }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium theme-text-primary truncate group-hover:text-primary-400 transition-colors">
                          {item.package.name}
                        </p>
                        <p className="text-xs theme-text-muted font-mono truncate">
                          {item.package.id}
                        </p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            getEcosystemBadgeClass(item.package.ecosystem)
                          )}
                        >
                          {formatEcosystemName(item.package.ecosystem)}
                        </span>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className={cn("text-sm font-semibold", depthColor)}>
                          Depth {item.depth}
                        </p>
                        {item.estimatedAffectedVersions && (
                          <p className="text-xs theme-text-muted">
                            ~<AnimatedCounter value={item.estimatedAffectedVersions} duration={0.5} /> versions
                          </p>
                        )}
                      </div>
                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigateToGraph(item.package.id)}
                          className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                          title="View in Graph"
                        >
                          <GitBranch className="w-4 h-4 text-primary-400" />
                        </button>
                        <a
                          href={`/explore?q=${encodeURIComponent(item.package.id)}`}
                          className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                          title="View Details"
                        >
                          <ExternalLink className="w-4 h-4 theme-text-muted" />
                        </a>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Visual Impact Rings with Depth Breakdown */}
            <div className="glass-card p-8">
              <h3 className="text-lg font-semibold theme-text-primary mb-6 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary-400" />
                Impact Visualization
              </h3>
              <div className="flex items-center justify-between gap-8">
                {/* Rings */}
                <div className="relative w-72 h-72 flex-shrink-0">
                  {[3, 2, 1, 0].map((ring) => {
                    const depthPackages = impact.topImpacted.filter((i: any) => i.depth === ring + 1).length;
                    return (
                      <motion.div
                        key={ring}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: (3 - ring) * 0.2, duration: 0.5 }}
                        className="absolute inset-0 rounded-full border-2 flex items-start justify-center pt-2"
                        style={{
                          borderColor:
                            ring === 0
                              ? "rgba(239, 68, 68, 0.8)"
                              : ring === 1
                              ? "rgba(245, 158, 11, 0.5)"
                              : ring === 2
                              ? "rgba(99, 102, 241, 0.3)"
                              : "rgba(100, 116, 139, 0.2)",
                          transform: `scale(${0.25 + ring * 0.25})`,
                        }}
                      >
                        {ring > 0 && depthPackages > 0 && (
                          <span 
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: ring === 1 ? "rgba(245, 158, 11, 0.3)" : ring === 2 ? "rgba(99, 102, 241, 0.3)" : "rgba(100, 116, 139, 0.3)",
                              color: ring === 1 ? "#f59e0b" : ring === 2 ? "#818cf8" : "#94a3b8",
                            }}
                          >
                            {depthPackages}
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Shield className="w-10 h-10 text-danger mx-auto mb-1" />
                      <p className="text-xs font-medium theme-text-primary">Vulnerable</p>
                      <p className="text-[10px] theme-text-muted max-w-[80px] truncate">{packageId}</p>
                    </div>
                  </div>
                </div>
                
                {/* Depth Breakdown Stats */}
                <div className="flex-1 space-y-3">
                  <h4 className="text-sm font-medium theme-text-tertiary mb-4">Depth Breakdown</h4>
                  {[1, 2, 3].map((depth) => {
                    const count = impact.topImpacted.filter((i: any) => i.depth === depth).length;
                    const percentage = impact.topImpacted.length > 0 
                      ? Math.round((count / impact.topImpacted.length) * 100) 
                      : 0;
                    const colors = depth === 1 
                      ? { bar: "#ef4444", bg: "rgba(239, 68, 68, 0.2)" }
                      : depth === 2 
                      ? { bar: "#f59e0b", bg: "rgba(245, 158, 11, 0.2)" }
                      : { bar: "#818cf8", bg: "rgba(129, 140, 248, 0.2)" };
                    
                    return (
                      <div key={depth} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="theme-text-muted">Depth {depth}</span>
                          <span className="font-medium" style={{ color: colors.bar }}>
                            {count} packages ({percentage}%)
                          </span>
                        </div>
                        <div 
                          className="h-2 rounded-full overflow-hidden"
                          style={{ backgroundColor: colors.bg }}
                        >
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ delay: depth * 0.2, duration: 0.5 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: colors.bar }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Total */}
                  <div className="pt-3 mt-3 border-t theme-border">
                    <div className="flex items-center justify-between">
                      <span className="theme-text-tertiary font-medium">Total Impacted</span>
                      <span className="text-2xl font-bold theme-text-primary">
                        <AnimatedCounter value={impact.impactedPackages} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!impact && !loading && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-12 text-center"
        >
          <Shield className="w-16 h-16 theme-text-faint mx-auto mb-4" />
          <h3 className="text-xl font-semibold theme-text-primary mb-2">
            Analyze Vulnerability Impact
          </h3>
          <p className="theme-text-muted max-w-md mx-auto">
            Enter a package ID to simulate a CVE and see how many packages would be
            affected by a vulnerability in that package.
          </p>
        </motion.div>
      )}
    </div>
  );
}

export default function ImpactPage() {
  return (
    <Suspense fallback={
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    }>
      <ImpactPageContent />
    </Suspense>
  );
}

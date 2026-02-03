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
  Target,
  Flame,
  AlertOctagon,
  ExternalLink,
  Share2,
  Download,
  GitBranch,
  Check,
  FileJson,
  Search,
} from "lucide-react";
import { GET_IMPACT_RADIUS } from "@/lib/graphql/queries";
import { cn, formatEcosystemName, getEcosystemColor, getEcosystemBadgeClass } from "@/lib/utils";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/error-display";
import type { ImpactNode } from "@/lib/graphql/types";

// Severity thresholds
const getSeverity = (impactedPackages: number): {
  level: string;
  color: string;
  bgColor: string;
  icon: typeof Shield;
  ringColor: string;
  glowColor: string;
} => {
  if (impactedPackages >= 100) return {
    level: "CRITICAL",
    color: "text-red-500",
    bgColor: "bg-red-500/20",
    icon: AlertOctagon,
    ringColor: "border-red-500/50",
    glowColor: "rgba(239, 68, 68, 0.5)"
  };
  if (impactedPackages >= 50) return {
    level: "HIGH",
    color: "text-orange-500",
    bgColor: "bg-orange-500/20",
    icon: AlertTriangle,
    ringColor: "border-orange-500/50",
    glowColor: "rgba(245, 158, 11, 0.5)"
  };
  if (impactedPackages >= 20) return {
    level: "MEDIUM",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/20",
    icon: Shield,
    ringColor: "border-yellow-500/50",
    glowColor: "rgba(234, 179, 8, 0.5)"
  };
  if (impactedPackages >= 5) return {
    level: "LOW",
    color: "text-blue-500",
    bgColor: "bg-blue-500/20",
    icon: Shield,
    ringColor: "border-blue-500/50",
    glowColor: "rgba(59, 130, 246, 0.5)"
  };
  return {
    level: "MINIMAL",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/20",
    icon: Shield,
    ringColor: "border-emerald-500/50",
    glowColor: "rgba(16, 185, 129, 0.5)"
  };
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

  const initialVersion = searchParams.get("version") || "";
  const initialDepth = Number(searchParams.get("depth")) || 3;

  const [packageId, setPackageId] = useState(initialPkg);
  const [inputValue, setInputValue] = useState(initialPkg);
  const [versionRange, setVersionRange] = useState(initialVersion);
  const [maxDepth, setMaxDepth] = useState(initialDepth);
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

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
      // Update URL with all params
      const params = new URLSearchParams();
      params.set("pkg", inputValue.trim());
      if (versionRange) params.set("version", versionRange);
      if (maxDepth !== 3) params.set("depth", maxDepth.toString());

      router.push(`/impact?${params.toString()}`, { scroll: false });
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
      topImpacted: impact.topImpacted.map((item: ImpactNode) => ({
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
        className="mb-8"
      >
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 rounded-2xl bg-danger/10 border border-danger/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <Shield className="w-8 h-8 text-danger animate-pulse" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white flex items-center gap-3">
              Impact Analysis
              <span className="text-sm font-medium px-2 py-0.5 rounded-md bg-danger/20 text-danger border border-danger/30 uppercase tracking-widest">
                Beta
              </span>
            </h1>
            <p className="text-slate-400 mt-1 text-lg">
              Simulate CVE impact and assess vulnerability blast radius
            </p>
          </div>
        </div>
      </motion.div>

      {/* Command Console Input Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative z-20 max-w-5xl mx-auto"
      >
        <div className={cn(
          "relative rounded-2xl transition-all duration-300 overflow-hidden",
          isInputFocused
            ? "bg-slate-900/80 ring-2 ring-primary-500/50 shadow-[0_0_40px_rgba(37,99,235,0.2)]"
            : "bg-slate-900/40 border border-white/5 hover:bg-slate-900/60"
        )}>
          {/* Glass sheen */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          <form onSubmit={handleAnalyze} className="p-2 flex flex-col md:flex-row gap-2 relative z-10">
            {/* Package ID Input */}
            <div className="flex-1 relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary-400 transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="Enter package ID (e.g., npm:react)"
                className="w-full h-14 pl-12 pr-4 bg-transparent border-none outline-none text-white placeholder:text-slate-600 font-mono text-sm focus:ring-0"
              />
            </div>

            <div className="h-px md:h-14 w-full md:w-px bg-white/5" />

            {/* Version Range Input */}
            <div className="w-full md:w-64 relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-warning transition-colors">
                <GitBranch className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={versionRange}
                onChange={(e) => setVersionRange(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="Version range (optional)"
                className="w-full h-14 pl-12 pr-4 bg-transparent border-none outline-none text-warning placeholder:text-slate-600 font-mono text-sm focus:ring-0"
              />
            </div>

            <div className="h-px md:h-14 w-full md:w-px bg-white/5" />

            {/* Depth Selector */}
            <div className="w-full md:w-48 relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary-400 transition-colors">
                <Target className="w-5 h-5" />
              </div>
              <select
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full h-14 pl-12 pr-10 bg-transparent border-none outline-none text-primary-300 font-mono text-sm appearance-none cursor-pointer focus:ring-0"
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d} className="bg-slate-900 text-white">
                    {d} Level{d > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="h-14 px-8 rounded-xl bg-primary-600 hover:bg-primary-500 
                       text-white font-bold shadow-lg shadow-primary-500/20 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-white" />
                  <span className="hidden lg:inline">ANALYZE</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Quick Prompts */}
        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-500">
          <span className="font-semibold uppercase tracking-wider">Examples:</span>
          {POPULAR_PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => analyzePackage(pkg.id)}
              className="px-2 py-1 rounded-md hover:bg-white/5 hover:text-primary-300 transition-colors"
            >
              {pkg.id}
            </button>
          ))}
        </div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>

            {/* Skeleton Borehole */}
            <div className="glass-card p-10 flex flex-col xl:flex-row items-center gap-12">
              <div className="flex-1 space-y-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-full" />
                <div className="space-y-4 pt-4">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              </div>
              <div className="relative w-[400px] h-[400px] flex items-center justify-center">
                <Skeleton className="absolute inset-0 rounded-full opacity-20" />
                <Skeleton className="w-[300px] h-[300px] rounded-full opacity-40" />
                <Skeleton className="w-[200px] h-[200px] rounded-full opacity-60" />
                <Skeleton className="w-24 h-24 rounded-full" />
              </div>
            </div>

            {/* Skeleton List */}
            <div className="glass-card p-8 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-32 rounded-xl" />
              </div>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5">
                  <Skeleton className="w-12 h-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="w-24 h-8 rounded-lg" />
                  <Skeleton className="w-32 h-10 rounded-xl" />
                </div>
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
                initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                className={cn(
                  "glass-card p-6 flex flex-col md:flex-row items-center gap-6 border border-white/5 shadow-2xl relative overflow-hidden",
                  "before:absolute before:inset-0 before:opacity-[0.03] before:bg-[radial-gradient(circle_at_50%_50%,#fff,transparent)]"
                )}
              >
                {/* Background glow effect based on severity */}
                <div
                  className="absolute inset-0 opacity-[0.15] pointer-events-none blur-[100px]"
                  style={{
                    background: `radial-gradient(circle at 10% 50%, ${severity.color === 'text-red-500' ? '#ef4444' : severity.color === 'text-orange-500' ? '#f59e0b' : severity.color === 'text-yellow-500' ? '#eab308' : '#3b82f6'}, transparent 60%)`
                  }}
                />

                <div className={cn(
                  "relative z-10 p-5 rounded-[2rem] shadow-inner flex items-center justify-center",
                  severity.bgColor.replace('/20', '/30'),
                  "border border-white/5"
                )}>
                  <severity.icon className={cn("w-12 h-12 drop-shadow-[0_0_10px_currentColor]", severity.color)} />
                </div>

                <div className="flex-1 relative z-10 text-center md:text-left">
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                    <span className={cn("text-2xl font-black tracking-tighter uppercase italic", severity.color)}>
                      {severity.level} Risk Profile
                    </span>
                    <div className="hidden md:block w-1.5 h-1.5 rounded-full bg-white/20" />
                    <div className="flex items-center gap-2 text-white font-bold text-lg">
                      <AnimatedCounter value={impact.impactedPackages} />
                      <span className="opacity-80">Ecosystem Blast Radius</span>
                    </div>
                  </div>
                  <p className="text-slate-400 leading-relaxed max-w-3xl">
                    Potential security cascade in <span className="font-mono text-primary-400 font-bold px-2 py-0.5 rounded bg-white/5 border border-white/10">{packageId}</span>
                    could affect critical infrastructure up to <span className="text-white font-bold">{impact.maxDepth} levels</span> deep.
                    Analysis suggests <span className={cn("font-bold", severity.color)}>{severity.level.toLowerCase()} prioritization</span> for patching.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 relative z-10">
                  <button
                    onClick={() => navigateToGraph(packageId)}
                    className="group/btn relative p-4 rounded-2xl bg-white/5 border border-white/10 
                             hover:bg-primary-500/10 hover:border-primary-500/30 transition-all duration-300 hover:scale-110"
                    title="Visualize full dependency path"
                  >
                    <GitBranch className="w-6 h-6 text-primary-400 group-hover/btn:rotate-12 transition-transform" />
                  </button>
                  <button
                    onClick={copyShareLink}
                    className="group/btn relative p-4 rounded-2xl bg-white/5 border border-white/10 
                             hover:bg-success/10 hover:border-success/30 transition-all duration-300 hover:scale-110"
                    title="Copy analysis URL"
                  >
                    {copied ? (
                      <Check className="w-6 h-6 text-success animate-bounce" />
                    ) : (
                      <Share2 className="w-6 h-6 text-slate-400 group-hover/btn:-rotate-12 transition-transform" />
                    )}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="group/btn relative p-4 rounded-2xl bg-white/5 border border-white/10 
                               hover:bg-warning/10 hover:border-warning/30 transition-all duration-300 hover:scale-110"
                      title="Download JSON report"
                    >
                      <Download className="w-6 h-6 text-slate-400 group-hover/btn:translate-y-0.5 transition-transform" />
                    </button>
                    <AnimatePresence>
                      {showExportMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute top-full right-0 mt-3 glass-card py-2 min-w-[220px] z-50 shadow-2xl 
                                   border-white/10 before:absolute before:-top-2 before:right-6 before:w-4 
                                   before:h-4 before:bg-slate-900 before:border-l before:border-t 
                                   before:border-white/10 before:rotate-45"
                        >
                          <button
                            onClick={exportAsJSON}
                            className="w-full px-5 py-4 flex items-center gap-4 text-sm text-slate-300 
                                     hover:text-white hover:bg-white/5 transition-all font-semibold"
                          >
                            <div className="p-2 rounded-lg bg-warning/10">
                              <FileJson className="w-4 h-4 text-warning" />
                            </div>
                            Export RAW JSON
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Impact Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-8 border-danger/20 group hover:border-danger/40 transition-all duration-500 
                         before:absolute before:inset-0 before:bg-gradient-to-br before:from-danger/5 before:to-transparent before:opacity-0 hover:before:opacity-100"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-4xl font-extrabold text-white tracking-tighter">
                      <AnimatedCounter value={impact.impactedPackages} />
                    </p>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      Packages At Risk
                      <div className="w-1.5 h-1.5 rounded-full bg-danger animate-ping" />
                    </p>
                  </div>
                  <div className="p-4 rounded-[1.5rem] bg-danger/10 border border-danger/20 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 shadow-lg">
                    <Flame className="w-8 h-8 text-danger drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-8 border-warning/20 group hover:border-warning/40 transition-all duration-500
                         before:absolute before:inset-0 before:bg-gradient-to-br before:from-warning/5 before:to-transparent before:opacity-0 hover:before:opacity-100"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-4xl font-extrabold text-white tracking-tighter">
                      <AnimatedCounter value={impact.impactedVersions} />
                    </p>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Version Blast Area</p>
                  </div>
                  <div className="p-4 rounded-[1.5rem] bg-warning/10 border border-warning/20 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 shadow-lg">
                    <Package className="w-8 h-8 text-warning drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card p-8 border-primary-500/20 group hover:border-primary-500/40 transition-all duration-500
                         before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary-500/5 before:to-transparent before:opacity-0 hover:before:opacity-100"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-4xl font-extrabold text-white tracking-tighter">{impact.maxDepth}</p>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Max Reach Levels</p>
                  </div>
                  <div className="p-4 rounded-[1.5rem] bg-primary-500/10 border border-primary-500/20 group-hover:scale-110 transition-all duration-500 shadow-lg">
                    <Target className="w-8 h-8 text-primary-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Top Impacted Packages */}
            <div className="glass-card p-8 border-white/5 shadow-2xl relative overflow-hidden group">
              {/* Subtle background glow */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 blur-[100px] pointer-events-none" />

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-warning/10 border border-warning/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                    <AlertTriangle className="w-6 h-6 text-warning animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Top Impacted Entities</h3>
                    <p className="text-sm text-slate-400 font-medium">Critical nodes within the identified blast radius</p>
                  </div>
                </div>
                <div className="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3 backdrop-blur-md">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Visibility</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                  <span className="text-sm font-black text-white">
                    {Math.min(impact.topImpacted.length, 10)} / <AnimatedCounter value={impact.impactedPackages} duration={0.8} />
                  </span>
                </div>
              </div>

              <div className="grid gap-3 relative z-10">
                {impact.topImpacted.slice(0, 10).map((item: ImpactNode, index: number) => {
                  const depthColor = item.depth === 1
                    ? "text-red-400"
                    : item.depth === 2
                      ? "text-orange-400"
                      : "text-blue-400";

                  return (
                    <motion.div
                      key={item.package.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group flex flex-col sm:flex-row items-center gap-4 p-5 rounded-2xl bg-white/[0.02] 
                               border border-white/5 hover:bg-white/[0.05] hover:border-primary-500/30 
                               transition-all duration-300 relative overflow-hidden shadow-lg hover:shadow-primary-500/5"
                    >
                      {/* Hover background effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 via-primary-500/[0.02] to-primary-500/0 
                                    translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

                      {/* Rank Indicator */}
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black 
                                 shadow-xl transition-all group-hover:scale-110 relative z-10"
                        style={{
                          backgroundColor:
                            index === 0 ? "rgba(239, 68, 68, 0.15)" :
                              index === 1 ? "rgba(245, 158, 11, 0.15)" :
                                index === 2 ? "rgba(59, 130, 246, 0.15)" :
                                  "rgba(100, 116, 139, 0.1)",
                          color:
                            index === 0 ? "#ef4444" :
                              index === 1 ? "#f59e0b" :
                                index === 2 ? "#3b82f6" :
                                  "#94a3b8",
                          border: `1px solid ${index < 3 ? 'currentColor' : 'rgba(255,255,255,0.1)'}33`
                        }}
                      >
                        {index + 1}
                      </div>

                      {/* Ecosystem Icon/Bulb */}
                      <div className="relative">
                        <div
                          className="w-4 h-4 rounded-full ring-4 ring-white/5 group-hover:scale-125 transition-transform shadow-[0_0_20px_currentColor] relative z-10"
                          style={{ backgroundColor: getEcosystemColor(item.package.ecosystem), color: getEcosystemColor(item.package.ecosystem) }}
                        />
                        <div
                          className="absolute inset-0 rounded-full animate-ping opacity-20"
                          style={{ backgroundColor: getEcosystemColor(item.package.ecosystem) }}
                        />
                      </div>

                      {/* Package Info */}
                      <div className="flex-1 min-w-0 text-center sm:text-left relative z-10">
                        <div className="flex items-center justify-center sm:justify-start gap-2 mb-0.5">
                          <p className="font-bold text-white truncate text-lg group-hover:text-primary-400 transition-colors">
                            {item.package.name}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate tracking-wider">
                          {item.package.id}
                        </p>
                      </div>

                      {/* Depth & Stats */}
                      <div className="flex items-center gap-6 text-center sm:text-right relative z-10">
                        <div className="hidden lg:block">
                          <span className={cn(
                            "text-[10px] font-black px-3 py-1.5 rounded-lg border uppercase tracking-widest backdrop-blur-sm",
                            getEcosystemBadgeClass(item.package.ecosystem)
                          )}>
                            {formatEcosystemName(item.package.ecosystem)}
                          </span>
                        </div>

                        <div className="min-w-[100px]">
                          <div className={cn("text-base font-black tracking-tighter italic", depthColor)}>
                            DEPTH {item.depth}
                          </div>
                          {item.estimatedAffectedVersions && (
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                              ~<AnimatedCounter value={item.estimatedAffectedVersions} duration={1} /> Versions
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Interactive Actions */}
                      <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 relative z-10">
                        <button
                          onClick={() => navigateToGraph(item.package.id)}
                          className="p-3 rounded-xl bg-white/5 hover:bg-primary-500/20 text-slate-400 hover:text-primary-400 
                                   border border-white/10 hover:border-primary-500/30 transition-all shadow-xl"
                          title="View dependency tree"
                        >
                          <GitBranch className="w-5 h-5" />
                        </button>
                        <a
                          href={`/explore?q=${encodeURIComponent(item.package.id)}`}
                          className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white 
                                   border border-white/10 hover:border-white/20 transition-all shadow-xl"
                          title="Explore package details"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Visual Impact Visualization Overhaul */}
            <div className="glass-card p-10 relative overflow-hidden">
              {/* Background scan grid effect */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

              <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-12">
                <div className="flex-1 text-center xl:text-left">
                  <h3 className="text-2xl font-black text-white mb-2 flex items-center justify-center xl:justify-start gap-3 tracking-tighter uppercase italic">
                    <Target className="w-8 h-8 text-primary-400 animate-pulse" />
                    Borehole Visualization
                  </h3>
                  <p className="text-slate-400 max-w-lg mb-8 mx-auto xl:mx-0 font-medium">
                    Radial mapping of security propagation. Central node depth impacts cascade outward through concentric ecosystem layers.
                  </p>

                  {/* Depth Breakdown Stats Overhaul */}
                  <div className="space-y-5 max-w-md mx-auto xl:mx-0">
                    {[1, 2, 3].map((depth) => {
                      const count = impact.topImpacted.filter((i: ImpactNode) => i.depth === depth).length;
                      const percentage = impact.topImpacted.length > 0
                        ? Math.round((count / impact.topImpacted.length) * 100)
                        : 0;
                      const colors = depth === 1
                        ? { bar: "from-red-600 to-red-400", bg: "bg-red-500/10", shadow: "shadow-[0_0_15px_rgba(239,68,68,0.3)]", text: "text-red-400" }
                        : depth === 2
                          ? { bar: "from-orange-600 to-orange-400", bg: "bg-orange-500/10", shadow: "shadow-[0_0_15px_rgba(245,158,11,0.3)]", text: "text-orange-400" }
                          : { bar: "from-primary-600 to-primary-400", bg: "bg-primary-500/10", shadow: "shadow-[0_0_15px_rgba(59,130,246,0.3)]", text: "text-primary-400" };

                      return (
                        <div key={depth} className="group/stat">
                          <div className="flex items-center justify-between text-sm mb-2 px-1">
                            <span className="font-bold text-slate-300 tracking-widest uppercase">Depth 0{depth}</span>
                            <span className={cn("font-black text-base italic", colors.text)}>
                              {count.toLocaleString()} NODES ({percentage}%)
                            </span>
                          </div>
                          <div
                            className={cn("h-3 rounded-full overflow-hidden p-[1px] border border-white/5", colors.bg)}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ delay: depth * 0.1, duration: 1, ease: "circOut" }}
                              className={cn("h-full rounded-full bg-gradient-to-r relative", colors.bar, colors.shadow)}
                            >
                              {/* Shimmer effect on the bar */}
                              <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                              />
                            </motion.div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between px-2">
                      <span className="text-slate-500 font-black uppercase tracking-[0.2em] italic">Aggregate Risk</span>
                      <div className="text-3xl font-black text-white tracking-tighter flex items-end gap-2">
                        <AnimatedCounter value={impact.impactedPackages} />
                        <span className="text-sm font-bold text-primary-400/50 mb-1 uppercase tracking-widest">Global</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Overhauled Circular Rings */}
                <div className="relative w-[500px] h-[500px] flex items-center justify-center scale-75 md:scale-100">
                  {/* Rotating Scanning Ring */}
                  <motion.div
                    className="absolute inset-0 border-[3px] border-dashed border-primary-500/10 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
                  />

                  {/* Reverse Scanning Ring */}
                  <motion.div
                    className="absolute inset-4 border border-primary-500/5 rounded-full"
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
                  >
                    <div className="absolute top-0 left-1/2 w-2 h-2 bg-primary-500/20 rounded-full blur-[2px]" />
                  </motion.div>

                  {/* Pulse Effect Background */}
                  <motion.div
                    className="absolute inset-0 rounded-full blur-3xl opacity-20"
                    animate={{
                      scale: [1, 1.2, 1],
                      backgroundColor: severity ? severity.glowColor.replace('0.5', '0.1') : 'rgba(59, 130, 246, 0.1)'
                    }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  />

                  {/* Concentric Rings */}
                  {[0, 1, 2, 3].map((ring) => {
                    const depth = ring + 1;
                    const depthPackages = impact.topImpacted.filter((i: ImpactNode) => i.depth === depth).length;

                    const ringSize = 100 + (ring * 100); // 100px, 200px, 300px, 400px
                    const ringColors =
                      depth === 1 ? "border-red-500/80 bg-red-500/5 shadow-[0_0_20px_rgba(239,68,68,0.1)]" :
                        depth === 2 ? "border-orange-500/50 bg-orange-500/5 shadow-[0_0_20px_rgba(245,158,11,0.05)]" :
                          depth === 3 ? "border-primary-500/40 bg-primary-500/5 shadow-[0_0_20px_rgba(59,130,246,0.05)]" :
                            "border-slate-500/20 bg-white/[0.02]";

                    return (
                      <motion.div
                        key={ring}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          delay: ring * 0.15,
                          duration: 1,
                          ease: [0.16, 1, 0.3, 1]
                        }}
                        className={cn(
                          "absolute rounded-full border-2 flex items-start justify-center pt-2 transition-all duration-700 backdrop-blur-[2px]",
                          ringColors
                        )}
                        style={{
                          width: `${ringSize}px`,
                          height: `${ringSize}px`,
                          zIndex: 40 - ring
                        }}
                      >
                        {depthPackages > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8 + ring * 0.1 }}
                            className="bg-slate-900/90 border border-white/20 shadow-2xl px-3 py-1 rounded-full flex items-center gap-2 backdrop-blur-md"
                          >
                            <div className="w-2 h-2 rounded-full animate-pulse"
                              style={{
                                backgroundColor: depth === 1 ? "#ef4444" : depth === 2 ? "#f59e0b" : depth === 3 ? "#3b82f6" : "#64748b",
                                boxShadow: `0 0 10px ${depth === 1 ? "#ef4444" : depth === 2 ? "#f59e0b" : depth === 3 ? "#3b82f6" : "#64748b"}`
                              }}
                            />
                            <span className="text-[12px] font-black text-white">
                              {depthPackages.toLocaleString()}
                            </span>
                          </motion.div>
                        )}

                        {/* Animated orbit dots for active rings */}
                        {depthPackages > 0 && depth <= 3 && (
                          <motion.div
                            className="absolute inset-0 rounded-full"
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 15 + ring * 5, ease: "linear" }}
                          >
                            <div
                              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white/50"
                              style={{
                                backgroundColor: depth === 1 ? "#ef4444" : depth === 2 ? "#f59e0b" : "#3b82f6",
                                boxShadow: `0 0 15px ${depth === 1 ? "#ef4444" : depth === 2 ? "#f59e0b" : "#3b82f6"}`
                              }}
                            />
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}

                  {/* Central Node (Patient Zero) */}
                  <div className="relative z-50 flex flex-col items-center justify-center">
                    <motion.div
                      animate={{
                        scale: [1, 1.1, 1],
                        boxShadow: [
                          `0 0 20px ${severity ? severity.glowColor.replace('0.5', '0.2') : 'rgba(239, 68, 68, 0.2)'}`,
                          `0 0 40px ${severity ? severity.glowColor : 'rgba(239, 68, 68, 0.5)'}`,
                          `0 0 20px ${severity ? severity.glowColor.replace('0.5', '0.2') : 'rgba(239, 68, 68, 0.2)'}`
                        ]
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className={cn(
                        "w-24 h-24 rounded-full bg-slate-900 border-4 flex flex-col items-center justify-center overflow-hidden",
                        severity?.ringColor || "border-red-500/50"
                      )}
                    >
                      <div className={cn(
                        "absolute inset-0 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]",
                        severity ? severity.bgColor : "bg-red-500/10"
                      )} />
                      <Shield className={cn("w-10 h-10 mb-1 drop-shadow-[0_0_10px_currentColor]", severity?.color || "text-red-500")} />
                      <p className={cn("text-[10px] font-black uppercase tracking-tighter", severity?.color || "text-red-400")}>Patient 0</p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 px-4 py-2 rounded-xl bg-slate-900/80 border border-white/10 backdrop-blur-md text-center shadow-2xl"
                    >
                      <p className="text-white font-bold text-sm truncate max-w-[140px]">{packageId}</p>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{versionRange || 'Live Target'}</p>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "System Idle" Empty State */}
      {!impact && !loading && !error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-24 text-center relative overflow-hidden group min-h-[400px] flex flex-col items-center justify-center"
        >
          {/* Animated Background Mesh */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
          </div>

          <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-600/5 blur-[120px] rounded-full group-hover:bg-primary-600/10 transition-all duration-1000" />

          <div className="relative z-10 max-w-lg mx-auto">
            <div className="group/icon relative w-28 h-28 mx-auto mb-8">
              <motion.div
                className="absolute inset-0 bg-primary-500/20 blur-2xl rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 3 }}
              />
              {/* Rotating Rings around icon */}
              <motion.div
                className="absolute -inset-4 border border-primary-500/20 rounded-full border-dashed"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
              />
              <motion.div
                className="absolute -inset-2 border border-white/5 rounded-full"
                animate={{ rotate: -360 }}
                transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
              />

              <div className="relative w-28 h-28 rounded-[2rem] bg-slate-900 border border-white/10 flex items-center justify-center shadow-2xl group-hover/icon:rotate-[10deg] transition-all duration-500">
                <Shield className="w-14 h-14 text-primary-400 group-hover/icon:scale-110 transition-transform" />
              </div>
            </div>

            <h3 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase italic">
              System Ready
            </h3>
            <p className="text-lg text-slate-400 leading-relaxed mb-8">
              Awaiting target designation. Enter a package ID to start a deep impact scan.
            </p>

            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-primary-500/5 border border-primary-500/20 text-primary-300 font-bold uppercase tracking-widest text-xs animate-pulse">
              <div className="w-2 h-2 rounded-full bg-primary-400" />
              Scanner Online
            </div>
          </div>
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

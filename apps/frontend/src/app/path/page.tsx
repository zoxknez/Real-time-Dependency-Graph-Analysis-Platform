"use client";

import { useState, useCallback, Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useLazyQuery } from "@apollo/client";
import {
  Route,
  ArrowRight,
  Package as PackageIcon,
  Loader2,
  CheckCircle,
  XCircle,
  Search,
  ArrowLeftRight,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  GitBranch,
  Share2,
  Shield,
  Zap,
  Target,
} from "lucide-react";
import { GET_DEPENDENCY_PATH } from "@/lib/graphql/queries";
import { cn, formatEcosystemName, getEcosystemColor, getEcosystemBadgeClass } from "@/lib/utils";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SkeletonCard } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/error-display";
import type { GetDependencyPathResponse, GetDependencyPathVariables, Package as PackageModel } from "@/lib/graphql/types";

// Popular path examples
const EXAMPLE_PATHS = [
  { from: "cargo:axum", to: "cargo:tokio", label: "axum → tokio" },
  { from: "cargo:serde", to: "cargo:syn", label: "serde → syn" },
  { from: "npm:express", to: "npm:debug", label: "express → debug" },
  { from: "pypi:flask", to: "pypi:werkzeug", label: "flask → werkzeug" },
];

function PathPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialFrom = searchParams.get("from") || "";
  const initialTo = searchParams.get("to") || "";

  const [fromPackage, setFromPackage] = useState(initialFrom);
  const [toPackage, setToPackage] = useState(initialTo);
  const [maxHops, setMaxHops] = useState(6);
  const [shareCopied, setShareCopied] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const [findPath, { data, loading, error }] = useLazyQuery<GetDependencyPathResponse, GetDependencyPathVariables>(GET_DEPENDENCY_PATH);
  const [copied, setCopied] = useState(false);

  // Auto-search when URL has both params
  useEffect(() => {
    if (initialFrom && initialTo && !data && !loading) {
      findPath({
        variables: {
          fromPackageId: initialFrom,
          toPackageId: initialTo,
          maxHops: 6,
        },
      });
    }
  }, [initialFrom, initialTo, data, loading, findPath]);

  // Swap from/to packages
  const handleSwap = useCallback(() => {
    setFromPackage(toPackage);
    setToPackage(fromPackage);
  }, [fromPackage, toPackage]);

  // Copy path to clipboard
  const copyPath = useCallback(async () => {
    if (!data?.dependencyPath?.packages) return;
    const pathStr = data.dependencyPath.packages.map((p) => p.id).join(" → ");
    await navigator.clipboard.writeText(pathStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  // Copy share link
  const copyShareLink = useCallback(async () => {
    const url = `${window.location.origin}/path?from=${encodeURIComponent(fromPackage)}&to=${encodeURIComponent(toPackage)}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }, [fromPackage, toPackage]);

  // Navigate to graph
  const navigateToGraph = useCallback((pkgId: string) => {
    router.push(`/graph?pkg=${encodeURIComponent(pkgId)}`);
  }, [router]);

  // Navigate to impact
  const navigateToImpact = useCallback((pkgId: string) => {
    router.push(`/impact?pkg=${encodeURIComponent(pkgId)}`);
  }, [router]);

  // Set example path
  const setExamplePath = useCallback((from: string, to: string) => {
    setFromPackage(from);
    setToPackage(to);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromPackage.trim() && toPackage.trim()) {
      findPath({
        variables: {
          fromPackageId: fromPackage.trim(),
          toPackageId: toPackage.trim(),
          maxHops,
        },
      });
      // Update URL
      router.push(`/path?from=${encodeURIComponent(fromPackage.trim())}&to=${encodeURIComponent(toPackage.trim())}`, { scroll: false });
    }
  };

  const result = data?.dependencyPath;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 rounded-2xl bg-success/10 border border-success/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <Route className="w-8 h-8 text-success animate-pulse" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white flex items-center gap-3">
              Path Finder
              <span className="text-sm font-medium px-2 py-0.5 rounded-md bg-success/20 text-success border border-success/30 uppercase tracking-widest">
                Beta
              </span>
            </h1>
            <p className="text-slate-400 mt-1 text-lg">
              Trace the shortest dependency route across the ecosystem
            </p>
          </div>
        </div>
      </motion.div>

      {/* Command Console Search Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative z-20 max-w-5xl mx-auto"
      >
        <div className={cn(
          "relative rounded-2xl transition-all duration-300 overflow-hidden",
          isInputFocused
            ? "bg-slate-900/80 ring-2 ring-success/50 shadow-[0_0_40px_rgba(16,185,129,0.2)]"
            : "bg-slate-900/40 border border-white/5 hover:bg-slate-900/60"
        )}>
          {/* Glass sheen */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          <form onSubmit={handleSearch} className="p-2 flex flex-col md:flex-row gap-2 relative z-10">
            {/* From Package Input */}
            <div className="flex-1 relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-success transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={fromPackage}
                onChange={(e) => setFromPackage(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="From Package (e.g., cargo:axum)"
                className="w-full h-14 pl-12 pr-4 bg-transparent border-none outline-none text-white placeholder:text-slate-600 font-mono text-sm focus:ring-0"
              />
            </div>

            <div className="h-px md:h-14 w-full md:w-px bg-white/5 flex items-center justify-center">
              <button
                type="button"
                onClick={handleSwap}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all transform hover:rotate-180 border border-white/5"
                title="Swap Source and Target"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            {/* To Package Input */}
            <div className="flex-1 relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={toPackage}
                onChange={(e) => setToPackage(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="To Package (e.g., cargo:tokio)"
                className="w-full h-14 pl-12 pr-4 bg-transparent border-none outline-none text-white placeholder:text-slate-600 font-mono text-sm focus:ring-0"
              />
            </div>

            <div className="h-px md:h-14 w-full md:w-px bg-white/5" />

            {/* Max Hops Selector */}
            <div className="w-full md:w-40 relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-success transition-colors">
                <GitBranch className="w-5 h-5" />
              </div>
              <select
                value={maxHops}
                onChange={(e) => setMaxHops(Number(e.target.value))}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full h-14 pl-12 pr-10 bg-transparent border-none outline-none text-slate-300 font-mono text-sm appearance-none cursor-pointer focus:ring-0"
              >
                {[3, 4, 5, 6, 7, 8].map((h) => (
                  <option key={h} value={h} className="bg-slate-900 text-white">
                    {h} Hops
                  </option>
                ))}
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !fromPackage.trim() || !toPackage.trim()}
              className="h-14 px-8 rounded-xl bg-gradient-to-r from-success-600 to-emerald-600 hover:from-success-500 hover:to-emerald-500 
                       text-white font-bold shadow-lg shadow-success/20 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-white" />
                  <span className="hidden lg:inline">TRACE</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Quick Examples */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs text-slate-500">
          <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-warning" />
            Try Paths:
          </span>
          {EXAMPLE_PATHS.map((example) => (
            <button
              key={`${example.from}-${example.to}`}
              onClick={() => setExamplePath(example.from, example.to)}
              className="px-2 py-1 rounded-md hover:bg-white/5 hover:text-success-300 transition-colors font-mono"
            >
              {example.label}
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
            <SkeletonCard />
            <div className="glass-card p-6">
              <div className="h-6 w-40 theme-skeleton rounded animate-pulse mb-6" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full theme-skeleton animate-pulse" />
                    <div className="flex-1 h-20 theme-skeleton rounded-xl animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {error && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <QueryError
              error={error}
              onRetry={() => fromPackage && toPackage && findPath({
                variables: { fromPackageId: fromPackage, toPackageId: toPackage, maxHops },
              })}
            />
          </motion.div>
        )}

        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Result Header */}
            <div
              className={cn(
                "glass-card p-6",
                result.found ? "border-success/30" : "theme-border"
              )}
            >
              <div className="flex items-center gap-4">
                {result.found ? (
                  <div className="p-3 rounded-xl bg-success/20">
                    <CheckCircle className="w-8 h-8 text-success" />
                  </div>
                ) : (
                  <div className="p-3 rounded-xl theme-inner-card">
                    <XCircle className="w-8 h-8 theme-text-muted" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-semibold theme-text-primary">
                    {result.found ? "Path Found!" : "No Path Found"}
                  </h3>
                  <p className="theme-text-muted">
                    {result.found
                      ? `Found a path with ${result.hops} hop${result.hops !== 1 ? "s" : ""}`
                      : `No path exists within ${maxHops} hops`}
                  </p>
                </div>
                {/* Share Button */}
                {result.found && (
                  <button
                    onClick={copyShareLink}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg theme-inner-card 
                             theme-text-muted theme-hover-text transition-colors text-sm"
                    title="Copy share link"
                  >
                    {shareCopied ? (
                      <>
                        <Check className="w-4 h-4 text-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4" />
                        Share
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Path Visualization */}
            {result.found && result.packages.length > 0 && (
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold theme-text-primary flex items-center gap-2">
                    <Route className="w-5 h-5 text-success" />
                    Dependency Path
                    <span className="text-sm font-normal theme-text-muted">
                      (<AnimatedCounter value={result.hops} duration={0.3} /> hop{result.hops !== 1 ? "s" : ""})
                    </span>
                  </h3>
                  <button
                    onClick={copyPath}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg theme-inner-card 
                             theme-text-muted theme-hover-text transition-colors text-sm"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Path
                      </>
                    )}
                  </button>
                </div>

                {/* Dynamic Path Flow Visualization */}
                <div className="relative py-8">
                  {/* Connecting Line Container */}
                  <div className="absolute left-8 top-12 bottom-12 w-1 bg-white/5 rounded-full overflow-hidden">
                    {/* Animated Gradient Flow */}
                    <motion.div
                      className="absolute inset-0 w-full"
                      style={{
                        background: "linear-gradient(to bottom, transparent, #10b981, #6366f1, #06b6d4, transparent)",
                        backgroundSize: "100% 200%"
                      }}
                      animate={{ backgroundPosition: ["0% -100%", "0% 200%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  </div>

                  <div className="space-y-8">
                    {result.packages.map((pkg: PackageModel, index: number) => {
                      const isStart = index === 0;
                      const isEnd = index === result.packages.length - 1;

                      return (
                        <motion.div
                          key={pkg.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.15 }}
                          className="relative flex items-center gap-6 group"
                        >
                          {/* Step Node */}
                          <div className="relative z-10 w-16 flex justify-center">
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: index * 0.15, type: "spring" }}
                              className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-xl border-2 transition-transform group-hover:scale-110",
                                isStart ? "bg-success border-white/20" :
                                  isEnd ? "bg-blue-500 border-white/20" :
                                    "bg-slate-900 border-white/10"
                              )}
                              style={{
                                boxShadow: isStart ? "0 0 20px rgba(16, 185, 129, 0.4)" :
                                  isEnd ? "0 0 20px rgba(59, 130, 246, 0.4)" : "none"
                              }}
                            >
                              {isStart ? <Route className="w-6 h-6" /> :
                                isEnd ? <Target className="w-6 h-6" /> :
                                  <span className="text-lg">{index + 1}</span>}
                            </motion.div>

                            {/* Pulsing Glow for Active Nodes */}
                            {(isStart || isEnd) && (
                              <motion.div
                                className={cn(
                                  "absolute inset-0 blur-xl rounded-full -z-10",
                                  isStart ? "bg-success/50" : "bg-blue-500/50"
                                )}
                                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.2, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                              />
                            )}
                          </div>

                          {/* Package Card */}
                          <div className="flex-1">
                            <div
                              className={cn(
                                "p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden",
                                isStart ? "bg-success/5 border-success/20 hover:bg-success/10" :
                                  isEnd ? "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10" :
                                    "bg-slate-900/60 border-white/5 hover:bg-slate-900/80 hover:border-white/10"
                              )}
                            >
                              {/* Hover Gradient */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />

                              <div className="flex items-center gap-4 relative z-10">
                                <div
                                  className="p-3 rounded-xl transition-transform group-hover:scale-110 shadow-lg"
                                  style={{
                                    backgroundColor: getEcosystemColor(pkg.ecosystem),
                                    color: "white"
                                  }}
                                >
                                  <PackageIcon className="w-5 h-5" />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-1">
                                    <h4 className={cn(
                                      "font-bold text-lg",
                                      isStart ? "text-success-300" : isEnd ? "text-blue-300" : "text-white"
                                    )}>
                                      {pkg.name}
                                    </h4>
                                    <div className={cn(
                                      "px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border border-white/10",
                                      getEcosystemBadgeClass(pkg.ecosystem)
                                    )}>
                                      {formatEcosystemName(pkg.ecosystem)}
                                    </div>
                                  </div>
                                  <p className="text-xs text-slate-400 font-mono tracking-wide bg-black/20 inline-block px-2 py-1 rounded-md">
                                    {pkg.id}
                                  </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                  <button
                                    onClick={() => navigateToGraph(pkg.id)}
                                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 hover:border-white/10 transition-colors shadow-lg"
                                    title="Visualize Node"
                                  >
                                    <GitBranch className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => navigateToImpact(pkg.id)}
                                    className="p-2.5 rounded-xl bg-white/5 hover:bg-danger/10 text-slate-400 hover:text-danger border border-white/5 hover:border-danger/20 transition-colors shadow-lg"
                                    title="Analyze Impact"
                                  >
                                    <Shield className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* "System Idle" Empty State */}
      {
        !result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-24 text-center relative overflow-hidden group min-h-[400px] flex flex-col items-center justify-center"
          >
            {/* Animated Background Mesh */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
            </div>

            <div className="absolute -top-40 -left-40 w-96 h-96 bg-success/5 blur-[120px] rounded-full group-hover:bg-success/10 transition-all duration-1000" />

            <div className="relative z-10 max-w-lg mx-auto">
              <div className="group/icon relative w-28 h-28 mx-auto mb-8">
                <motion.div
                  className="absolute inset-0 bg-success/20 blur-2xl rounded-full"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                />
                {/* Rotating Rings around icon */}
                <motion.div
                  className="absolute -inset-4 border border-success/20 rounded-full border-dashed"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
                />

                <div className="relative w-28 h-28 rounded-[2rem] bg-slate-900 border border-white/10 flex items-center justify-center shadow-2xl group-hover/icon:-rotate-12 transition-all duration-500">
                  <Route className="w-14 h-14 text-success group-hover/icon:scale-110 transition-transform" />
                </div>
              </div>

              <h3 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase italic">
                Route Discovery
              </h3>
              <p className="text-lg text-slate-400 leading-relaxed mb-8">
                System ready. Enter source and target packages to calculate the shortest dependency path.
              </p>

              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-success/5 border border-success/20 text-success-300 font-bold uppercase tracking-widest text-xs animate-pulse">
                <div className="w-2 h-2 rounded-full bg-success" />
                Pathfinder Online
              </div>
            </div>
          </motion.div>
        )
      }
    </div >
  );
}

export default function PathPage() {
  return (
    <Suspense fallback={
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    }>
      <PathPageContent />
    </Suspense>
  );
}

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
      >
        <h1 className="text-3xl font-bold theme-text-primary flex items-center gap-3">
          <Route className="w-8 h-8 text-success" />
          Path Finder
        </h1>
        <p className="theme-text-muted mt-1">
          Find the shortest dependency path between two packages
        </p>
      </motion.div>

      {/* Search Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6"
      >
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr,auto] gap-4 items-end">
            <div>
              <label className="text-sm theme-text-tertiary mb-2 block">
                From Package
              </label>
              <input
                type="text"
                value={fromPackage}
                onChange={(e) => setFromPackage(e.target.value)}
                placeholder="e.g., cargo:axum"
                className="input-search"
              />
            </div>
            <div className="hidden lg:flex items-center justify-center h-12 gap-2">
              <button
                type="button"
                onClick={handleSwap}
                className="p-2 rounded-lg theme-inner-card-hover transition-colors group"
                title="Swap packages"
              >
                <ArrowLeftRight className="w-5 h-5 theme-text-faint group-hover:text-primary-400 transition-colors" />
              </button>
            </div>
            {/* Mobile Swap Button */}
            <div className="lg:hidden flex justify-center">
              <button
                type="button"
                onClick={handleSwap}
                className="flex items-center gap-2 px-4 py-2 rounded-lg theme-inner-card theme-text-muted theme-hover-text transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Swap
              </button>
            </div>
            <div>
              <label className="text-sm theme-text-tertiary mb-2 block">
                To Package
              </label>
              <input
                type="text"
                value={toPackage}
                onChange={(e) => setToPackage(e.target.value)}
                placeholder="e.g., cargo:tokio"
                className="input-search"
              />
            </div>
            <div>
              <label className="text-sm theme-text-tertiary mb-2 block">
                Max Hops
              </label>
              <select
                value={maxHops}
                onChange={(e) => setMaxHops(Number(e.target.value))}
                className="input-search"
              >
                {[3, 4, 5, 6, 7, 8].map((h) => (
                  <option key={h} value={h}>
                    {h} hops
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !fromPackage.trim() || !toPackage.trim()}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            Find Path
          </button>
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

                {/* Path Steps */}
                <div className="relative">
                  {/* Connecting Line with Animated Flow */}
                  <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-white/5" />
                  <motion.div
                    className="absolute left-6 top-8 bottom-8 w-0.5"
                    style={{
                      background: "linear-gradient(to bottom, #10b981, #6366f1, #06b6d4)",
                      backgroundSize: "100% 200%"
                    }}
                    animate={{ backgroundPosition: ["0% 0%", "0% 100%"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Pulse Effect along the line */}
                  <motion.div
                    className="absolute left-6 w-1 h-20 bg-gradient-to-b from-transparent via-white/40 to-transparent blur-sm z-10"
                    animate={{ top: ["0%", "100%"] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    style={{ left: "22px" }}
                  />

                  <div className="space-y-4">
                    {result.packages.map((pkg: PackageModel, index: number) => (
                      <motion.div
                        key={pkg.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative flex items-center gap-4"
                      >
                        {/* Step Indicator */}
                        <div className="relative">
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: index * 0.1, duration: 0.5 }}
                            className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center font-black text-white shadow-lg border-2 border-white/20"
                            style={{
                              backgroundColor:
                                index === 0
                                  ? "#10b981"
                                  : index === result.packages.length - 1
                                    ? "#06b6d4"
                                    : "#6366f1",
                              boxShadow: `0 0 15px ${index === 0
                                  ? "rgba(16, 185, 129, 0.4)"
                                  : index === result.packages.length - 1
                                    ? "rgba(6, 182, 212, 0.4)"
                                    : "rgba(99, 102, 241, 0.4)"
                                }`
                            }}
                          >
                            {index + 1}
                          </motion.div>
                          {index === 0 && (
                            <motion.div
                              className="absolute inset-0 bg-success/30 blur-xl rounded-full -z-10"
                              animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1] }}
                              transition={{ duration: 3, repeat: Infinity }}
                            />
                          )}
                        </div>

                        {/* Package Card */}
                        <div
                          className="flex-1 p-4 rounded-xl theme-inner-card theme-border 
                                   theme-inner-card-hover transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="p-2 rounded-lg transition-transform group-hover:scale-110"
                              style={{
                                backgroundColor: `${getEcosystemColor(pkg.ecosystem)}20`,
                              }}
                            >
                              <PackageIcon
                                className="w-5 h-5"
                                style={{ color: getEcosystemColor(pkg.ecosystem) }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold theme-text-primary">
                                  {pkg.name}
                                </span>
                                <span
                                  className={cn(
                                    "text-xs px-2 py-0.5 rounded-full font-medium",
                                    getEcosystemBadgeClass(pkg.ecosystem)
                                  )}
                                >
                                  {formatEcosystemName(pkg.ecosystem)}
                                </span>
                              </div>
                              <p className="text-xs theme-text-muted font-mono">
                                {pkg.id}
                              </p>
                            </div>
                            {index === 0 && (
                              <span className="text-xs text-success bg-success/20 px-2 py-1 rounded">
                                Start
                              </span>
                            )}
                            {index === result.packages.length - 1 && (
                              <span className="text-xs text-accent-400 bg-accent-500/20 px-2 py-1 rounded">
                                End
                              </span>
                            )}
                            {/* Action Buttons */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigateToGraph(pkg.id)}
                                className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                                title="View in Graph"
                              >
                                <GitBranch className="w-4 h-4 text-primary-400" />
                              </button>
                              <button
                                onClick={() => navigateToImpact(pkg.id)}
                                className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                                title="Impact Analysis"
                              >
                                <Shield className="w-4 h-4 text-danger" />
                              </button>
                              <a
                                href={`/explore?q=${encodeURIComponent(pkg.id)}`}
                                className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                                title="View Details"
                              >
                                <ExternalLink className="w-4 h-4 theme-text-muted" />
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Animated Arrow between steps */}
                        {index < result.packages.length - 1 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 + 0.15 }}
                            className="absolute left-6 -bottom-2 transform -translate-x-1/2 z-20"
                          >
                            <motion.div
                              className="flex items-center gap-1 text-xs theme-text-faint theme-bg-primary px-2 py-0.5 rounded-full theme-border"
                              animate={{ y: [0, 2, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            >
                              <ArrowRight className="w-3 h-3" />
                              depends on
                            </motion.div>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!result && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-12 text-center"
        >
          <Route className="w-16 h-16 theme-text-faint mx-auto mb-4" />
          <h3 className="text-xl font-semibold theme-text-primary mb-2">
            Discover Dependency Paths
          </h3>
          <p className="theme-text-muted max-w-md mx-auto">
            Enter two package IDs to find the shortest dependency path between them.
            This helps understand how packages are connected in the ecosystem.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="text-sm theme-text-faint flex items-center gap-1">
              <Sparkles className="w-4 h-4" />
              Try:
            </span>
            {EXAMPLE_PATHS.map((example) => (
              <button
                key={`${example.from}-${example.to}`}
                onClick={() => setExamplePath(example.from, example.to)}
                className="px-3 py-1.5 text-sm rounded-lg theme-inner-card theme-inner-card-hover 
                         theme-text-tertiary theme-hover-text transition-colors theme-border 
                         hover:border-primary-500/30 flex items-center gap-2"
              >
                <Zap className="w-3 h-3 text-warning" />
                {example.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
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

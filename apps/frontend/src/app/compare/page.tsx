"use client";

import { useState, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLazyQuery } from "@apollo/client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GitCompare,
  Package,
  Search,
  X,
  ArrowRight,
  GitBranch,
  Shield,
  Users,
  TrendingUp,
  CheckCircle,
  Loader2,
  ArrowLeftRight,
} from "lucide-react";
import { GET_PACKAGE, GET_REVERSE_DEPENDENTS } from "@/lib/graphql/queries";
import { cn, formatEcosystemName, getEcosystemColor, getEcosystemBadgeClass, formatNumber } from "@/lib/utils";
import { QueryError } from "@/components/ui/error-display";

interface ComparePackage {
  id: string;
  name: string;
  ecosystem: string;
  dependentsCount: number;
}

function PackageSelector({
  label,
  value,
  onChange,
  onClear,
  loading,
  error,
  packageData,
  otherPackageId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  loading: boolean;
  error?: Error;
  packageData?: ComparePackage;
  otherPackageId?: string;
}) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && inputValue.trim() !== otherPackageId) {
      onChange(inputValue.trim());
    }
  };

  return (
    <div className={cn(
      "relative rounded-2xl transition-all duration-300 overflow-hidden flex-1 group/container",
      packageData
        ? "bg-slate-900/60 border border-white/10"
        : isFocused
          ? "bg-slate-900/80 ring-2 ring-primary-500/50 shadow-[0_0_40px_rgba(59,130,246,0.15)]"
          : "bg-slate-900/40 border border-white/5 hover:bg-slate-900/60"
    )}>
      {/* Glass sheen */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 relative z-10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            packageData ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-slate-600"
          )} />
          <h3 className="text-xs font-bold uppercase tracking-widest theme-text-secondary">{label}</h3>
        </div>
        {packageData && (
          <button
            onClick={onClear}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-6 relative z-10">
        {!packageData ? (
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary-400 transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Enter package ID (e.g., cargo:tokio)"
                className="w-full h-14 pl-12 pr-4 bg-slate-950/50 border border-white/10 rounded-xl outline-none text-white placeholder:text-slate-600 font-mono text-sm focus:border-primary-500/50 focus:bg-slate-950/80 transition-all"
              />
              <div className="absolute right-2 top-2">
                <button
                  type="submit"
                  disabled={!inputValue.trim() || loading}
                  className="h-10 px-4 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium text-xs disabled:opacity-0 disabled:pointer-events-none transition-all shadow-lg shadow-primary-500/20"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "LOAD"}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 text-center font-mono">
              e.g., <span className="text-slate-400">cargo:tokio</span>
            </p>
          </form>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Package Info */}
            <div className="flex items-center gap-4">
              <div
                className="p-4 rounded-xl shadow-lg relative overflow-hidden group-icon"
                style={{ backgroundColor: `${getEcosystemColor(packageData.ecosystem)}10` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover-icon:opacity-100 transition-opacity" />
                <Package
                  className="w-10 h-10 relative z-10 transition-transform duration-500 group-hover:scale-110"
                  style={{ color: getEcosystemColor(packageData.ecosystem) }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xl font-bold text-white truncate">{packageData.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-white/5", getEcosystemBadgeClass(packageData.ecosystem))}>
                    {formatEcosystemName(packageData.ecosystem)}
                  </span>
                  <span className="text-xs text-slate-500 font-mono bg-white/5 px-2 py-0.5 rounded-md">{packageData.id}</span>
                </div>
              </div>
            </div>

            {/* Key Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-slate-950/50 border border-white/5 relative overflow-hidden group/stat">
                <div className="absolute inset-0 bg-primary-500/5 translate-y-full group-hover/stat:translate-y-0 transition-transform duration-500" />
                <div className="flex items-center gap-2 mb-1 relative z-10">
                  <Users className="w-4 h-4 text-primary-400" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dependents</span>
                </div>
                <p className="text-2xl font-black text-white relative z-10">
                  {formatNumber(packageData.dependentsCount)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/50 border border-white/5 relative overflow-hidden group/stat">
                <div className="absolute inset-0 bg-accent-500/5 translate-y-full group-hover/stat:translate-y-0 transition-transform duration-500" />
                <div className="flex items-center gap-2 mb-1 relative z-10">
                  <TrendingUp className="w-4 h-4 text-accent-400" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Impact Score</span>
                </div>
                <p className="text-2xl font-black text-white relative z-10">
                  High
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => router.push(`/graph?pkg=${encodeURIComponent(packageData.id)}`)}
                className="flex-1 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-colors flex items-center justify-center gap-2 text-xs font-bold text-slate-300 hover:text-white uppercase tracking-wide group/btn"
              >
                <GitBranch className="w-4 h-4 text-slate-400 group-hover/btn:text-primary-400 transition-colors" />
                Graph
              </button>
              <button
                onClick={() => router.push(`/impact?pkg=${encodeURIComponent(packageData.id)}`)}
                className="flex-1 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-colors flex items-center justify-center gap-2 text-xs font-bold text-slate-300 hover:text-white uppercase tracking-wide group/btn"
              >
                <Shield className="w-4 h-4 text-slate-400 group-hover/btn:text-danger transition-colors" />
                Impact
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {error && <div className="px-6 pb-6"><QueryError error={error} minimal /></div>}
    </div>
  );
}

function ComparePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pkg1Id, setPkg1Id] = useState(searchParams.get("pkg1") || "");
  const [pkg2Id, setPkg2Id] = useState(searchParams.get("pkg2") || "");
  const [pkg1Data, setPkg1Data] = useState<ComparePackage | null>(null);
  const [pkg2Data, setPkg2Data] = useState<ComparePackage | null>(null);

  const [getPackage1, { loading: loading1, error: error1 }] = useLazyQuery(GET_PACKAGE);
  const [getPackage2, { loading: loading2, error: error2 }] = useLazyQuery(GET_PACKAGE);
  const [getDeps1] = useLazyQuery(GET_REVERSE_DEPENDENTS);
  const [getDeps2] = useLazyQuery(GET_REVERSE_DEPENDENTS);

  const loadPackage1 = useCallback(async (id: string) => {
    setPkg1Id(id);
    const { data: pkgData } = await getPackage1({ variables: { id } });
    const { data: depsData } = await getDeps1({ variables: { packageId: id, maxDepth: 1, first: 1 } });

    if (pkgData?.package) {
      setPkg1Data({
        ...pkgData.package,
        dependentsCount: depsData?.reverseDependents?.totalCount || 0,
      });
      // Update URL
      const params = new URLSearchParams(searchParams);
      params.set("pkg1", id);
      router.replace(`/compare?${params.toString()}`, { scroll: false });
    }
  }, [getPackage1, getDeps1, searchParams, router]);

  const loadPackage2 = useCallback(async (id: string) => {
    setPkg2Id(id);
    const { data: pkgData } = await getPackage2({ variables: { id } });
    const { data: depsData } = await getDeps2({ variables: { packageId: id, maxDepth: 1, first: 1 } });

    if (pkgData?.package) {
      setPkg2Data({
        ...pkgData.package,
        dependentsCount: depsData?.reverseDependents?.totalCount || 0,
      });
      // Update URL
      const params = new URLSearchParams(searchParams);
      params.set("pkg2", id);
      router.replace(`/compare?${params.toString()}`, { scroll: false });
    }
  }, [getPackage2, getDeps2, searchParams, router]);

  const clearPackage1 = () => {
    setPkg1Id("");
    setPkg1Data(null);
    const params = new URLSearchParams(searchParams);
    params.delete("pkg1");
    router.replace(`/compare?${params.toString()}`, { scroll: false });
  };

  const clearPackage2 = () => {
    setPkg2Id("");
    setPkg2Data(null);
    const params = new URLSearchParams(searchParams);
    params.delete("pkg2");
    router.replace(`/compare?${params.toString()}`, { scroll: false });
  };

  const swapPackages = () => {
    const temp1 = { id: pkg1Id, data: pkg1Data };
    setPkg1Id(pkg2Id);
    setPkg1Data(pkg2Data);
    setPkg2Id(temp1.id);
    setPkg2Data(temp1.data);
  };

  // Comparison results
  const showComparison = pkg1Data && pkg2Data;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 relative"
      >
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -z-10" />
        <h1 className="text-4xl font-black theme-text-primary inline-flex items-center gap-4 bg-slate-950 px-6 relative z-10">
          <GitCompare className="w-8 h-8 text-primary-400" />
          SYSTEM COMPARE
        </h1>
        <p className="theme-text-muted mt-2 font-mono text-sm tracking-widest uppercase">
          Dependency Analysis & Impact Assessment
        </p>
      </motion.div>

      {/* Package Selectors */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col lg:flex-row gap-6 items-stretch"
      >
        <PackageSelector
          label="SOURCE PACKAGE (A)"
          value={pkg1Id}
          onChange={loadPackage1}
          onClear={clearPackage1}
          loading={loading1}
          error={error1 as Error | undefined}
          packageData={pkg1Data || undefined}
          otherPackageId={pkg2Id}
        />

        {/* Swap Button Area */}
        <div className="flex items-center justify-center lg:py-0 py-4 relative z-20">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none lg:rotate-90">
            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent lg:w-px lg:h-full lg:bg-gradient-to-b" />
          </div>
          <motion.button
            onClick={swapPackages}
            disabled={!pkg1Data && !pkg2Data}
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            className="p-4 rounded-full bg-slate-900 border border-white/10 shadow-[0_0_20px_rgba(0,0,0,0.5)] 
                     hover:border-primary-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] 
                     transition-all disabled:opacity-30 flex items-center justify-center group"
            title="Swap packages"
          >
            <ArrowLeftRight className="w-5 h-5 text-slate-400 group-hover:text-primary-400 transition-colors" />
          </motion.button>
        </div>

        <PackageSelector
          label="TARGET PACKAGE (B)"
          value={pkg2Id}
          onChange={loadPackage2}
          onClear={clearPackage2}
          loading={loading2}
          error={error2 as Error | undefined}
          packageData={pkg2Data || undefined}
          otherPackageId={pkg1Id}
        />
      </motion.div>

      {/* Comparison Results */}
      <AnimatePresence mode="wait">
        {showComparison ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Winner Summary */}
            <div className="glass-card p-8 text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

              <p className="text-secondary-400 text-xs font-bold uppercase tracking-[0.2em] mb-4">Analysis Result</p>
              {pkg1Data.dependentsCount === pkg2Data.dependentsCount ? (
                <p className="text-3xl font-bold theme-text-primary">Ecosystem Equilibrium</p>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-4xl font-black text-white">
                      {pkg1Data.dependentsCount > pkg2Data.dependentsCount ? pkg1Data.name : pkg2Data.name}
                    </span>
                    <CheckCircle className="w-8 h-8 text-success-400 animate-pulse" />
                  </div>
                  <p className="text-lg text-slate-400">
                    is dominant with{" "}
                    <span className="text-success-400 font-bold font-mono">
                      +{formatNumber(Math.abs(pkg1Data.dependentsCount - pkg2Data.dependentsCount))}
                    </span>
                    {" "}more dependents
                  </p>
                </div>
              )}
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Dependents Comparison */}
              <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5 backdrop-blur-sm relative overflow-hidden group hover:border-white/10 transition-colors">
                <div className="absolute inset-0 bg-primary-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6 text-center">Popularity Index</p>

                <div className="flex items-center justify-between relative z-10">
                  <div className="text-center flex-1">
                    <p className="text-2xl font-black text-white tabular-nums">
                      {formatNumber(pkg1Data.dependentsCount)}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold mt-1 truncate px-2">{pkg1Data.name}</p>
                  </div>

                  <div className="flex flex-col items-center px-2">
                    {pkg1Data.dependentsCount > pkg2Data.dependentsCount ? (
                      <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-success" />
                      </div>
                    ) : pkg1Data.dependentsCount < pkg2Data.dependentsCount ? (
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                        <span className="block w-2 h-2 rounded-full bg-slate-600" />
                      </div>
                    ) : (
                      <span className="text-xl font-bold theme-text-faint">=</span>
                    )}
                    <div className="w-full h-px bg-white/10 my-2" />
                    {pkg1Data.dependentsCount < pkg2Data.dependentsCount ? (
                      <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-success" />
                      </div>
                    ) : pkg1Data.dependentsCount > pkg2Data.dependentsCount ? (
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                        <span className="block w-2 h-2 rounded-full bg-slate-600" />
                      </div>
                    ) : null}
                  </div>

                  <div className="text-center flex-1">
                    <p className="text-2xl font-black text-white tabular-nums">
                      {formatNumber(pkg2Data.dependentsCount)}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold mt-1 truncate px-2">{pkg2Data.name}</p>
                  </div>
                </div>
              </div>

              {/* Ecosystem */}
              <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5 backdrop-blur-sm relative overflow-hidden group hover:border-white/10 transition-colors">
                <div className="absolute inset-0 bg-accent-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6 text-center">Environment</p>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{pkg1Data.name}</span>
                    <span
                      className={cn("text-xs px-2 py-1 rounded font-bold shadow-sm", getEcosystemBadgeClass(pkg1Data.ecosystem))}
                      style={{ backgroundColor: `${getEcosystemColor(pkg1Data.ecosystem)}20` }}
                    >
                      {formatEcosystemName(pkg1Data.ecosystem)}
                    </span>
                  </div>
                  <div className="w-full h-px bg-white/5" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">{pkg2Data.name}</span>
                    <span
                      className={cn("text-xs px-2 py-1 rounded font-bold shadow-sm", getEcosystemBadgeClass(pkg2Data.ecosystem))}
                      style={{ backgroundColor: `${getEcosystemColor(pkg2Data.ecosystem)}20` }}
                    >
                      {formatEcosystemName(pkg2Data.ecosystem)}
                    </span>
                  </div>
                </div>

                {pkg1Data.ecosystem === pkg2Data.ecosystem && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-4 left-0 right-0 text-center"
                  >
                    <span className="text-[10px] text-success font-bold uppercase tracking-wider flex items-center justify-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Direct Competitors
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Path Connection */}
              <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5 backdrop-blur-sm relative overflow-hidden group hover:border-white/10 transition-colors flex flex-col justify-between">
                <div className="absolute inset-0 bg-success/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 text-center">Connectivity</p>
                  <p className="text-slate-400 text-center text-sm mb-6">
                    Discover the dependency chain between these two packages.
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/path?from=${encodeURIComponent(pkg1Data.id)}&to=${encodeURIComponent(pkg2Data.id)}`)}
                  className="w-full py-3 rounded-lg bg-success-600 hover:bg-success-500 text-white font-bold text-sm shadow-lg shadow-success-500/20 hover:shadow-success-500/40 transition-all flex items-center justify-center gap-2 group/btn"
                >
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                  Trace Path
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          /* System Idle State */
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card min-h-[400px] flex flex-col items-center justify-center text-center relative overflow-hidden p-12"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(50,50,50,0.1),transparent_70%)]" />

            <div className="relative z-10 max-w-md mx-auto">
              <div className="w-24 h-24 mx-auto mb-8 relative">
                <motion.div
                  className="absolute inset-0 border-2 border-primary-500/30 rounded-full border-dashed"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-2 border border-white/10 rounded-full"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <GitCompare className="w-10 h-10 text-primary-400" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-white mb-2">Ready to Compare</h3>
              <p className="text-slate-400 leading-relaxed mb-8">
                Select two packages to initiate a comprehensive dependency analysis and side-by-side comparison.
              </p>

              <div className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-mono text-success uppercase tracking-widest">System Online</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      }
    >
      <ComparePageContent />
    </Suspense>
  );
}

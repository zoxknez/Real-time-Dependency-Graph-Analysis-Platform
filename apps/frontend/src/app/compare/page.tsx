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
  XCircle,
  Loader2,
  Plus,
  ArrowLeftRight,
} from "lucide-react";
import { GET_PACKAGE, GET_REVERSE_DEPENDENTS } from "@/lib/graphql/queries";
import { cn, formatEcosystemName, getEcosystemColor, getEcosystemBadgeClass, formatNumber } from "@/lib/utils";
import { QueryError, EmptyState } from "@/components/ui/error-display";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && inputValue.trim() !== otherPackageId) {
      onChange(inputValue.trim());
    }
  };

  return (
    <div className="glass-card p-6 flex-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold theme-text-secondary">{label}</h3>
        {packageData && (
          <button
            onClick={onClear}
            className="p-1.5 rounded-lg theme-interactive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!packageData ? (
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 theme-text-muted pointer-events-none" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter package ID (e.g., cargo:tokio)"
              className="input-search !pl-12"
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || loading}
            className="w-full mt-3 btn-primary flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Select Package
          </button>
        </form>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4"
        >
          {/* Package Info */}
          <div className="flex items-center gap-4">
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: `${getEcosystemColor(packageData.ecosystem)}20` }}
            >
              <Package
                className="w-8 h-8"
                style={{ color: getEcosystemColor(packageData.ecosystem) }}
              />
            </div>
            <div>
              <h4 className="text-lg font-bold theme-text-primary">{packageData.name}</h4>
              <span className={cn("text-xs px-2 py-0.5 rounded-full", getEcosystemBadgeClass(packageData.ecosystem))}>
                {formatEcosystemName(packageData.ecosystem)}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl theme-inner-card">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-primary-400" />
                <span className="text-xs theme-text-muted">Dependents</span>
              </div>
              <p className="text-xl font-bold theme-text-primary">
                {formatNumber(packageData.dependentsCount)}
              </p>
            </div>
            <div className="p-3 rounded-xl theme-inner-card">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-accent-400" />
                <span className="text-xs theme-text-muted">Ecosystem</span>
              </div>
              <p className="text-lg font-bold theme-text-primary">
                {formatEcosystemName(packageData.ecosystem)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/graph?pkg=${encodeURIComponent(packageData.id)}`)}
              className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm"
            >
              <GitBranch className="w-4 h-4" />
              Graph
            </button>
            <button
              onClick={() => router.push(`/impact?pkg=${encodeURIComponent(packageData.id)}`)}
              className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm"
            >
              <Shield className="w-4 h-4" />
              Impact
            </button>
          </div>
        </motion.div>
      )}

      {error && <QueryError error={error} minimal />}
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
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold theme-text-primary flex items-center gap-3">
          <GitCompare className="w-8 h-8 text-primary-400" />
          Compare Packages
        </h1>
        <p className="theme-text-muted mt-1">
          Compare two packages side-by-side to see their dependencies and impact
        </p>
      </motion.div>

      {/* Package Selectors */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col lg:flex-row gap-4 items-stretch"
      >
        <PackageSelector
          label="Package A"
          value={pkg1Id}
          onChange={loadPackage1}
          onClear={clearPackage1}
          loading={loading1}
          error={error1 as Error | undefined}
          packageData={pkg1Data || undefined}
          otherPackageId={pkg2Id}
        />

        {/* Swap Button */}
        <div className="flex items-center justify-center lg:py-0 py-4">
          <motion.button
            onClick={swapPackages}
            disabled={!pkg1Data && !pkg2Data}
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            className="p-4 rounded-2xl theme-inner-card theme-inner-card-hover border border-white/5 
                     shadow-lg transition-colors disabled:opacity-30 flex items-center justify-center"
            title="Swap packages"
          >
            <ArrowLeftRight className="w-6 h-6 text-primary-400" />
          </motion.button>
        </div>

        <PackageSelector
          label="Package B"
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
      <AnimatePresence>
        {showComparison && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Summary Card */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold theme-text-primary mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary-400" />
                Comparison Summary
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Dependents Comparison */}
                <div className="p-5 rounded-2xl theme-inner-card border border-white/5 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-primary-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <p className="text-xs theme-text-muted mb-4 uppercase tracking-widest font-bold">Popularity</p>
                  <div className="flex items-center justify-between relative z-10">
                    <div className="text-center">
                      <p className="text-3xl font-black theme-text-primary">
                        {formatNumber(pkg1Data.dependentsCount)}
                      </p>
                      <p className="text-[10px] theme-text-faint uppercase font-bold mt-1 max-w-[80px] truncate">{pkg1Data.name}</p>
                    </div>
                    <div className="px-4 flex flex-col items-center gap-1">
                      {pkg1Data.dependentsCount > pkg2Data.dependentsCount ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <CheckCircle className="w-8 h-8 text-success drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                        </motion.div>
                      ) : pkg1Data.dependentsCount < pkg2Data.dependentsCount ? (
                        <XCircle className="w-6 h-6 text-danger opacity-50" />
                      ) : (
                        <span className="text-xl font-bold theme-text-faint">=</span>
                      )}
                      <div className="h-0.5 w-8 bg-white/10 rounded-full" />
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-black theme-text-primary">
                        {formatNumber(pkg2Data.dependentsCount)}
                      </p>
                      <p className="text-[10px] theme-text-faint uppercase font-bold mt-1 max-w-[80px] truncate">{pkg2Data.name}</p>
                    </div>
                  </div>
                </div>

                {/* Ecosystem */}
                <div className="p-5 rounded-2xl theme-inner-card border border-white/5 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-accent-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <p className="text-xs theme-text-muted mb-4 uppercase tracking-widest font-bold">Ecosystem</p>
                  <div className="flex items-center justify-between relative z-10">
                    <span
                      className={cn("text-xs px-3 py-1.5 rounded-lg font-bold shadow-sm", getEcosystemBadgeClass(pkg1Data.ecosystem))}
                      style={{ backgroundColor: `${getEcosystemColor(pkg1Data.ecosystem)}30` }}
                    >
                      {formatEcosystemName(pkg1Data.ecosystem)}
                    </span>
                    <div className="flex flex-col items-center">
                      <ArrowLeftRight className="w-4 h-4 theme-text-faint" />
                    </div>
                    <span
                      className={cn("text-xs px-3 py-1.5 rounded-lg font-bold shadow-sm", getEcosystemBadgeClass(pkg2Data.ecosystem))}
                      style={{ backgroundColor: `${getEcosystemColor(pkg2Data.ecosystem)}30` }}
                    >
                      {formatEcosystemName(pkg2Data.ecosystem)}
                    </span>
                  </div>
                  {pkg1Data.ecosystem === pkg2Data.ecosystem && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-success font-bold mt-3 text-center flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Direct Competitors
                    </motion.div>
                  )}
                </div>

                {/* Path Connection */}
                <div className="p-5 rounded-2xl theme-inner-card border border-white/5 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-success/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <p className="text-xs theme-text-muted mb-4 uppercase tracking-widest font-bold">Connection</p>
                  <button
                    onClick={() => router.push(`/path?from=${encodeURIComponent(pkg1Data.id)}&to=${encodeURIComponent(pkg2Data.id)}`)}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm font-bold shadow-lg 
                             hover:scale-[1.02] transition-transform relative z-10"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Trace Path
                  </button>
                  <p className="text-[10px] theme-text-faint mt-3 text-center font-medium">Find shortest dependency link</p>
                </div>
              </div>
            </div>

            {/* Winner Summary */}
            <div className="glass-card p-6 text-center">
              <p className="text-sm theme-text-muted mb-2">More Popular Package</p>
              {pkg1Data.dependentsCount === pkg2Data.dependentsCount ? (
                <p className="text-xl font-bold theme-text-primary">It's a tie!</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-primary-400">
                    {pkg1Data.dependentsCount > pkg2Data.dependentsCount ? pkg1Data.name : pkg2Data.name}
                  </p>
                  <p className="text-sm theme-text-muted mt-1">
                    has{" "}
                    <span className="text-success font-semibold">
                      {formatNumber(Math.abs(pkg1Data.dependentsCount - pkg2Data.dependentsCount))}
                    </span>
                    {" "}more dependents
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!pkg1Data && !pkg2Data && (
        <EmptyState
          icon={GitCompare}
          title="Select two packages to compare"
          description="Enter package IDs above to see a side-by-side comparison of their dependencies and impact."
        />
      )}
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

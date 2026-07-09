"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery } from "@apollo/client/react";
import { formatEcosystemName, getEcosystemColor } from "@/lib/utils";
import { GET_GRAPH_STATS } from "@/lib/graphql/queries";
import type { GetGraphStatsResponse } from "@/lib/graphql/types";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SkeletonChart } from "@/components/ui/skeleton";
import { RefreshCw, AlertCircle } from "lucide-react";

interface EcosystemData {
  ecosystem: string;
  count: number;
  versions: number;
  color: string;
}

export function EcosystemChart() {
  const router = useRouter();
  const { data, loading, error, refetch } = useQuery<GetGraphStatsResponse>(GET_GRAPH_STATS, {
    pollInterval: 30000, // Auto-refresh every 30 seconds
  });

  const ecosystemData: EcosystemData[] = useMemo(() => {
    const breakdown = data?.graphStats?.ecosystemBreakdown;
    const totalVersions = data?.graphStats?.totalVersions || 0;
    const totalPackages = data?.graphStats?.totalPackages || 1;

    // Use real data from API if available
    if (breakdown && breakdown.length > 0) {
      const dataMap = breakdown.map((item: { ecosystem: string; count: number }) => ({
        ecosystem: item.ecosystem,
        count: item.count,
        versions: Math.round((item.count / totalPackages) * totalVersions),
        color: getEcosystemColor(item.ecosystem),
      }));

      // Ensure NPM is shown even if 0 for demo/completeness
      const hasNpm = dataMap.some((d: EcosystemData) => d.ecosystem === "NPM");
      if (!hasNpm) {
        dataMap.push({ ecosystem: "NPM", count: 0, versions: 0, color: getEcosystemColor("NPM") });
      }

      return dataMap.sort((a: EcosystemData, b: EcosystemData) => b.count - a.count);
    }

    // Fallback if no data
    return [
      { ecosystem: "CARGO", count: 0, versions: 0, color: getEcosystemColor("CARGO") },
      { ecosystem: "NPM", count: 0, versions: 0, color: getEcosystemColor("NPM") },
      { ecosystem: "PY_PI", count: 0, versions: 0, color: getEcosystemColor("PY_PI") },
    ];
  }, [data]);

  const totalPackages = useMemo(
    () => ecosystemData.reduce((acc, e) => acc + e.count, 0),
    [ecosystemData]
  );

  if (loading) {
    return <SkeletonChart />;
  }

  if (error) {
    return (
      <div className="glass-card p-6 h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="theme-text-muted">Failed to load ecosystem data</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 h-full border border-white/10 shadow-xl group hover:shadow-primary-500/10 transition-shadow">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-bold theme-text-primary tracking-tight">Ecosystem Distribution</h3>
          <p className="text-sm theme-text-muted">Global registry analytics</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg theme-interactive transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="text-right">
            <p className="text-2xl font-bold theme-text-primary">
              <AnimatedCounter value={totalPackages} />
            </p>
            <p className="text-xs theme-text-muted">Total packages</p>
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="space-y-4">
        {ecosystemData.map((item, index) => {
          const percentage = totalPackages > 0 ? (item.count / totalPackages) * 100 : 0;
          return (
            <motion.div
              key={item.ecosystem}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="space-y-2 group cursor-pointer"
              whileHover={{ scale: 1.01 }}
              onClick={() => router.push(`/explore?ecosystem=${item.ecosystem}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                    whileHover={{ scale: 1.5 }}
                    transition={{ duration: 0.2 }}
                  />
                  <span className="text-sm font-medium theme-text-secondary group-hover:theme-text-primary transition-colors">
                    {formatEcosystemName(item.ecosystem)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="theme-text-muted">
                    <AnimatedCounter value={item.versions} duration={0.8} /> versions
                  </span>
                  <span className="font-semibold theme-text-primary">
                    <AnimatedCounter value={item.count} duration={0.8} /> packages
                  </span>
                </div>
              </div>
              <div className="h-2.5 theme-inner-card rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1, delay: index * 0.15, ease: "easeOut" }}
                  className="h-full rounded-full relative overflow-hidden"
                  style={{ backgroundColor: item.color }}
                >
                  {/* Shimmer effect */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: "-100%" }}
                    animate={{ x: "200%" }}
                    transition={{ duration: 1.5, delay: 0.5 + index * 0.2, ease: "easeInOut" }}
                  />
                </motion.div>
              </div>
              <div className="flex justify-end">
                <span className="text-xs theme-text-faint">
                  {percentage.toFixed(1)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pie Chart Visual */}
      <div className="mt-8 flex items-center justify-center">
        <div className="relative w-44 h-44">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {(() => {
              let offset = 0;
              return ecosystemData.map((item, index) => {
                const percentage = totalPackages > 0 ? (item.count / totalPackages) * 100 : 0;
                const circumference = 2 * Math.PI * 40;
                const strokeDasharray = (percentage / 100) * circumference;
                const strokeDashoffset = -offset * (circumference / 100);
                offset += percentage;

                return (
                  <motion.circle
                    key={item.ecosystem}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={item.color}
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={`${strokeDasharray} ${circumference}`}
                    strokeDashoffset={strokeDashoffset}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                      pathLength: 1,
                      opacity: 1,
                      scale: [1, 1.02, 1],
                      strokeWidth: [14, 15, 14]
                    }}
                    transition={{
                      pathLength: { duration: 1, delay: 0.3 + index * 0.2 },
                      opacity: { duration: 1, delay: 0.3 + index * 0.2 },
                      scale: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: index * 0.5 },
                      strokeWidth: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: index * 0.5 }
                    }}
                    className="transition-all duration-300 hover:opacity-80"
                    style={{ cursor: "pointer", transformOrigin: "center" }}
                  />
                );
              });
            })()}
          </svg>
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8, type: "spring" }}
          >
            <span className="text-3xl font-bold theme-text-primary">
              <AnimatedCounter value={ecosystemData.length} duration={0.5} />
            </span>
            <span className="text-xs theme-text-muted">Ecosystems</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

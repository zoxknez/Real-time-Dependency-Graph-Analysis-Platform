"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, ExternalLink, Star, RefreshCw } from "lucide-react";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { cn, formatNumber, formatEcosystemName, getEcosystemBadgeClass } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// Query to get reverse dependents count for known popular packages
const GET_TOP_PACKAGES_DATA = gql`
  query GetTopPackagesData {
    tokio: reverseDependents(packageId: "cargo:tokio", maxDepth: 1, first: 1) {
      totalCount
    }
    serde: reverseDependents(packageId: "cargo:serde", maxDepth: 1, first: 1) {
      totalCount
    }
    axum: reverseDependents(packageId: "cargo:axum", maxDepth: 1, first: 1) {
      totalCount
    }
    hyper: reverseDependents(packageId: "cargo:hyper", maxDepth: 1, first: 1) {
      totalCount
    }
    clap: reverseDependents(packageId: "cargo:clap", maxDepth: 1, first: 1) {
      totalCount
    }
  }
`;

interface PackageData {
  id: string;
  name: string;
  ecosystem: string;
  dependents: number;
}

interface TopPackagesDataResponse {
  tokio?: { totalCount: number };
  serde?: { totalCount: number };
  axum?: { totalCount: number };
  hyper?: { totalCount: number };
  clap?: { totalCount: number };
}

type TopPackageKey = keyof TopPackagesDataResponse;

// Seed packages we want to track
const SEED_PACKAGES: Array<{ id: string; name: string; ecosystem: string; key: TopPackageKey }> = [
  { id: "cargo:tokio", name: "tokio", ecosystem: "CARGO", key: "tokio" },
  { id: "cargo:serde", name: "serde", ecosystem: "CARGO", key: "serde" },
  { id: "cargo:axum", name: "axum", ecosystem: "CARGO", key: "axum" },
  { id: "cargo:hyper", name: "hyper", ecosystem: "CARGO", key: "hyper" },
  { id: "cargo:clap", name: "clap", ecosystem: "CARGO", key: "clap" },
];

export function TopPackages() {
  const { data, loading, error, refetch } = useQuery<TopPackagesDataResponse>(GET_TOP_PACKAGES_DATA, {
    errorPolicy: "all",
    pollInterval: 60000, // Refresh every minute
  });

  const topPackages: PackageData[] = useMemo(() => {
    if (!data) return [];

    return SEED_PACKAGES
      .map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        ecosystem: pkg.ecosystem,
        dependents: data[pkg.key]?.totalCount || 0,
      }))
      .sort((a, b) => b.dependents - a.dependents);
  }, [data]);

  if (loading) {
    return (
      <div className="glass-card p-6 h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary-400" />
            <h3 className="text-lg font-semibold theme-text-primary">Top Packages</h3>
          </div>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="w-24 h-4 mb-1" />
                <Skeleton className="w-16 h-3" />
              </div>
              <Skeleton className="w-12 h-6" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 h-full border border-white/10 shadow-xl group hover:shadow-primary-500/10 transition-shadow">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-400" />
          <h3 className="text-lg font-semibold theme-text-primary">Top Packages</h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg theme-interactive transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <Link
            href="/explore"
            className="text-xs text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1"
          >
            View all
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {error && topPackages.length === 0 ? (
        <div className="text-center py-8">
          <p className="theme-text-muted text-sm">Failed to load packages</p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {topPackages.map((pkg, index) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                href={`/explore?q=${encodeURIComponent(pkg.id)}`}
                className="group flex items-center gap-4 p-3 rounded-xl theme-inner-card-hover transition-colors"
              >
                {/* Rank */}
                <div className="w-10 h-10 rounded-xl theme-inner-card flex items-center justify-center text-sm font-extrabold theme-text-muted group-hover:text-primary-400 group-hover:bg-primary-500/10 transition-all border border-transparent group-hover:border-primary-500/20">
                  {index + 1}
                </div>

                {/* Package Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium theme-text-primary group-hover:text-primary-400 transition-colors truncate">
                      {pkg.name}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                        getEcosystemBadgeClass(pkg.ecosystem)
                      )}
                    >
                      {formatEcosystemName(pkg.ecosystem)}
                    </span>
                  </div>
                  <div className="text-xs theme-text-muted">
                    by reverse dependents
                  </div>
                </div>

                {/* Dependents */}
                <div className="text-right">
                  <div className="flex items-center gap-1 theme-text-primary font-semibold">
                    <Star className="w-3 h-3 text-warning" />
                    {formatNumber(pkg.dependents)}
                  </div>
                  <div className="text-xs theme-text-muted">dependents</div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Package, ArrowUpRight, Activity, Bell, BellOff } from "lucide-react";
import { useQuery, gql } from "@apollo/client";
import { cn, formatEcosystemName, getEcosystemBadgeClass } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// Query for versions of popular packages to show recent activity
const GET_RECENT_VERSIONS = gql`
  query GetRecentVersions {
    tokioVersions: versions(packageId: "cargo:tokio", limit: 3) {
      id
      version
      publishedAt
    }
    serdeVersions: versions(packageId: "cargo:serde", limit: 3) {
      id
      version
      publishedAt
    }
    axumVersions: versions(packageId: "cargo:axum", limit: 3) {
      id
      version
      publishedAt
    }
  }
`;

interface ActivityItem {
  id: string;
  type: "version";
  package: string;
  packageId: string;
  ecosystem: string;
  version: string;
  time: string;
  timestamp: number;
}

const PACKAGE_INFO: Record<string, { name: string; ecosystem: string; id: string }> = {
  tokioVersions: { name: "tokio", ecosystem: "CARGO", id: "cargo:tokio" },
  serdeVersions: { name: "serde", ecosystem: "CARGO", id: "cargo:serde" },
  axumVersions: { name: "axum", ecosystem: "CARGO", id: "cargo:axum" },
};

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "recently";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function RecentActivity() {
  const [isLive, setIsLive] = useState(true);

  const { data, loading, error } = useQuery(GET_RECENT_VERSIONS, {
    pollInterval: isLive ? 30000 : 0, // Poll every 30 seconds if live
    errorPolicy: "all",
  });

  const activities: ActivityItem[] = useMemo(() => {
    if (!data) return [];

    const items: ActivityItem[] = [];

    Object.entries(PACKAGE_INFO).forEach(([key, info]) => {
      const versions = data[key] || [];
      versions.forEach((v: { id: string; version: string; publishedAt: string | null }) => {
        items.push({
          id: v.id,
          type: "version",
          package: info.name,
          packageId: info.id,
          ecosystem: info.ecosystem,
          version: v.version,
          time: formatTimeAgo(v.publishedAt),
          timestamp: v.publishedAt ? new Date(v.publishedAt).getTime() : 0,
        });
      });
    });

    // Sort by timestamp descending
    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }, [data]);

  if (loading) {
    return (
      <div className="glass-card p-6 h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent-400" />
            <h3 className="text-lg font-semibold theme-text-primary">Recent Activity</h3>
          </div>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="w-24 h-4 mb-1" />
                <Skeleton className="w-32 h-3" />
              </div>
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
          <Activity className="w-5 h-5 text-accent-400" />
          <h3 className="text-lg font-semibold theme-text-primary">Recent Activity</h3>
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
            isLive
              ? "text-success bg-success/10"
              : "theme-text-muted theme-inner-card"
          )}
        >
          {isLive ? (
            <>
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <Bell className="w-3 h-3" />
              Live
            </>
          ) : (
            <>
              <BellOff className="w-3 h-3" />
              Paused
            </>
          )}
        </button>
      </div>

      {error && activities.length === 0 ? (
        <div className="text-center py-8">
          <p className="theme-text-muted text-sm">No activity data</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.05 }}
                layout
              >
                <Link
                  href={`/explore?q=${encodeURIComponent(activity.packageId)}`}
                  className="group flex items-center gap-4 p-3 rounded-xl theme-inner-card-hover transition-colors"
                >
                  <div className="p-2 rounded-lg theme-inner-card group-hover:bg-primary-500/20 transition-colors">
                    <Package className="w-4 h-4 theme-text-muted group-hover:text-primary-400 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium theme-text-primary group-hover:text-primary-400 transition-colors truncate">
                        {activity.package}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          getEcosystemBadgeClass(activity.ecosystem)
                        )}
                      >
                        {formatEcosystemName(activity.ecosystem)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs theme-text-muted">
                      <span className="font-mono">v{activity.version}</span>
                      <span>•</span>
                      <Clock className="w-3 h-3" />
                      <span>{activity.time}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 theme-text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { 
  Package, 
  Layers, 
  GitBranch, 
  Activity,
  ArrowRight,
  Zap,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@apollo/client";
import { GET_GRAPH_STATS } from "@/lib/graphql/queries";
import { GetGraphStatsResponse } from "@/lib/graphql/types";
import { StatsCard } from "@/components/dashboard/stats-card";
import { EcosystemChart } from "@/components/dashboard/ecosystem-chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { TopPackages } from "@/components/dashboard/top-packages";
import { LiveStatsCard } from "@/components/dashboard/live-stats";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const { data, loading } = useQuery<GetGraphStatsResponse>(GET_GRAPH_STATS);

  const stats = data?.graphStats || {
    totalPackages: 0,
    totalVersions: 0,
    totalDependencies: 0,
    totalPackageDependencies: 0,
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Hero Section */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl">
        <div className="absolute inset-0 gradient-primary opacity-90" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative px-8 py-10 flex items-center justify-between">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-2 mb-4"
            >
              <Zap className="w-5 h-5 text-accent-300" />
              <span className="text-sm font-medium text-white/80">Enterprise-Grade Platform</span>
            </motion.div>
            <h1 className="text-4xl font-bold text-white mb-3">
              Inverse Dependency Platform
            </h1>
            <p className="text-lg text-white/70 mb-6">
              Explore, analyze, and visualize package dependencies across multiple ecosystems. 
              Track vulnerability impact and discover hidden connections in your dependency graph.
            </p>
            <div className="flex gap-4">
              <Link href="/explore" className="btn-secondary flex items-center gap-2">
                <Search className="w-4 h-4" />
                Explore Packages
              </Link>
              <Link href="/graph" className="flex items-center gap-2 text-white hover:text-accent-300 transition-colors font-medium">
                View Graph
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="hidden lg:block"
          >
            <div className="w-48 h-48 relative">
              <div className="absolute inset-0 rounded-full bg-white/10 animate-pulse-slow" />
              <div className="absolute inset-4 rounded-full bg-white/20 animate-pulse-slow animation-delay-200" />
              <div className="absolute inset-8 rounded-full bg-white/30 flex items-center justify-center">
                <GitBranch className="w-16 h-16 text-white" />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Packages"
          value={loading ? 0 : stats.totalPackages}
          icon={Package}
          description="Across all ecosystems"
          color="primary"
          loading={loading}
          href="/explore"
        />
        <StatsCard
          title="Total Versions"
          value={loading ? 0 : stats.totalVersions}
          icon={Layers}
          description="Package versions tracked"
          color="accent"
          loading={loading}
          href="/live"
        />
        <StatsCard
          title="Dependencies"
          value={loading ? 0 : stats.totalDependencies}
          icon={GitBranch}
          description="Dependency edges"
          color="success"
          loading={loading}
          href="/graph"
        />
        <StatsCard
          title="Pkg Dependencies"
          value={loading ? 0 : stats.totalPackageDependencies}
          icon={Activity}
          description="Package-level dependencies"
          color="warning"
          loading={loading}
          href="/impact"
        />
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ecosystem Distribution */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <EcosystemChart />
        </motion.div>

        {/* Live Stats - Real-time Activity */}
        <motion.div variants={itemVariants}>
          <LiveStatsCard />
        </motion.div>
      </div>

      {/* Middle Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <motion.div variants={itemVariants}>
          <QuickActions />
        </motion.div>
        
        {/* Top Packages */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <TopPackages />
        </motion.div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 gap-6">
        {/* Recent Activity */}
        <motion.div variants={itemVariants}>
          <RecentActivity />
        </motion.div>
      </div>
    </motion.div>
  );
}

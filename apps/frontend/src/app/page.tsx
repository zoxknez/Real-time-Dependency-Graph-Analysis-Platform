"use client";

import { motion } from "framer-motion";
import {
  Package,
  Layers,
  GitBranch,
  Activity,
  ArrowRight,
  Sparkles,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

// Search Component with Command Console style
function CommandSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative group w-full max-w-lg">
      <div className="absolute inset-0 bg-primary-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-center">
        <div className="absolute left-4 text-slate-400 group-focus-within:text-primary-400 transition-colors">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search packages (e.g., cargo:actix, npm:react)..."
          data-testid="search-input"
          aria-label="Search packages"
          className="w-full h-14 pl-12 pr-4 bg-slate-950/80 border border-white/10 rounded-2xl outline-none text-white placeholder:text-slate-600 focus:border-primary-500/50 focus:bg-slate-900/90 transition-all shadow-xl backdrop-blur-md"
        />
        <button
          type="submit"
          className="absolute right-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors border border-white/5"
        >
          Execute
        </button>
      </div>
    </form>
  );
}

// System Status Indicator
function SystemStatus() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md">
      <div className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
      </div>
      <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">System Online</span>
    </div>
  );
}

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
      className="space-y-8"
    >
      {/* Hero / Command Center */}
      <motion.div variants={itemVariants} className="relative rounded-3xl overflow-hidden border border-white/10 bg-slate-950 shadow-2xl group">
        {/* Animated Backgrounds */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,27,0.8)_2px,transparent_2px),linear-gradient(90deg,rgba(18,18,27,0.8)_2px,transparent_2px)] bg-[size:40px_40px] opacity-20 -z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_60%)] -z-10" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/20 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-500/20 rounded-full blur-[100px] animate-pulse-slow animation-delay-500" />

        <div className="relative p-8 md:p-12">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            {/* Left Content */}
            <div className="flex-1 text-center lg:text-left space-y-8">
              <div className="flex flex-col lg:flex-row items-center gap-6 mb-2 justify-center lg:justify-start">
                <SystemStatus />
                <div className="flex items-center gap-2 text-slate-300 text-xs font-mono uppercase tracking-widest">
                  <Activity className="w-4 h-4" />
                  <span>Monitoring Global Registry Sync</span>
                </div>
              </div>

              <div>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-none text-white mb-4">
                  COMMAND <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">CENTER</span>
                </h1>
                <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto lg:mx-0 font-light leading-relaxed">
                  Advanced dependency intelligence platform tracking <span className="text-white font-bold">{loading ? "..." : (stats.totalPackages / 1000000).toFixed(1)}M+</span> packages across the global software supply chain.
                </p>
              </div>

              <div className="flex flex-col items-center lg:items-start gap-6">
                <CommandSearch />

                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm font-medium text-slate-400">
                  <span className="uppercase tracking-widest text-[10px] font-bold text-slate-600">Quick Access:</span>
                  <Link href="/graph" className="hover:text-primary-400 transition-colors flex items-center gap-1.5 group/link">
                    <GitBranch className="w-4 h-4" /> Graph <ArrowRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 -translate-x-1 group-hover/link:translate-x-0 transition-all" />
                  </Link>
                  <span className="w-1 h-1 rounded-full bg-slate-800" />
                  <Link href="/live" className="hover:text-emerald-400 transition-colors flex items-center gap-1.5 group/link">
                    <Activity className="w-4 h-4" /> Live Feed <ArrowRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 -translate-x-1 group-hover/link:translate-x-0 transition-all" />
                  </Link>
                  <span className="w-1 h-1 rounded-full bg-slate-800" />
                  <Link href="/ask" className="hover:text-accent-400 transition-colors flex items-center gap-1.5 group/link">
                    <Sparkles className="w-4 h-4" /> Ask AI <ArrowRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 -translate-x-1 group-hover/link:translate-x-0 transition-all" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Visualization */}
            <div className="hidden lg:block relative w-[400px] h-[400px]">
              <div className="absolute inset-0 rounded-full border border-white/5 animate-[spin_60s_linear_infinite]" />
              <div className="absolute inset-12 rounded-full border border-white/5 border-dashed animate-[spin_40s_linear_infinite_reverse]" />
              <div className="absolute inset-24 rounded-full border border-white/10 animate-[spin_20s_linear_infinite]" />

              {/* Radar Sweep */}
              <div className="absolute inset-0 rounded-full overflow-hidden opacity-20">
                <div className="w-1/2 h-1/2 absolute top-0 right-0 bg-gradient-to-bl from-transparent via-primary-500/20 to-transparent animate-[spin_4s_linear_infinite] origin-bottom-left" />
              </div>

              {/* Central Node */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-slate-950/80 border border-white/20 backdrop-blur-xl flex items-center justify-center shadow-[0_0_50px_rgba(59,130,246,0.2)] relative group/node">
                  <div className="absolute inset-0 bg-primary-500/10 rounded-full animate-pulse" />
                  <Layers className="w-12 h-12 text-white relative z-10" />
                </div>
              </div>

              {/* Orbiting Nodes */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 px-3 py-1.5 glass-card text-[10px] font-bold text-accent-400 border-accent-500/30">NPM</div>
              </motion.div>
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute inset-12"
              >
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4 px-3 py-1.5 glass-card text-[10px] font-bold text-primary-400 border-primary-500/30">CRATES</div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="border-t border-white/5 bg-white/[0.02] px-8 py-4 flex items-center justify-between text-xs font-mono text-slate-300">
          <div className="flex items-center gap-8">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> KAFKA: CONNECTED</span>
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> DB: ONLINE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="animate-pulse">PROCESSING INCOMING SIGNALS...</span>
          </div>
        </div>
      </motion.div>

      <h2 className="sr-only">Dashboard Sections</h2>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Packages"
          value={loading ? 0 : stats.totalPackages}
          icon={Package}
          description="Global Registry Index"
          color="primary"
          loading={loading}
          href="/explore"
        />
        <StatsCard
          title="Total Versions"
          value={loading ? 0 : stats.totalVersions}
          icon={Layers}
          description="Version History Points"
          color="accent"
          loading={loading}
          href="/live"
        />
        <StatsCard
          title="Dependencies"
          value={loading ? 0 : stats.totalDependencies}
          icon={GitBranch}
          description="Active Graph Edges"
          color="success"
          loading={loading}
          href="/graph"
        />
        <StatsCard
          title="Pkg Dependencies"
          value={loading ? 0 : stats.totalPackageDependencies}
          icon={Activity}
          description="Relation Mapping"
          color="warning"
          loading={loading}
          href="/impact"
        />
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ecosystem Distribution */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-card p-1">
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

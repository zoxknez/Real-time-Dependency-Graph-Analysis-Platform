"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Package,
  Pause,
  Play,
  Trash2,
  TrendingUp,
  Zap,
  ExternalLink,
  Bell,
  BellOff,
  GitBranch,
  Shield,
  BarChart3,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn, formatEcosystemName, getEcosystemColor } from "@/lib/utils";
import { EcosystemFilter } from "@/components/explore/ecosystem-filter";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import {
  useLivePackageActivity,
  useBreakingChanges,
} from "@/lib/hooks";
import type { Ecosystem, EventType, LivePackageEvent } from "@/lib/graphql/types";

// TypeScript types for legacy simulation fallback
interface SimulatedEvent {
  id: string;
  package: string;
  ecosystem: "CARGO" | "NPM" | "PY_PI";
  version: string;
  time: Date;
  type: "publish" | "update" | "yank";
}

// More realistic package names by ecosystem
const PACKAGE_NAMES: Record<string, string[]> = {
  CARGO: [
    "tokio", "serde", "anyhow", "thiserror", "clap", "tracing", "axum", "hyper",
    "reqwest", "rand", "regex", "chrono", "uuid", "log", "once_cell", "lazy_static",
    "futures", "async-trait", "parking_lot", "bytes", "tower", "tonic", "sqlx",
  ],
  NPM: [
    "express", "react", "lodash", "axios", "moment", "typescript", "webpack",
    "eslint", "prettier", "jest", "mocha", "chai", "next", "vue", "angular",
    "redux", "graphql", "apollo-client", "socket.io", "mongoose", "prisma",
  ],
  PY_PI: [
    "requests", "flask", "django", "numpy", "pandas", "tensorflow", "pytorch",
    "scikit-learn", "matplotlib", "pytest", "black", "mypy", "fastapi", "uvicorn",
    "sqlalchemy", "celery", "redis", "boto3", "pillow", "beautifulsoup4",
  ],
};

const ALL_ECOSYSTEMS: ("CARGO" | "NPM" | "PY_PI")[] = ["CARGO", "NPM", "PY_PI"];
const EVENT_TYPES: ("publish" | "update" | "yank")[] = ["publish", "publish", "publish", "update", "update", "yank"];
const EVENT_TYPE_OPTIONS = [
  { value: "ALL", label: "All Events", icon: Activity },
  { value: "publish", label: "New Versions", icon: Zap, color: "text-success" },
  { value: "update", label: "Updates", icon: TrendingUp, color: "text-primary-400" },
  { value: "yank", label: "Yanked", icon: Trash2, color: "text-warning" },
];

// Map live event type to display type
function mapEventType(type: EventType | string): "publish" | "update" | "yank" {
  switch (type) {
    case "PUBLISH": return "publish";
    case "UPDATE": return "update";
    case "YANK":
    case "DEPRECATE": return "yank";
    default: return "publish";
  }
}

// Convert live event to display format
function toDisplayEvent(event: LivePackageEvent): SimulatedEvent {
  return {
    id: event.id,
    package: event.package.name,
    ecosystem: event.package.ecosystem as "CARGO" | "NPM" | "PY_PI",
    version: event.version,
    time: new Date(event.timestamp),
    type: mapEventType(event.type),
  };
}

// Generate random realistic version for fallback
const generateVersion = (ecosystem: string): string => {
  const major = Math.floor(Math.random() * 5);
  const minor = Math.floor(Math.random() * 30);
  const patch = Math.floor(Math.random() * 20);

  if (ecosystem === "NPM" && Math.random() > 0.9) {
    return `${major}.${minor}.${patch}-beta.${Math.floor(Math.random() * 5)}`;
  }
  if (ecosystem === "CARGO" && Math.random() > 0.95) {
    return `${major}.${minor}.${patch}-rc.${Math.floor(Math.random() * 3) + 1}`;
  }

  return `${major}.${minor}.${patch}`;
};

export default function LivePage() {
  const router = useRouter();
  const [isPaused, setIsPaused] = useState(false);
  const [selectedEcosystem, setSelectedEcosystem] = useState("ALL");
  const [selectedEventType, setSelectedEventType] = useState("ALL");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  // Simulated events state (fallback mode)
  const [simulatedEvents, setSimulatedEvents] = useState<SimulatedEvent[]>([]);
  const eventIdRef = useRef(10);
  const startTimeRef = useRef(Date.now());

  // Convert filter values to subscription variables
  const ecosystemFilter = selectedEcosystem === "ALL"
    ? undefined
    : [selectedEcosystem as Ecosystem];
  const eventTypeFilter = selectedEventType === "ALL"
    ? undefined
    : [selectedEventType.toUpperCase() as EventType];

  // Real-time subscription hook
  const {
    events: liveEvents,
    stats: liveStats,
    loading: _liveLoading,
    error: liveError,
    clearEvents: clearLiveEvents,
  } = useLivePackageActivity({
    ecosystems: ecosystemFilter,
    eventTypes: eventTypeFilter,
    paused: isPaused || useFallback,
    onEvent: (_event) => {
      // Play sound notification if enabled
      if (soundEnabled && typeof window !== 'undefined') {
        // Could add subtle notification sound here
      }
    },
  });

  // Breaking changes subscription
  const {
    breakingChanges: _breakingChanges,
    unreadCount: breakingChangesCount,
  } = useBreakingChanges({
    paused: isPaused || useFallback,
  });

  // Auto-fallback if subscription fails
  useEffect(() => {
    if (liveError && !useFallback) {
      console.warn("[Live] Subscription error, falling back to simulation:", liveError);
      setUseFallback(true);
    }
  }, [liveError, useFallback]);

  // Generate a simulated event (fallback mode)
  const generateEvent = useCallback((): SimulatedEvent => {
    const ecosystemIndex = Math.floor(Math.random() * ALL_ECOSYSTEMS.length);
    const ecosystem = ALL_ECOSYSTEMS[ecosystemIndex]!;
    const packages = PACKAGE_NAMES[ecosystem]!;
    const packageName = packages[Math.floor(Math.random() * packages.length)]!;
    const typeIndex = Math.floor(Math.random() * EVENT_TYPES.length);
    const type = EVENT_TYPES[typeIndex]!;

    return {
      id: String(eventIdRef.current++),
      package: packageName,
      ecosystem,
      version: generateVersion(ecosystem),
      time: new Date(),
      type,
    };
  }, []);

  // Simulate incoming events (fallback mode only)
  useEffect(() => {
    if (!useFallback || isPaused) return;

    const interval = setInterval(() => {
      const newEvent = generateEvent();
      setSimulatedEvents((prev) => [newEvent, ...prev].slice(0, 100));
    }, 1500 + Math.random() * 2500);

    return () => clearInterval(interval);
  }, [useFallback, isPaused, generateEvent]);

  // Combine events from live or fallback source
  const displayEvents = useMemo(() => {
    if (useFallback) {
      return simulatedEvents;
    }
    // Convert live events to display format
    return liveEvents.map(toDisplayEvent);
  }, [useFallback, simulatedEvents, liveEvents]);

  // Statistics
  const stats = useMemo(() => {
    const events = displayEvents;
    const byEcosystem = events.reduce((acc, e) => {
      acc[e.ecosystem] = (acc[e.ecosystem] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byType = events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const elapsedMinutes = Math.max(1, (Date.now() - startTimeRef.current) / 60000);
    const eventsPerMinute = useFallback
      ? Math.round((events.length / elapsedMinutes) * 10) / 10
      : liveStats.eventsPerMinute;

    return { byEcosystem, byType, total: events.length, eventsPerMinute };
  }, [displayEvents, useFallback, liveStats]);

  // Navigation handlers
  const navigateToGraph = useCallback((ecosystem: string, pkg: string) => {
    router.push(`/graph?pkg=${encodeURIComponent(`${ecosystem.toLowerCase()}:${pkg}`)}`);
  }, [router]);

  const navigateToImpact = useCallback((ecosystem: string, pkg: string) => {
    router.push(`/impact?pkg=${encodeURIComponent(`${ecosystem.toLowerCase()}:${pkg}`)}`);
  }, [router]);

  const filteredEvents = useMemo(() => {
    return displayEvents.filter((e) => {
      const ecosystemMatch = selectedEcosystem === "ALL" || e.ecosystem === selectedEcosystem;
      const typeMatch = selectedEventType === "ALL" || e.type === selectedEventType;
      return ecosystemMatch && typeMatch;
    });
  }, [displayEvents, selectedEcosystem, selectedEventType]);

  const clearEvents = useCallback(() => {
    if (useFallback) {
      setSimulatedEvents([]);
    } else {
      clearLiveEvents();
    }
    startTimeRef.current = Date.now();
  }, [useFallback, clearLiveEvents]);

  const toggleFallback = useCallback(() => {
    setUseFallback(prev => !prev);
    if (!useFallback) {
      // Switching to fallback, clear live events
      clearLiveEvents();
    } else {
      // Switching to live, clear simulated
      setSimulatedEvents([]);
    }
    startTimeRef.current = Date.now();
  }, [useFallback, clearLiveEvents]);

  const formatTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString();
  };

  // Header - Mission Control Style
  const Header = () => (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-8"
    >
      <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-surface-200 dark:via-white/10 to-transparent -z-10" />
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-center gap-4 theme-bg-primary px-6 py-2 relative z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-accent-500/20 blur-xl rounded-full animate-pulse" />
            <Activity className="w-8 h-8 text-accent-400 relative z-10" />
          </div>
          <div>
            <h1 className="text-3xl font-black theme-text-primary tracking-tight leading-none">
              MISSION <span className="text-gradient-accent">CONTROL</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
              <p className="text-[10px] uppercase font-bold tracking-[0.2em] theme-text-muted">
                Global dependency feed
              </p>
            </div>
          </div>
        </div>

        {/* Controls Console */}
        <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-2 rounded-xl border theme-border shadow-lg">
          {breakingChangesCount > 0 && (
            <button
              onClick={() => router.push("/breaking-changes")}
              className="relative px-3 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 border border-danger/20 text-danger text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all group"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Alerts</span>
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] text-white">
                {breakingChangesCount}
              </span>
            </button>
          )}

          <div className="w-px h-6 bg-surface-200 dark:bg-white/10 mx-1" />

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={cn(
              "p-2 rounded-lg border transition-all relative group",
              isPaused
                ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                : "bg-surface-100 dark:bg-white/5 border-surface-200 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:text-surface-900 hover:dark:text-white hover:bg-surface-200 dark:hover:bg-white/10"
            )}
            title={isPaused ? "Resume Feed" : "Pause Feed"}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <button
            onClick={clearEvents}
            className="p-2 rounded-lg bg-surface-100 dark:bg-white/5 border border-surface-200 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:text-surface-900 hover:dark:text-white hover:bg-surface-200 dark:hover:bg-white/10 transition-all"
            title="Clear Buffer"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn(
              "p-2 rounded-lg border transition-all",
              soundEnabled
                ? "bg-accent-500/10 border-accent-500/20 text-accent-400"
                : "bg-surface-100 dark:bg-white/5 border border-surface-200 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:text-surface-900 hover:dark:text-white hover:bg-surface-200 dark:hover:bg-white/10"
            )}
            title="Toggle Sound"
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          <div className="w-px h-6 bg-surface-200 dark:bg-white/10 mx-1" />

          <button
            onClick={toggleFallback}
            className={cn(
              "px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              useFallback
                ? "bg-surface-100 dark:bg-white/5 border-surface-200 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:bg-surface-200 dark:hover:bg-white/10"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", !useFallback && "animate-spin-slow")} />
            <span className="hidden sm:inline">{useFallback ? "SIMULATING" : "LIVE SYNC"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );

  // Stats Modules
  const StatsModules = () => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
      {/* Total Events */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative group p-4 rounded-xl theme-inner-card border theme-border backdrop-blur-sm overflow-hidden"
      >
        <div className="absolute inset-0 bg-primary-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
        <div className="relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted mb-1">Total signals</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black theme-text-primary tracking-tight">
              <AnimatedCounter value={stats.total} />
            </span>
          </div>
        </div>
        <div className="absolute top-2 right-2 p-1.5 rounded-lg theme-pill text-primary-400">
          <Activity className="w-3.5 h-3.5" />
        </div>
      </motion.div>

      {/* OPS/MIN */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05 }}
        className="relative group p-4 rounded-xl theme-inner-card border theme-border backdrop-blur-sm overflow-hidden"
      >
        <div className="absolute inset-0 bg-emerald-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
        <div className="relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted mb-1">Throughput</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-500 dark:text-emerald-400 tracking-tight">
              {stats.eventsPerMinute}
            </span>
            <span className="text-[10px] font-mono text-emerald-600/70 dark:text-emerald-500/70">events/m</span>
          </div>
        </div>
        <div className="absolute top-2 right-2 p-1.5 rounded-lg theme-pill text-emerald-500 dark:text-emerald-400">
          <BarChart3 className="w-3.5 h-3.5" />
        </div>
      </motion.div>

      {/* Ecosystem Stats */}
      {ALL_ECOSYSTEMS.map((eco, idx) => (
        <motion.div
          key={eco}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + idx * 0.05 }}
          onClick={() => setSelectedEcosystem(selectedEcosystem === eco ? "ALL" : eco)}
          className={cn(
            "relative group p-4 rounded-xl border backdrop-blur-sm overflow-hidden cursor-pointer transition-all",
            selectedEcosystem === eco
              ? "bg-surface-200 dark:bg-slate-800/80 border-surface-300 dark:border-white/20 shadow-lg ring-1 ring-surface-300/30 dark:ring-white/10"
              : "theme-inner-card border theme-border hover:theme-inner-card-hover"
          )}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: `${getEcosystemColor(eco)}10` }} />

          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted mb-1" style={{ color: selectedEcosystem === eco ? getEcosystemColor(eco) : undefined }}>
              {formatEcosystemName(eco)}
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black theme-text-primary tracking-tight">
                <AnimatedCounter value={stats.byEcosystem[eco] || 0} />
              </span>
            </div>
          </div>
          <div className="absolute top-2 right-2 p-1.5 rounded-lg theme-pill opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: getEcosystemColor(eco) }}>
            <Package className="w-3.5 h-3.5" />
          </div>
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="relative min-h-[calc(100vh-4rem)] -mt-6 -mx-4 md:-mx-8 px-4 md:px-8 py-8 overflow-hidden">
      {/* Background Layer */}
      <div className="absolute inset-0 theme-bg-primary -z-20" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,27,0.8)_2px,transparent_2px),linear-gradient(90deg,rgba(18,18,27,0.8)_2px,transparent_2px)] bg-[size:40px_40px] opacity-[0.04] dark:opacity-20 -z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.06),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.15),transparent_70%)] -z-10" />

      <div className="max-w-7xl mx-auto relative">
        <Header />
        <StatsModules />

        {/* Status Bar & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col lg:flex-row gap-4 mb-4"
        >
          {/* Status Indicator */}
          <div className="glass-card px-4 py-3 flex items-center gap-4 min-w-[240px]">
            <div className="relative">
              <div className={cn("w-3 h-3 rounded-full", isPaused ? "bg-amber-500" : "bg-emerald-500")} />
              {!isPaused && <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-50" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-widest theme-text-muted">System Status</span>
              <span className={cn("text-xs font-mono font-bold", isPaused ? "text-amber-500" : "text-emerald-400 uppercase")}>
                {isPaused ? "PAUSED - BUFFERING" : "ONLINE - STREAMING"}
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="glass-card p-2 flex-1 flex items-center justify-between gap-4 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1">
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedEventType(opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-2 border",
                    selectedEventType === opt.value
                      ? "bg-surface-200 dark:bg-slate-800 border-surface-300 dark:border-white/20 theme-text-primary shadow-lg"
                      : "border-transparent theme-text-muted hover:theme-text-primary hover:bg-surface-100 dark:hover:bg-white/5"
                  )}
                >
                  <opt.icon className={cn("w-3 h-3", opt.color)} />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="pl-4 border-l theme-border">
              <EcosystemFilter selected={selectedEcosystem} onSelect={setSelectedEcosystem} />
            </div>
          </div>
        </motion.div>

        {/* Data Stream */}
        <div className="glass-card overflow-hidden relative min-h-[500px]">
          {/* Header Row */}
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-3 bg-surface-100/50 dark:bg-slate-950/50 border-b theme-border text-[10px] font-bold uppercase tracking-widest theme-text-muted">
            <div className="w-8 text-center">Sys</div>
            <div>Package Identity</div>
            <div className="text-center w-24 hidden md:block">Event</div>
            <div className="text-right w-32">Version</div>
          </div>

          <div className="relative h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <AnimatePresence initial={false}>
              {filteredEvents.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center opacity-50">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="w-24 h-24 rounded-full border-2 border-dashed border-slate-700 mb-8"
                  />
                  <h3 className="text-xl font-bold theme-text-primary mb-2">Scanning global frequencies</h3>
                  <p className="text-sm font-mono text-slate-500">Awaiting incoming data packets...</p>
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="group border-b theme-border hover:theme-bg-hover transition-colors relative"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-4 items-center">
                      {/* Ecosystem Icon */}
                      <div className="w-8 flex justify-center">
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center"
                          style={{ backgroundColor: `${getEcosystemColor(event.ecosystem)}15` }}
                        >
                          <Package className="w-3.5 h-3.5" style={{ color: getEcosystemColor(event.ecosystem) }} />
                        </div>
                      </div>

                      {/* Package Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold theme-text-primary font-mono group-hover:text-accent-500 dark:group-hover:text-accent-400 transition-colors truncate">
                            {event.package}
                          </span>
                          <span className="text-[10px] theme-text-muted font-mono">
                            {formatTime(event.time)}
                          </span>
                        </div>
                      </div>

                      {/* Event Type */}
                      <div className="hidden md:flex justify-center w-24">
                        <div className={cn(
                          "text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5",
                          event.type === "publish" ? "text-emerald-600 dark:text-emerald-400" :
                            event.type === "update" ? "text-primary-600 dark:text-primary-400" : "text-red-500 dark:text-red-400"
                        )}>
                          {event.type === "publish" && <Zap className="w-3 h-3" />}
                          {event.type === "update" && <TrendingUp className="w-3 h-3" />}
                          {event.type === "yank" && <Trash2 className="w-3 h-3" />}
                          {event.type}
                        </div>
                      </div>

                      {/* Version & Actions */}
                      <div className="w-32 flex justify-end items-center gap-4 relative">
                        <span className={cn(
                          "font-mono text-xs px-2 py-1 rounded theme-pill border theme-border group-hover:theme-border-strong transition-colors",
                          event.type === "yank" && "line-through opacity-50"
                        )}>
                          v{event.version}
                        </span>

                        {/* Hover Actions */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all theme-panel shadow-xl rounded-lg p-1 border backdrop-blur-md translate-x-4 group-hover:translate-x-0 z-10">
                          <button
                            onClick={(e) => { e.preventDefault(); navigateToGraph(event.ecosystem, event.package); }}
                            className="p-1.5 rounded hover:bg-primary-500/20 theme-text-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            title="Graph"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); navigateToImpact(event.ecosystem, event.package); }}
                            className="p-1.5 rounded hover:bg-red-500/20 theme-text-muted hover:text-red-650 dark:hover:text-red-400 transition-colors"
                            title="Impact"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`/explore?q=${event.ecosystem.toLowerCase()}:${event.package}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-white/10 theme-text-muted hover:theme-text-primary transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Radio,
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
  Filter,
  Clock,
  BarChart3,
} from "lucide-react";
import { cn, formatEcosystemName, getEcosystemColor, getEcosystemBadgeClass } from "@/lib/utils";
import { EcosystemFilter } from "@/components/explore/ecosystem-filter";
import { AnimatedCounter } from "@/components/ui/animated-counter";

// TypeScript types
interface LiveEvent {
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

// Generate random realistic version
const generateVersion = (ecosystem: string): string => {
  const major = Math.floor(Math.random() * 5);
  const minor = Math.floor(Math.random() * 30);
  const patch = Math.floor(Math.random() * 20);
  
  // Some ecosystems use pre-release versions more often
  if (ecosystem === "NPM" && Math.random() > 0.9) {
    return `${major}.${minor}.${patch}-beta.${Math.floor(Math.random() * 5)}`;
  }
  if (ecosystem === "CARGO" && Math.random() > 0.95) {
    return `${major}.${minor}.${patch}-rc.${Math.floor(Math.random() * 3) + 1}`;
  }
  
  return `${major}.${minor}.${patch}`;
};

// Initial mock events
const generateInitialEvents = (): LiveEvent[] => {
  return [
    { id: "1", package: "tokio", ecosystem: "CARGO", version: "1.40.0", time: new Date(Date.now() - 5000), type: "publish" },
    { id: "2", package: "express", ecosystem: "NPM", version: "4.21.0", time: new Date(Date.now() - 10000), type: "update" },
    { id: "3", package: "requests", ecosystem: "PY_PI", version: "2.32.3", time: new Date(Date.now() - 15000), type: "publish" },
    { id: "4", package: "serde", ecosystem: "CARGO", version: "1.0.210", time: new Date(Date.now() - 20000), type: "publish" },
    { id: "5", package: "flask", ecosystem: "PY_PI", version: "3.0.3", time: new Date(Date.now() - 25000), type: "update" },
  ];
};

export default function LivePage() {
  const router = useRouter();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedEcosystem, setSelectedEcosystem] = useState("ALL");
  const [selectedEventType, setSelectedEventType] = useState("ALL");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const eventIdRef = useRef(10);
  const startTimeRef = useRef(Date.now());

  // Statistics
  const stats = useMemo(() => {
    const byEcosystem = events.reduce((acc, e) => {
      acc[e.ecosystem] = (acc[e.ecosystem] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byType = events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Calculate events per minute
    const elapsedMinutes = Math.max(1, (Date.now() - startTimeRef.current) / 60000);
    const eventsPerMinute = Math.round((events.length / elapsedMinutes) * 10) / 10;
    
    return { byEcosystem, byType, total: events.length, eventsPerMinute };
  }, [events]);

  // Generate a new random event
  const generateEvent = useCallback((): LiveEvent => {
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

  // Simulate incoming events
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const newEvent = generateEvent();
      setEvents((prev) => [newEvent, ...prev].slice(0, 100));
      
      // Play sound if enabled (optional UX feature)
      if (soundEnabled && typeof window !== 'undefined') {
        // Could add subtle notification sound here
      }
    }, 1500 + Math.random() * 2500);

    return () => clearInterval(interval);
  }, [isPaused, generateEvent, soundEnabled]);

  // Initialize with some events
  useEffect(() => {
    setEvents(generateInitialEvents());
  }, []);

  // Navigation handlers
  const navigateToGraph = useCallback((ecosystem: string, pkg: string) => {
    router.push(`/graph?pkg=${encodeURIComponent(`${ecosystem.toLowerCase()}:${pkg}`)}`);
  }, [router]);

  const navigateToImpact = useCallback((ecosystem: string, pkg: string) => {
    router.push(`/impact?pkg=${encodeURIComponent(`${ecosystem.toLowerCase()}:${pkg}`)}`);
  }, [router]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const ecosystemMatch = selectedEcosystem === "ALL" || e.ecosystem === selectedEcosystem;
      const typeMatch = selectedEventType === "ALL" || e.type === selectedEventType;
      return ecosystemMatch && typeMatch;
    });
  }, [events, selectedEcosystem, selectedEventType]);

  const formatTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold theme-text-primary flex items-center gap-3">
            <Activity className="w-8 h-8 text-accent-400" />
            Live Feed
          </h1>
          <p className="theme-text-muted mt-1">
            Real-time package version updates across ecosystems
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={cn(
              "btn-secondary flex items-center gap-2",
              isPaused && "border-warning/50 text-warning"
            )}
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            )}
          </button>
          <button
            onClick={() => setEvents([])}
            className="btn-secondary flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn(
              "btn-secondary flex items-center gap-2",
              soundEnabled && "border-accent-500/50 text-accent-400"
            )}
            title={soundEnabled ? "Disable notifications" : "Enable notifications"}
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-500/20">
              <Activity className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="text-2xl font-bold theme-text-primary">
                <AnimatedCounter value={stats.total} />
              </p>
              <p className="text-xs theme-text-muted">Total Events</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="glass-card p-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-500/20">
              <BarChart3 className="w-5 h-5 text-accent-400" />
            </div>
            <div>
              <p className="text-2xl font-bold theme-text-primary">
                {stats.eventsPerMinute}
              </p>
              <p className="text-xs theme-text-muted">Events/min</p>
            </div>
          </div>
        </motion.div>
        {ALL_ECOSYSTEMS.map((eco, idx) => (
          <motion.div
            key={eco}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + idx * 0.05 }}
            className="glass-card p-4 cursor-pointer hover:border-primary-500/30 transition-colors"
            onClick={() => setSelectedEcosystem(selectedEcosystem === eco ? "ALL" : eco)}
          >
            <div className="flex items-center gap-3">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${getEcosystemColor(eco)}20` }}
              >
                <Package className="w-5 h-5" style={{ color: getEcosystemColor(eco) }} />
              </div>
              <div>
                <p className="text-2xl font-bold theme-text-primary">
                  <AnimatedCounter value={stats.byEcosystem[eco] || 0} />
                </p>
                <p className="text-xs theme-text-muted">{formatEcosystemName(eco)}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Status Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Radio
                className={cn(
                  "w-5 h-5",
                  isPaused ? "text-warning" : "text-success animate-pulse"
                )}
              />
              <span
                className={cn(
                  "text-sm font-medium",
                  isPaused ? "text-warning" : "text-success"
                )}
              >
                {isPaused ? "Paused" : "Connected"}
              </span>
            </div>
            <div className="w-px h-6 theme-border" />
            <span className="text-sm theme-text-muted">
              {filteredEvents.length} of {events.length} events
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Event Type Filter */}
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 theme-text-faint mr-1" />
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedEventType(opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5",
                    selectedEventType === opt.value
                      ? "theme-panel theme-text-primary"
                      : "theme-text-muted theme-hover-text theme-inner-card-hover"
                  )}
                >
                  <opt.icon className={cn("w-3 h-3", opt.color)} />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="w-px h-6 theme-border hidden lg:block" />

            <EcosystemFilter
              selected={selectedEcosystem}
              onSelect={setSelectedEcosystem}
            />
          </div>
        </div>
      </motion.div>

      {/* Events List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card overflow-hidden"
      >
        <div className="p-4 theme-border border-b">
          <h3 className="text-sm font-semibold theme-text-tertiary">
            Version Events
          </h3>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          <AnimatePresence initial={false}>
            {filteredEvents.length === 0 ? (
              <div className="p-12 text-center theme-text-faint">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No events yet...</p>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, height: 0, x: -20 }}
                  animate={{ opacity: 1, height: "auto", x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="block border-b theme-border last:border-0 group"
                >
                  <div className="flex items-center gap-4 p-4 theme-inner-card-hover transition-colors">
                    {/* Pulse Indicator */}
                    <div className="relative">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getEcosystemColor(event.ecosystem) }}
                      />
                      <div
                        className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-75"
                        style={{ backgroundColor: getEcosystemColor(event.ecosystem) }}
                      />
                    </div>

                    {/* Package Info */}
                    <div className="p-2 rounded-lg theme-inner-card group-hover:theme-inner-card-hover transition-colors">
                      <Package className="w-5 h-5 theme-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium theme-text-primary group-hover:text-primary-400 transition-colors">
                          {event.package}
                        </span>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            getEcosystemBadgeClass(event.ecosystem)
                          )}
                        >
                          {formatEcosystemName(event.ecosystem)}
                        </span>
                      </div>
                      <p className="text-sm theme-text-muted mt-0.5 flex items-center gap-2">
                        {event.type === "publish" && (
                          <>
                            <Zap className="w-3 h-3 text-success" />
                            <span className="text-success">New version published</span>
                          </>
                        )}
                        {event.type === "update" && (
                          <>
                            <TrendingUp className="w-3 h-3 text-primary-400" />
                            <span className="text-primary-400">Version updated</span>
                          </>
                        )}
                        {event.type === "yank" && (
                          <>
                            <Trash2 className="w-3 h-3 text-warning" />
                            <span className="text-warning">Version yanked</span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Version */}
                    <div className="text-right">
                      <span className={cn(
                        "font-mono text-sm px-2 py-1 rounded",
                        event.type === "yank" 
                          ? "text-warning bg-warning/10 line-through" 
                          : "text-accent-400 bg-accent-500/10"
                      )}>
                        v{event.version}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="text-sm theme-text-faint min-w-[70px] text-right">
                      {formatTime(event.time)}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          navigateToGraph(event.ecosystem, event.package);
                        }}
                        className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                        title="View in Graph"
                      >
                        <GitBranch className="w-4 h-4 text-primary-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          navigateToImpact(event.ecosystem, event.package);
                        }}
                        className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                        title="Impact Analysis"
                      >
                        <Shield className="w-4 h-4 text-danger" />
                      </button>
                      <a
                        href={`/explore?q=${event.ecosystem.toLowerCase()}:${event.package}`}
                        className="p-1.5 rounded-lg theme-inner-card-hover transition-colors"
                        title="View Details"
                      >
                        <ExternalLink className="w-4 h-4 theme-text-muted" />
                      </a>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

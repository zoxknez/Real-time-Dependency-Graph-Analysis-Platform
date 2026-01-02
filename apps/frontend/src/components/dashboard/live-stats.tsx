"use client";

import { useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Activity, TrendingUp, TrendingDown, Minus, Zap, Users, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveStats, useConnectionStatus } from "@/lib/hooks";
import type { LiveStats, EcosystemStat, EcosystemActivity } from "@/lib/graphql/types";

interface LiveStatsCardProps {
  className?: string;
}

export function LiveStatsCard({ className }: LiveStatsCardProps) {
  const connectionStatus = useConnectionStatus();
  const { stats, history, loading } = useLiveStats({
    paused: false,
  });

  const isConnected = connectionStatus === "connected";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("glass-card p-6", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-500/20">
            <Activity className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h3 className="font-semibold theme-text-primary">Live Activity</h3>
            <p className="text-xs theme-text-muted">Real-time platform stats</p>
          </div>
        </div>
        <ConnectionDot connected={isConnected} />
      </div>

      {/* Main Stats */}
      {stats ? (
        <div className="space-y-4">
          {/* Events Per Minute */}
          <div className="flex items-center justify-between">
            <span className="text-sm theme-text-muted">Events/min</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-accent-400">
                {stats.eventsPerMinute.toFixed(1)}
              </span>
              <TrendIndicator 
                current={stats.eventsPerMinute} 
                history={history.map(h => h.eventsPerMinute)}
              />
            </div>
          </div>

          {/* Active Connections */}
          <div className="flex items-center justify-between">
            <span className="text-sm theme-text-muted flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Active Users
            </span>
            <span className="text-lg font-semibold theme-text-primary">
              {stats.activeConnections}
            </span>
          </div>

          {/* Mini Sparkline Chart */}
          <div className="pt-3 border-t theme-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs theme-text-faint">Activity Trend (last hour)</span>
            </div>
            <SparklineChart 
              data={history.map(h => h.eventsPerMinute)} 
              height={40}
            />
          </div>

          {/* Ecosystem Stats */}
          <div className="pt-3 border-t theme-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs theme-text-faint">By Ecosystem</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {stats.topEcosystems?.slice(0, 3).map((eco) => (
                <EcosystemMiniStatNew key={eco.ecosystem} stat={eco} />
              ))}
            </div>
          </div>

          {/* Platform Stats Summary */}
          <div className="pt-3 border-t theme-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs theme-text-faint flex items-center gap-1">
                <Package className="w-3 h-3" />
                Platform Stats
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="theme-text-muted">Packages</span>
                <span className="font-medium theme-text-primary">{stats.packagesIndexed?.toLocaleString() ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="theme-text-muted">Versions</span>
                <span className="font-medium theme-text-primary">{stats.versionsIndexed?.toLocaleString() ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="theme-text-muted">Dependencies</span>
                <span className="font-medium theme-text-primary">{stats.dependenciesTracked?.toLocaleString() ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-surface-700/50 rounded" />
          <div className="h-6 bg-surface-700/50 rounded w-2/3" />
          <div className="h-10 bg-surface-700/50 rounded" />
        </div>
      )}
    </motion.div>
  );
}

// Connection status dot
function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        {connected ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </>
        ) : (
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gray-500" />
        )}
      </span>
      <span className={cn(
        "text-xs font-medium",
        connected ? "text-green-400" : "text-gray-400"
      )}>
        {connected ? "Live" : "Offline"}
      </span>
    </div>
  );
}

// Trend indicator (up/down/stable)
function TrendIndicator({ current, history }: { current: number; history: number[] }) {
  const trend = useMemo(() => {
    if (history.length < 2) return "stable";
    const prev = history[history.length - 2] ?? current;
    const diff = current - prev;
    if (diff > 0.5) return "up";
    if (diff < -0.5) return "down";
    return "stable";
  }, [current, history]);

  return <TrendArrow trend={trend.toUpperCase() as "UP" | "DOWN" | "STABLE"} />;
}

function TrendArrow({ trend }: { trend: "UP" | "DOWN" | "STABLE" }) {
  if (trend === "UP") {
    return <TrendingUp className="w-4 h-4 text-green-400" />;
  }
  if (trend === "DOWN") {
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  }
  return <Minus className="w-4 h-4 text-gray-400" />;
}

// Mini sparkline chart
function SparklineChart({ data, height = 40 }: { data: number[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Find min/max for scaling
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 4;

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    data.forEach((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Fill gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(139, 92, 246, 0.3)");
    gradient.addColorStop(1, "rgba(139, 92, 246, 0)");

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

  }, [data, height]);

  if (data.length < 2) {
    return (
      <div 
        className="flex items-center justify-center theme-text-faint text-xs"
        style={{ height }}
      >
        Collecting data...
      </div>
    );
  }

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full" 
      style={{ height }}
    />
  );
}

// Ecosystem mini stat (legacy)
function EcosystemMiniStat({ stat }: { stat: EcosystemStat }) {
  const ecosystemColors: Record<string, string> = {
    NPM: "#cb3837",
    CARGO: "#f7a41d",
    PY_PI: "#3776ab",
    MAVEN: "#c71a36",
    NU_GET: "#004880",
    GO: "#00add8",
  };

  const color = ecosystemColors[stat.ecosystem] || "#6366f1";

  return (
    <div 
      className="p-2 rounded-lg text-center"
      style={{ backgroundColor: `${color}15` }}
    >
      <div 
        className="text-xs font-medium mb-0.5"
        style={{ color }}
      >
        {stat.ecosystem.replace("_", "")}
      </div>
      <div className="text-sm font-semibold theme-text-primary">
        +{stat.recentActivity}
      </div>
    </div>
  );
}

// Ecosystem mini stat (new - uses EcosystemActivity)
function EcosystemMiniStatNew({ stat }: { stat: EcosystemActivity }) {
  const ecosystemColors: Record<string, string> = {
    NPM: "#cb3837",
    CARGO: "#f7a41d",
    PY_PI: "#3776ab",
    MAVEN: "#c71a36",
    NU_GET: "#004880",
    GO: "#00add8",
  };

  const color = ecosystemColors[stat.ecosystem] || "#6366f1";
  const change = stat.change24h;
  const isPositive = change > 0;

  return (
    <div 
      className="p-2 rounded-lg text-center"
      style={{ backgroundColor: `${color}15` }}
    >
      <div 
        className="text-xs font-medium mb-0.5"
        style={{ color }}
      >
        {stat.ecosystem.replace("_", "")}
      </div>
      <div className="text-sm font-semibold theme-text-primary">
        {stat.count.toLocaleString()}
      </div>
      <div className={cn(
        "text-xs",
        isPositive ? "text-green-400" : change < 0 ? "text-red-400" : "theme-text-muted"
      )}>
        {isPositive ? "+" : ""}{change.toFixed(1)}%
      </div>
    </div>
  );
}

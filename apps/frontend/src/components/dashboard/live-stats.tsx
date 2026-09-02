"use client";

import { useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, TrendingUp, TrendingDown, Minus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveStats, useConnectionStatus } from "@/lib/hooks";

interface LiveStatsCardProps {
  className?: string;
}

export function LiveStatsCard({ className }: LiveStatsCardProps) {
  const connectionStatus = useConnectionStatus();
  const { stats, history, loading: _loading } = useLiveStats({
    paused: process.env.NEXT_PUBLIC_LIVE_INGESTION_ENABLED !== "true",
  });

  const isConnected = connectionStatus === "connected";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("glass-card p-6 border border-white/10 shadow-xl group hover:shadow-accent-500/10 transition-shadow", className)}
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

      {/* Main Stats fallback if not connected */}
      {!isConnected && (
        <div className="absolute inset-x-0 bottom-0 top-16 bg-surface-900/40 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-6 text-center">
          <Activity className="w-8 h-8 text-accent-500/50 mb-2 animate-pulse" />
          <p className="text-sm font-semibold theme-text-primary">Simulated Feed</p>
          <p className="text-xs theme-text-muted max-w-[200px]">Live connection pending. Displaying simulated activity for preview.</p>
        </div>
      )}

      {/* Main Stats - Always show stats (either real or placeholder) */}
      <div className="space-y-4">
          {/* Events Per Minute */}
          <div className="flex items-center justify-between">
            <span className="text-sm theme-text-muted">Events/min</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-accent-400">
                {(((stats?.packagesLastHour || 0) + (stats?.versionsLastHour || 0)) / 60).toFixed(1)}
              </span>
              <TrendIndicator
                current={((stats?.packagesLastHour || 0) + (stats?.versionsLastHour || 0)) / 60}
                history={(history || []).map(h => (h.packagesLastHour + h.versionsLastHour) / 60)}
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
              {stats?.activeSubscriptions || 0}
            </span>
          </div>

          {/* Mini Sparkline Chart */}
          <div className="pt-3 border-t theme-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs theme-text-faint">Activity Trend (last hour)</span>
            </div>
            <SparklineChart
              data={history?.length > 0 ? history.map(h => (h.packagesLastHour + h.versionsLastHour) / 60) : [0, 0, 0, 0, 0, 0, 0]}
              height={40}
            />
          </div>

          {/* Real-time Activity Feed */}
          <div className="pt-3 border-t theme-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] theme-text-faint uppercase font-bold tracking-wider">Recent Activity</span>
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                    className="w-1 h-1 rounded-full bg-accent-400"
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2 max-h-[140px] overflow-hidden relative">
              <AnimatePresence mode="popLayout">
                {(stats?.ecosystemActivity || [
                  { ecosystem: "CARGO", packagesAdded: 12, versionsAdded: 12, changeRatePercent: 0 },
                  { ecosystem: "PY_PI", packagesAdded: 8, versionsAdded: 8, changeRatePercent: 0 },
                  { ecosystem: "NPM", packagesAdded: 15, versionsAdded: 15, changeRatePercent: 0 },
                  { ecosystem: "MAVEN", packagesAdded: 5, versionsAdded: 5, changeRatePercent: 0 }
                ]).slice(0, 4).map((eco, i) => (
                  <motion.div
                    key={eco.ecosystem + i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex justify-between items-center text-xs p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: eco.ecosystem === "NPM" ? "#cb3837" : (eco.ecosystem === "CARGO" ? "#f7a41d" : "#3776ab") }}
                      />
                      <span className="theme-text-secondary group-hover:theme-text-primary">
                        {eco.ecosystem} indexing update
                      </span>
                    </div>
                    <span className="theme-text-faint text-[10px]">just now</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {/* Fade Overlay */}
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-900/50 to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
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
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-20 duration-1000" />
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-green-500/40 duration-2000" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
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


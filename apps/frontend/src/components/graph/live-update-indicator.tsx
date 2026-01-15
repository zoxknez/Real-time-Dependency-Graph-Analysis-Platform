"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Activity, Zap, Package, RefreshCw } from "lucide-react";
import { cn, getEcosystemColor, formatEcosystemName } from "@/lib/utils";
import type { DependencyGraphUpdate } from "@/lib/graphql/types";

interface LiveUpdateIndicatorProps {
  updates: DependencyGraphUpdate[];
  isConnected: boolean;
  className?: string;
}

export function LiveUpdateIndicator({
  updates,
  isConnected,
  className,
}: LiveUpdateIndicatorProps) {
  const latestUpdate = updates[0];

  return (
    <div className={cn("flex flex-col items-end gap-3", className)}>
      {/* Toast Notification for Latest Update */}
      <AnimatePresence>
        {latestUpdate && (
          <motion.div
            key={latestUpdate.affectedPackage.id + latestUpdate.timestamp}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className="glass-card p-4 shadow-2xl border-l-4 min-w-[240px]"
            style={{ borderLeftColor: getEcosystemColor(latestUpdate.affectedPackage.ecosystem) }}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-white/5">
                <UpdateTypeIcon type={latestUpdate.type} />
              </div>
              <div className="flex-1">
                <div className="text-[10px] theme-text-faint uppercase font-bold tracking-wider mb-0.5">
                  Package Updated
                </div>
                <div className="theme-text-primary font-bold text-sm">
                  {latestUpdate.affectedPackage.name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] theme-text-tertiary">
                    {formatEcosystemName(latestUpdate.affectedPackage.ecosystem)}
                  </span>
                  {latestUpdate.newVersion && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-300 font-mono">
                      v{latestUpdate.newVersion}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Status Indicator Card */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 min-w-[200px] shadow-xl border-white/5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {isConnected ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                </>
              ) : (
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]" />
              )}
            </span>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              isConnected ? "text-green-400" : "text-danger-400"
            )}>
              {isConnected ? "Live Engine" : "Offline"}
            </span>
          </div>
          {isConnected ? (
            <Activity className="w-3 h-3 text-green-400/50 animate-pulse" />
          ) : (
            <button
              onClick={() => window.location.reload()}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Reconnect"
            >
              <RefreshCw className="w-3 h-3 text-danger-400" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          {updates.length > 0 ? (
            <div className="flex flex-col gap-2">
              {updates.slice(0, 2).map((update, i) => (
                <motion.div
                  key={update.timestamp + i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-2 text-xs group"
                >
                  <UpdateTypeIcon type={update.type} />
                  <span className="theme-text-tertiary truncate group-hover:theme-text-primary transition-colors">
                    {update.affectedPackage.name}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] theme-text-faint italic">
              Awaiting real-time stream...
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function UpdateTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "ADD":
      return <Zap className="w-3 h-3 text-green-400" />;
    case "REMOVE":
      return <Package className="w-3 h-3 text-red-400" />;
    case "UPDATE":
      return <RefreshCw className="w-3 h-3 text-blue-400" />;
    default:
      return <Activity className="w-3 h-3 text-gray-400" />;
  }
}

// Node highlight animation component for newly updated nodes
interface NodeHighlightProps {
  nodeId: string;
  position: { x: number; y: number };
  color: string;
  onComplete?: () => void;
}

export function NodeHighlight({ nodeId, position, color, onComplete }: NodeHighlightProps) {
  void nodeId;
  return (
    <motion.div
      initial={{ scale: 0, opacity: 1 }}
      animate={{ scale: 3, opacity: 0 }}
      transition={{ duration: 1, ease: "easeOut" }}
      onAnimationComplete={onComplete}
      className="absolute pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        width: 20,
        height: 20,
        borderRadius: "50%",
        backgroundColor: color,
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

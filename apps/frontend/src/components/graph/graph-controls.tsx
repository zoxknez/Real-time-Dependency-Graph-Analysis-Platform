"use client";

import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Settings2, Loader2, Rotate3d, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onRefresh: () => void;
  maxDepth: number;
  onMaxDepthChange: (depth: number) => void;
  loading?: boolean;
  autoRotate: boolean;
  onAutoRotateToggle: () => void;
  isPaused: boolean;
  onPlayPauseToggle: () => void;
}

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onCenter,
  onRefresh,
  maxDepth,
  onMaxDepthChange,
  loading,
  autoRotate,
  onAutoRotateToggle,
  isPaused,
  onPlayPauseToggle,
}: GraphControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute top-4 left-4 flex flex-row items-start gap-3 z-40"
    >
      {/* Zoom Controls */}
      <div className="glass-card p-1.5 flex flex-col gap-1.5 shadow-2xl border-white/10 backdrop-blur-xl">
        <button
          onClick={onZoomIn}
          className="p-2.5 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95 group"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5 theme-text-secondary group-hover:text-primary-400 transition-colors" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2.5 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95 group"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5 theme-text-secondary group-hover:text-primary-400 transition-colors" />
        </button>
        <button
          onClick={onCenter}
          className="p-2.5 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95 group"
          title="Fit to View"
        >
          <Maximize2 className="w-5 h-5 theme-text-secondary group-hover:text-primary-400 transition-colors" />
        </button>
        <div className="mx-2 h-px bg-white/5" />
        <div className="mx-2 h-px bg-white/5" />
        <button
          onClick={onAutoRotateToggle}
          className={cn(
            "p-2.5 rounded-xl transition-all active:scale-95 group",
            autoRotate
              ? "bg-primary-500/20 text-primary-400 border border-primary-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              : "theme-interactive hover:bg-white/10"
          )}
          title={autoRotate ? "Stop Rotation" : "Auto Rotate"}
        >
          <Rotate3d className={cn(
            "w-5 h-5 transition-colors",
            autoRotate ? "text-primary-400 animate-spin-slow" : "theme-text-secondary group-hover:text-primary-400"
          )} />
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2.5 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95 disabled:opacity-50 group"
          title="Refresh"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
          ) : (
            <RefreshCw className="w-5 h-5 theme-text-secondary group-hover:text-primary-400 transition-colors" />
          )}
        </button>
        <div className="mx-2 h-px bg-white/5" />
        <button
          onClick={onPlayPauseToggle}
          className={cn(
            "p-2.5 rounded-xl transition-all active:scale-95 group",
            isPaused
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "theme-interactive hover:bg-white/10"
          )}
          title={isPaused ? "Resume Simulation" : "Pause Simulation"}
        >
          {isPaused ? (
            <Play className="w-5 h-5 text-amber-400 fill-amber-400/20" />
          ) : (
            <Pause className="w-5 h-5 theme-text-secondary group-hover:text-amber-400 transition-colors" />
          )}
        </button>
      </div>

      {/* Depth Control */}
      <div className="glass-card p-3 shadow-2xl border-white/10 backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-4 h-4 text-primary-400" />
          <span className="text-[10px] theme-text-faint uppercase font-bold tracking-wider">Depth</span>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((depth) => (
            <button
              key={depth}
              onClick={() => onMaxDepthChange(depth)}
              className={cn(
                "w-8 h-8 rounded-lg text-sm font-bold transition-all flex items-center justify-center border",
                maxDepth === depth
                  ? "bg-primary-500 border-primary-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                  : "theme-inner-card border-white/5 theme-text-muted hover:theme-text-primary hover:border-primary-500/30 hover:shadow-[0_0_10px_rgba(99,102,241,0.1)]"
              )}
            >
              {depth}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

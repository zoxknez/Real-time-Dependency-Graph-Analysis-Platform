"use client";

import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, Settings2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onRefresh: () => void;
  maxDepth: number;
  onMaxDepthChange: (depth: number) => void;
  loading?: boolean;
}

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onCenter,
  onRefresh,
  maxDepth,
  onMaxDepthChange,
  loading,
}: GraphControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute top-1/2 -translate-y-1/2 left-4 flex flex-col gap-2"
    >
      {/* Zoom Controls */}
      <div className="glass-card p-1.5 flex flex-col gap-1.5 shadow-2xl border-white/10">
        <button
          onClick={onZoomIn}
          className="p-2 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5 theme-text-secondary group-hover:theme-text-primary" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5 theme-text-secondary group-hover:theme-text-primary" />
        </button>
        <button
          onClick={onCenter}
          className="p-2 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95"
          title="Fit to View"
        >
          <Maximize2 className="w-5 h-5 theme-text-secondary group-hover:theme-text-primary" />
        </button>
        <div className="mx-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-xl theme-interactive transition-all hover:bg-white/10 active:scale-95 disabled:opacity-50"
          title="Refresh"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
          ) : (
            <RefreshCw className="w-5 h-5 theme-text-secondary group-hover:theme-text-primary" />
          )}
        </button>
      </div>

      {/* Depth Control */}
      <div className="glass-card p-4 shadow-2xl border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-4 h-4 text-primary-400" />
          <span className="text-[10px] theme-text-faint uppercase font-bold tracking-wider">Depth</span>
        </div>
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((depth) => (
            <button
              key={depth}
              onClick={() => onMaxDepthChange(depth)}
              className={cn(
                "w-9 h-9 rounded-xl text-sm font-bold transition-all flex items-center justify-center border",
                maxDepth === depth
                  ? "bg-primary-500 border-primary-400 text-white shadow-lg shadow-primary-500/20"
                  : "theme-inner-card border-white/5 theme-text-muted hover:theme-text-primary hover:border-white/10"
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

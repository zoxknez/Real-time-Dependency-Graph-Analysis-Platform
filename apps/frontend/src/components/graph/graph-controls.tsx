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
      <div className="glass-card p-1 flex flex-col gap-1">
        <button
          onClick={onZoomIn}
          className="p-2.5 rounded-lg theme-interactive transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2.5 rounded-lg theme-interactive transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          onClick={onCenter}
          className="p-2.5 rounded-lg theme-interactive transition-colors"
          title="Fit to View"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
        <div className="w-full h-px theme-border" />
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2.5 rounded-lg theme-interactive transition-colors disabled:opacity-50"
          title="Refresh"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <RefreshCw className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Depth Control */}
      <div className="glass-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-4 h-4 theme-text-muted" />
          <span className="text-xs theme-text-tertiary font-medium">Max Depth</span>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map((depth) => (
            <button
              key={depth}
              onClick={() => onMaxDepthChange(depth)}
              className={cn(
                "w-8 h-8 rounded-lg text-sm font-medium transition-all",
                maxDepth === depth
                  ? "bg-primary-500 text-white"
                  : "theme-inner-card theme-text-muted theme-hover-text theme-inner-card-hover"
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

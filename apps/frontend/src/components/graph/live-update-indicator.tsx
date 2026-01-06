"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Activity, Zap, Package, RefreshCw } from "lucide-react";
import { cn, getEcosystemColor } from "@/lib/utils";
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
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("glass-card p-3", className)}
    >
      {/* Connection Status */}
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2 w-2">
          {isConnected ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </>
          ) : (
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-500" />
          )}
        </span>
        <span className={cn(
          "text-xs font-medium",
          isConnected ? "text-green-400" : "text-gray-400"
        )}>
          {isConnected ? "Live Updates" : "Disconnected"}
        </span>
      </div>
      
      {/* Recent Updates */}
      <AnimatePresence mode="popLayout">
        {updates.length > 0 ? (
          <motion.div
            key="updates"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="text-xs theme-text-faint">Recent changes:</div>
            {updates.slice(0, 3).map((update, i) => (
              <motion.div
                key={update.timestamp + i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-2 text-xs"
              >
                <UpdateTypeIcon type={update.type} />
                <span 
                  className="font-medium truncate max-w-[100px]"
                  style={{ color: getEcosystemColor(update.affectedPackage.ecosystem) }}
                >
                  {update.affectedPackage.name}
                </span>
                {update.newVersion && (
                  <span className="text-accent-400 font-mono">
                    v{update.newVersion}
                  </span>
                )}
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs theme-text-faint"
          >
            Watching for updates...
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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

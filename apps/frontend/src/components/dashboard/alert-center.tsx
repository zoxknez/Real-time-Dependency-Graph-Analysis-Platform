"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AlertTriangle, 
  Bell, 
  X, 
  ExternalLink, 
  ChevronRight,
  Package,
  Activity,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBreakingChanges, useDependencyImpact, useConnectionStatus } from "@/lib/hooks";
import type { BreakingChangeEvent, DependencyImpactEvent, BreakingSeverity } from "@/lib/graphql/types";

// ═══════════════════════════════════════════════════════════════
// ALERT NOTIFICATION COMPONENT
// ═══════════════════════════════════════════════════════════════

interface AlertNotificationProps {
  event: BreakingChangeEvent | DependencyImpactEvent;
  type: "breaking" | "impact";
  onDismiss: () => void;
  onAction?: () => void;
}

function AlertNotification({ event, type, onDismiss, onAction }: AlertNotificationProps) {
  const isBreaking = type === "breaking";
  const breakingEvent = isBreaking ? (event as BreakingChangeEvent) : null;
  const impactEvent = !isBreaking ? (event as DependencyImpactEvent) : null;

  const severityColors: Record<string, string> = {
    LOW: "bg-blue-500/20 border-blue-400/50 text-blue-300",
    MEDIUM: "bg-yellow-500/20 border-yellow-400/50 text-yellow-300",
    HIGH: "bg-orange-500/20 border-orange-400/50 text-orange-300",
    CRITICAL: "bg-red-500/20 border-red-400/50 text-red-300",
  };

  const severity = breakingEvent?.severity ?? "HIGH";
  const colorClass = severityColors[severity] || severityColors.MEDIUM;

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      className={cn(
        "relative max-w-sm rounded-lg border p-4 shadow-xl backdrop-blur-md",
        colorClass
      )}
    >
      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          "p-2 rounded-lg",
          isBreaking ? "bg-red-500/20" : "bg-orange-500/20"
        )}>
          {isBreaking ? (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          ) : (
            <Activity className="w-5 h-5 text-orange-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">
            {isBreaking ? "Breaking Change Detected" : "Dependency Impact Alert"}
          </h4>
          <p className="text-xs opacity-75 mt-0.5">
            {event.package.name}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mt-3 text-sm">
        {breakingEvent && (
          <>
            <div className="flex items-center gap-2 text-xs opacity-75">
              <span>{breakingEvent.fromVersion}</span>
              <ChevronRight className="w-3 h-3" />
              <span className="font-medium">{breakingEvent.toVersion}</span>
            </div>
            {breakingEvent.changes.length > 0 && breakingEvent.changes[0] && (
              <p className="mt-2 text-xs opacity-90 line-clamp-2">
                {breakingEvent.changes[0].description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs opacity-75">
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {breakingEvent.affectedDependents} affected
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded text-xs font-medium",
                severityColors[breakingEvent.severity]
              )}>
                {breakingEvent.severity}
              </span>
            </div>
          </>
        )}
        {impactEvent && (
          <>
            <div className="flex items-center gap-2 text-xs opacity-75">
              <span>Version {impactEvent.version}</span>
              <span className="px-2 py-0.5 rounded bg-white/10">
                Impact Score: {impactEvent.impactScore.toFixed(1)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs opacity-75">
              <span>{impactEvent.affectedPackages} packages</span>
              <span>{impactEvent.affectedVersions} versions</span>
            </div>
          </>
        )}
      </div>

      {/* Action */}
      {onAction && (
        <button
          onClick={onAction}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium"
        >
          View Details
          <ExternalLink className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ALERT CENTER COMPONENT
// ═══════════════════════════════════════════════════════════════

interface AlertCenterProps {
  className?: string;
  maxVisible?: number;
  autoDismissMs?: number;
  watchedPackageIds?: string[];
  minSeverity?: BreakingSeverity;
}

export function AlertCenter({
  className,
  maxVisible = 5,
  autoDismissMs = 10000,
  watchedPackageIds: _watchedPackageIds,
  minSeverity: _minSeverity,
}: AlertCenterProps) {
  const [visibleAlerts, setVisibleAlerts] = useState<
    Array<{ id: string; event: BreakingChangeEvent | DependencyImpactEvent; type: "breaking" | "impact" }>
  >([]);
  
  const connectionStatus = useConnectionStatus();

  // Subscribe to breaking changes
  const { latestBreakingChange: _latestBreakingChange } = useBreakingChanges({
    onBreakingChange: (event) => {
      const id = `breaking-${Date.now()}-${Math.random()}`;
      setVisibleAlerts((prev) => [{ id, event, type: "breaking" as const }, ...prev].slice(0, maxVisible));

      // Auto-dismiss
      if (autoDismissMs > 0) {
        setTimeout(() => {
          setVisibleAlerts((prev) => prev.filter((a) => a.id !== id));
        }, autoDismissMs);
      }
    },
  });

  // Subscribe to dependency impacts
  const { latestImpact: _latestImpact } = useDependencyImpact({
    minImpactScore: 0.7, // Only high-impact events
    onImpact: (event) => {
      const id = `impact-${Date.now()}-${Math.random()}`;
      setVisibleAlerts((prev) => [{ id, event, type: "impact" as const }, ...prev].slice(0, maxVisible));

      // Auto-dismiss
      if (autoDismissMs > 0) {
        setTimeout(() => {
          setVisibleAlerts((prev) => prev.filter((a) => a.id !== id));
        }, autoDismissMs);
      }
    },
  });

  const dismissAlert = (id: string) => {
    setVisibleAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAll = () => {
    setVisibleAlerts([]);
  };

  return (
    <div className={cn("fixed top-20 right-4 z-50 space-y-3", className)}>
      {/* Connection status indicator */}
      {connectionStatus !== "connected" && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/20 border border-yellow-400/50 text-yellow-300 text-xs"
        >
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          {connectionStatus === "connecting" ? "Connecting..." : "Disconnected"}
        </motion.div>
      )}

      {/* Clear all button */}
      {visibleAlerts.length > 1 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={clearAll}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Clear all ({visibleAlerts.length})
        </motion.button>
      )}

      {/* Alert notifications */}
      <AnimatePresence mode="popLayout">
        {visibleAlerts.map((alert) => (
          <AlertNotification
            key={alert.id}
            event={alert.event}
            type={alert.type}
            onDismiss={() => dismissAlert(alert.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ALERT BELL COMPONENT (for header)
// ═══════════════════════════════════════════════════════════════

interface AlertBellProps {
  className?: string;
  onClick?: () => void;
}

export function AlertBell({ className, onClick }: AlertBellProps) {
  const { unreadCount } = useBreakingChanges();
  const connectionStatus = useConnectionStatus();
  
  const isConnected = connectionStatus === "connected";
  const hasUnread = unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-2 rounded-lg transition-colors",
        hasUnread 
          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
          : "hover:bg-white/10 text-gray-400 hover:text-white",
        className
      )}
    >
      <Bell className="w-5 h-5" />
      
      {/* Unread badge */}
      {hasUnread && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </motion.span>
      )}

      {/* Connection indicator */}
      <span
        className={cn(
          "absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-gray-900",
          isConnected ? "bg-green-500" : "bg-red-500"
        )}
      />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECURITY BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════

interface SecurityBadgeProps {
  severity: BreakingSeverity;
  className?: string;
}

export function SecurityBadge({ severity, className }: SecurityBadgeProps) {
  const colors: Record<BreakingSeverity, string> = {
    LOW: "bg-blue-500/20 text-blue-400 border-blue-400/50",
    MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-400/50",
    HIGH: "bg-orange-500/20 text-orange-400 border-orange-400/50",
    CRITICAL: "bg-red-500/20 text-red-400 border-red-400/50",
  };

  const icons: Record<BreakingSeverity, React.ReactNode> = {
    LOW: <Shield className="w-3 h-3" />,
    MEDIUM: <Shield className="w-3 h-3" />,
    HIGH: <AlertTriangle className="w-3 h-3" />,
    CRITICAL: <AlertTriangle className="w-3 h-3" />,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium",
        colors[severity],
        className
      )}
    >
      {icons[severity]}
      {severity}
    </span>
  );
}

export default AlertCenter;

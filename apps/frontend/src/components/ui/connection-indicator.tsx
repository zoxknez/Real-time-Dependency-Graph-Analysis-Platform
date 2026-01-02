"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/hooks";

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

const statusConfig: Record<ConnectionStatus, {
  icon: typeof Wifi;
  label: string;
  color: string;
  bgColor: string;
  pulseColor: string;
}> = {
  connecting: {
    icon: Loader2,
    label: "Connecting...",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    pulseColor: "bg-yellow-500",
  },
  connected: {
    icon: Wifi,
    label: "Live",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    pulseColor: "bg-green-500",
  },
  disconnected: {
    icon: WifiOff,
    label: "Disconnected",
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    pulseColor: "bg-gray-500",
  },
  error: {
    icon: AlertCircle,
    label: "Connection Error",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    pulseColor: "bg-red-500",
  },
};

const sizeClasses = {
  sm: "h-6 px-2 text-xs gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
  lg: "h-10 px-4 text-base gap-2.5",
};

const iconSizes = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function ConnectionIndicator({
  status,
  className,
  showLabel = true,
  size = "md",
}: ConnectionIndicatorProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.bgColor,
        config.color,
        sizeClasses[size],
        className
      )}
    >
      {/* Pulse dot for connected state */}
      {status === "connected" && (
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.pulseColor
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              config.pulseColor
            )}
          />
        </span>
      )}

      {/* Icon (spinning for connecting state) */}
      {status !== "connected" && (
        <Icon
          className={cn(
            iconSizes[size],
            status === "connecting" && "animate-spin"
          )}
        />
      )}

      {/* Label */}
      {showLabel && (
        <AnimatePresence mode="wait">
          <motion.span
            key={status}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {config.label}
          </motion.span>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

// Floating connection banner for offline state
interface ConnectionBannerProps {
  status: ConnectionStatus;
  onRetry?: () => void;
}

export function ConnectionBanner({ status, onRetry }: ConnectionBannerProps) {
  if (status === "connected") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 py-2 px-4 text-sm font-medium",
          status === "connecting" && "bg-yellow-500/90 text-yellow-950",
          status === "disconnected" && "bg-gray-500/90 text-white",
          status === "error" && "bg-red-500/90 text-white"
        )}
      >
        {status === "connecting" && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting to live updates...</span>
          </>
        )}
        {status === "disconnected" && (
          <>
            <WifiOff className="w-4 h-4" />
            <span>Connection lost. Reconnecting...</span>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="w-4 h-4" />
            <span>Connection error</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="ml-2 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
              >
                Retry
              </button>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

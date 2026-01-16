"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCounter, formatCompactNumber } from "@/components/ui/animated-counter";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  description?: string;
  color?: "primary" | "accent" | "success" | "warning" | "danger";
  loading?: boolean;
  href?: string;
}

const colorClasses = {
  primary: {
    bg: "bg-primary-500/10",
    icon: "text-primary-400",
    border: "border-primary-500/20",
    glow: "shadow-primary-500/10",
    ring: "ring-primary-500/30",
  },
  accent: {
    bg: "bg-accent-500/10",
    icon: "text-accent-400",
    border: "border-accent-500/20",
    glow: "shadow-accent-500/10",
    ring: "ring-accent-500/30",
  },
  success: {
    bg: "bg-success/10",
    icon: "text-success",
    border: "border-success/20",
    glow: "shadow-success/10",
    ring: "ring-success/30",
  },
  warning: {
    bg: "bg-warning/10",
    icon: "text-warning",
    border: "border-warning/20",
    glow: "shadow-warning/10",
    ring: "ring-warning/30",
  },
  danger: {
    bg: "bg-danger/10",
    icon: "text-danger",
    border: "border-danger/20",
    glow: "shadow-danger/10",
    ring: "ring-danger/30",
  },
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  description,
  color = "primary",
  loading = false,
  href,
}: StatsCardProps) {
  const colors = colorClasses[color];

  if (loading) {
    return (
      <div className="stat-card flex flex-col min-h-[160px]">
        <div className="flex items-start justify-between mb-4">
          <Skeleton className="w-12 h-12 rounded-xl animate-pulse" />
          <Skeleton className="w-14 h-6 rounded-lg animate-pulse" />
        </div>
        <Skeleton className="w-32 h-8 mb-2 animate-pulse" />
        <Skeleton className="w-24 h-4 animate-pulse opacity-60" />
      </div>
    );
  }

  const numericValue = typeof value === "number" ? value : parseFloat(value) || 0;

  const cardContent = (
    <>
      <div className="flex items-start justify-between mb-4">
        <motion.div
          className={cn("p-3 rounded-xl transition-all duration-300", colors.bg, "group-hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]")}
          whileHover={{ y: -5, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
        >
          <Icon className={cn("w-6 h-6 transition-colors", colors.icon)} />
        </motion.div>
        {trend && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg transition-transform group-hover:scale-105",
              trendUp
                ? "text-success bg-success/10"
                : "text-danger bg-danger/10"
            )}
          >
            {trendUp ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend}
          </motion.div>
        )}
      </div>
      <div className="mt-auto">
        <h3 className="text-3xl font-bold theme-text-primary mb-1 tracking-tight group-hover:text-primary-400 transition-colors">
          {typeof value === "number" ? (
            <AnimatedCounter value={numericValue} formatFn={formatCompactNumber} />
          ) : (
            value
          )}
        </h3>
        <p className="text-sm font-medium theme-text-tertiary transition-colors group-hover:theme-text-secondary">{title}</p>
        {description && (
          <p className="text-xs theme-text-faint mt-1 group-hover:theme-text-muted transition-colors line-clamp-1">
            {description}
          </p>
        )}
      </div>
    </>
  );

  const cardClassName = cn(
    "stat-card flex flex-col group cursor-pointer relative overflow-hidden",
    "hover:ring-1 hover:ring-white/10 transition-all duration-500",
    "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:opacity-0 before:transition-opacity hover:before:opacity-100",
    colors.ring
  );

  if (href) {
    return (
      <Link href={href}>
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          transition={{ duration: 0.2 }}
          className={cardClassName}
        >
          {cardContent}
        </motion.div>
      </Link>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.2 }}
      className={cardClassName}
    >
      {cardContent}
    </motion.div>
  );
}

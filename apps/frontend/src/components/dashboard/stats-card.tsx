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
      <div className="stat-card flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <Skeleton className="w-14 h-6 rounded-lg" />
        </div>
        <Skeleton className="w-24 h-8 mb-2" />
        <Skeleton className="w-32 h-4" />
      </div>
    );
  }

  const numericValue = typeof value === "number" ? value : parseFloat(value) || 0;

  const cardContent = (
    <>
      <div className="flex items-start justify-between mb-4">
        <motion.div 
          className={cn("p-3 rounded-xl transition-transform", colors.bg)}
          whileHover={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 0.5 }}
        >
          <Icon className={cn("w-6 h-6", colors.icon)} />
        </motion.div>
        {trend && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg",
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
      <h3 className="text-3xl font-bold theme-text-primary mb-1">
        {typeof value === "number" ? (
          <AnimatedCounter value={numericValue} formatFn={formatCompactNumber} />
        ) : (
          value
        )}
      </h3>
      <p className="text-sm font-medium theme-text-tertiary">{title}</p>
      {description && (
        <p className="text-xs theme-text-faint mt-1 group-hover:theme-text-muted transition-colors">
          {description}
        </p>
      )}
    </>
  );

  const cardClassName = cn(
    "stat-card flex flex-col group cursor-pointer",
    "hover:ring-2 transition-all duration-300",
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

"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, GitBranch } from "lucide-react";

export type DependencyRelationship = "DIRECT" | "TRANSITIVE";

interface DependencyBadgeProps {
  relationship: DependencyRelationship;
  depth?: number;
  compact?: boolean;
  className?: string;
}

/**
 * Badge showing Direct/Transitive dependency relationship
 * Based on GitHub Dependency Graph UI patterns
 */
export function DependencyBadge({ relationship, depth, compact = false, className }: DependencyBadgeProps) {
  const isDirect = relationship === "DIRECT";
  
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold",
          isDirect
            ? "bg-blue-500/20 text-blue-400"
            : "bg-purple-500/20 text-purple-400",
          className
        )}
        title={isDirect ? "Direct dependency" : "Transitive dependency"}
      >
        {isDirect ? "D" : "T"}
      </span>
    );
  }
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
        isDirect
          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
          : "bg-purple-500/20 text-purple-400 border border-purple-500/30",
        className
      )}
    >
      {isDirect ? (
        <>
          <ArrowRight className="w-3 h-3" />
          Direct
        </>
      ) : (
        <>
          <GitBranch className="w-3 h-3" />
          Transitive
          {depth && depth > 1 && (
            <span className="text-[10px] opacity-70">(depth {depth})</span>
          )}
        </>
      )}
    </span>
  );
}

interface IntroducedByProps {
  packages: Array<{ id: string; name: string }>;
  maxShow?: number;
  className?: string;
}

/**
 * Shows which direct dependencies introduced a transitive dependency
 */
export function IntroducedBy({ packages, maxShow = 2, className }: IntroducedByProps) {
  if (!packages.length) return null;
  
  const shown = packages.slice(0, maxShow);
  const remaining = packages.length - maxShow;
  
  return (
    <div className={cn("text-xs text-gray-400 flex items-center gap-1", className)}>
      <span className="opacity-60">via</span>
      {shown.map((pkg, i) => (
        <span key={pkg.id}>
          <span className="text-gray-300 hover:text-white cursor-pointer">
            {pkg.name}
          </span>
          {i < shown.length - 1 && <span className="opacity-40">, </span>}
        </span>
      ))}
      {remaining > 0 && (
        <span className="opacity-60">+{remaining} more</span>
      )}
    </div>
  );
}

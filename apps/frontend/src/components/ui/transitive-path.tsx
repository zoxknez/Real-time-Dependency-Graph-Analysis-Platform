"use client";

import { cn } from "@/lib/utils";
import { Package } from "@/lib/graphql/types";
import { useMemo } from "react";
import { ChevronRight, Package as PackageIcon, ArrowRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";

interface TransitivePathProps {
  path: Package[];
  className?: string;
  onPackageClick?: (pkg: Package) => void;
  compact?: boolean;
}

const ECOSYSTEM_COLORS: Record<string, string> = {
  NPM: "bg-red-500/20 text-red-400 border-red-500/30",
  PY_PI: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  CARGO: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MAVEN: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  NU_GET: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  GO: "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

/**
 * Visualize a transitive dependency path (GitHub style)
 * Shows: RootPackage → DirectDep → TransitiveDep1 → ... → VulnerablePackage
 */
export function TransitivePath({
  path,
  className,
  onPackageClick,
  compact = false,
}: TransitivePathProps) {
  const isDirectDep = path.length === 2;
  
  if (path.length === 0) {
    return null;
  }
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 overflow-x-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-700",
      className
    )}>
      {path.map((pkg, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === path.length - 1;
        const ecosystemColor = ECOSYSTEM_COLORS[pkg.ecosystem] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
        
        return (
          <div key={pkg.id} className="flex items-center gap-1.5 shrink-0">
            {/* Arrow between packages */}
            {idx > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
            )}
            
            {/* Package node */}
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onPackageClick?.(pkg)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-1 rounded border transition-all",
                      compact ? "text-xs" : "text-sm",
                      ecosystemColor,
                      "hover:opacity-80 cursor-pointer",
                      isFirst && "ring-2 ring-blue-500/50",
                      isLast && "ring-2 ring-red-500/50"
                    )}
                  >
                    <PackageIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="max-w-[120px] truncate font-medium">
                      {pkg.name}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs"
                >
                  <div>
                    <span className="text-gray-400">{pkg.ecosystem.toLowerCase()}:</span>
                    <span className="text-white ml-1">{pkg.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {isFirst && "Root package"}
                    {!isFirst && !isLast && `Depth ${idx}`}
                    {isLast && (isDirectDep ? "Direct dependency" : "Transitive dependency")}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Multiple paths visualization for "Show all paths" feature
 */
interface TransitivePathsListProps {
  paths: { path: Package[]; length: number }[];
  onPackageClick?: (pkg: Package) => void;
  maxPaths?: number;
  className?: string;
}

export function TransitivePathsList({
  paths,
  onPackageClick,
  maxPaths = 5,
  className,
}: TransitivePathsListProps) {
  const sortedPaths = useMemo(() => {
    return [...paths]
      .sort((a, b) => a.length - b.length)
      .slice(0, maxPaths);
  }, [paths, maxPaths]);
  
  if (sortedPaths.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        No dependency paths found
      </div>
    );
  }
  
  return (
    <div className={cn("space-y-3", className)}>
      {sortedPaths.map((pathData, idx) => (
        <div key={idx} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">
              Path {idx + 1} · {pathData.length} {pathData.length === 1 ? "hop" : "hops"}
            </span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded",
              pathData.length === 1 
                ? "bg-blue-500/20 text-blue-400" 
                : "bg-purple-500/20 text-purple-400"
            )}>
              {pathData.length === 1 ? "Direct" : "Transitive"}
            </span>
          </div>
          <TransitivePath 
            path={pathData.path} 
            onPackageClick={onPackageClick}
            compact
          />
        </div>
      ))}
      
      {paths.length > maxPaths && (
        <div className="text-xs text-center text-gray-500">
          +{paths.length - maxPaths} more paths
        </div>
      )}
    </div>
  );
}

/**
 * Inline "introduced by" indicator
 * Shows which direct dependency brings in a transitive dep
 */
interface IntroducedByIndicatorProps {
  directDep: Package;
  transitiveDep: Package;
  depth?: number;
  compact?: boolean;
  className?: string;
}

export function IntroducedByIndicator({
  directDep,
  transitiveDep,
  depth = 2,
  compact = false,
  className,
}: IntroducedByIndicatorProps) {
  return (
    <div className={cn(
      "flex items-center gap-2 text-gray-400",
      compact ? "text-xs" : "text-sm",
      className
    )}>
      <span className="text-purple-400 font-medium">{transitiveDep.name}</span>
      <ArrowRight className="w-3 h-3" />
      <span className="text-gray-500">via</span>
      <span className="text-blue-400">{directDep.name}</span>
      {depth > 2 && (
        <span className="text-[10px] text-gray-500">
          ({depth - 1} hops away)
        </span>
      )}
    </div>
  );
}

/**
 * Dependency relationship summary card
 */
interface DependencySummaryProps {
  packageName: string;
  directCount: number;
  transitiveCount: number;
  vulnerableDirectCount?: number;
  vulnerableTransitiveCount?: number;
  className?: string;
}

export function DependencySummary({
  packageName,
  directCount,
  transitiveCount,
  vulnerableDirectCount = 0,
  vulnerableTransitiveCount = 0,
  className,
}: DependencySummaryProps) {
  const totalDeps = directCount + transitiveCount;
  const totalVulnerable = vulnerableDirectCount + vulnerableTransitiveCount;
  
  return (
    <div className={cn(
      "p-4 bg-gray-800/50 rounded-lg border border-gray-700",
      className
    )}>
      <h3 className="text-sm font-medium text-white mb-3">
        Dependency Overview for <span className="text-blue-400">{packageName}</span>
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Direct Dependencies */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Direct</span>
            <span className="text-sm font-medium text-blue-400">{directCount}</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${(directCount / totalDeps) * 100}%` }}
            />
          </div>
          {vulnerableDirectCount > 0 && (
            <div className="text-[10px] text-red-400">
              {vulnerableDirectCount} vulnerable
            </div>
          )}
        </div>
        
        {/* Transitive Dependencies */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Transitive</span>
            <span className="text-sm font-medium text-purple-400">{transitiveCount}</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-500 rounded-full"
              style={{ width: `${(transitiveCount / totalDeps) * 100}%` }}
            />
          </div>
          {vulnerableTransitiveCount > 0 && (
            <div className="text-[10px] text-red-400">
              {vulnerableTransitiveCount} vulnerable
            </div>
          )}
        </div>
      </div>
      
      {/* Vulnerable Summary */}
      {totalVulnerable > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Total Vulnerable</span>
            <span className="font-medium text-red-400">{totalVulnerable}</span>
          </div>
        </div>
      )}
    </div>
  );
}

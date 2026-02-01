"use client";

import { cn } from "@/lib/utils";
import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";

interface ScoreBreakdown {
  reachability: number;
  exploitSignal: number;
  environment: number;
  cvss: number;
}

interface RiskScoreProps {
  score: number;
  breakdown: ScoreBreakdown;
  size?: "sm" | "md" | "lg";
  showBreakdown?: boolean;
  className?: string;
}

type Severity = "critical" | "high" | "medium" | "low";

const SIZE_CONFIG = {
  sm: { diameter: 48, stroke: 4, fontSize: "text-sm" },
  md: { diameter: 72, stroke: 6, fontSize: "text-lg" },
  lg: { diameter: 96, stroke: 8, fontSize: "text-2xl" },
};

function getSeverity(score: number): Severity {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

const SEVERITY_COLORS: Record<Severity, { stroke: string; text: string; bg: string }> = {
  critical: { stroke: "#ef4444", text: "text-red-400", bg: "bg-red-500/20" },
  high: { stroke: "#f97316", text: "text-orange-400", bg: "bg-orange-500/20" },
  medium: { stroke: "#eab308", text: "text-yellow-400", bg: "bg-yellow-500/20" },
  low: { stroke: "#22c55e", text: "text-green-400", bg: "bg-green-500/20" },
};

const BREAKDOWN_LABELS: Record<keyof ScoreBreakdown, { label: string; weight: string; description: string }> = {
  reachability: { 
    label: "Reachability", 
    weight: "40%",
    description: "Is the vulnerable code actually called?"
  },
  exploitSignal: { 
    label: "Exploit Signal", 
    weight: "25%",
    description: "Known exploits, EPSS, KEV status"
  },
  environment: { 
    label: "Environment", 
    weight: "20%",
    description: "Production exposure, network access"
  },
  cvss: { 
    label: "CVSS Base", 
    weight: "15%",
    description: "Vulnerability severity score"
  },
};

/**
 * Circular risk score gauge with breakdown tooltip
 * Based on OX Security context-aware prioritization
 */
export function RiskScoreGauge({
  score,
  breakdown,
  size = "md",
  showBreakdown = true,
  className,
}: RiskScoreProps) {
  const { diameter, stroke, fontSize } = SIZE_CONFIG[size];
  const severity = getSeverity(score);
  const colors = SEVERITY_COLORS[severity];
  
  const { circumference, progress } = useMemo(() => {
    const radius = (diameter - stroke) / 2;
    const circ = 2 * Math.PI * radius;
    const prog = ((100 - score) / 100) * circ;
    return { circumference: circ, progress: prog };
  }, [diameter, stroke, score]);
  
  const center = diameter / 2;
  const radius = (diameter - stroke) / 2;
  
  const gauge = (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={diameter}
        height={diameter}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.stroke}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Score text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-bold", fontSize, colors.text)}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
  
  if (!showBreakdown) return gauge;
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="cursor-help">{gauge}</div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="z-50 w-72 p-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl"
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Risk Score</span>
              <span className={cn(
                "px-2 py-0.5 rounded text-xs font-medium capitalize",
                colors.bg,
                colors.text
              )}>
                {severity}
              </span>
            </div>
            
            {/* Score bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>0</span>
                <span className={cn("font-bold", colors.text)}>{Math.round(score)}</span>
                <span>100</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${score}%`,
                    backgroundColor: colors.stroke
                  }}
                />
              </div>
            </div>
            
            {/* Breakdown */}
            <div className="space-y-2 pt-2 border-t border-gray-700">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                Score Breakdown
              </span>
              {(Object.keys(breakdown) as (keyof ScoreBreakdown)[]).map((key) => {
                const value = breakdown[key];
                const { label, weight, description } = BREAKDOWN_LABELS[key];
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-300">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">{weight}</span>
                        <span className={cn(
                          "font-mono",
                          value >= 70 ? "text-red-400" :
                          value >= 40 ? "text-yellow-400" : "text-green-400"
                        )}>
                          {value.toFixed(0)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          value >= 70 ? "bg-red-500" :
                          value >= 40 ? "bg-yellow-500" : "bg-green-500"
                        )}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500">{description}</p>
                  </div>
                );
              })}
            </div>
            
            {/* Formula explanation */}
            <div className="pt-2 border-t border-gray-700">
              <p className="text-[10px] text-gray-500">
                Final = (Reach×40) + (Exploit×25) + (Env×20) + (CVSS×15)
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Inline severity badge
 */
export function SeverityBadge({ 
  severity, 
  className 
}: { 
  severity: Severity; 
  className?: string;
}) {
  const colors = SEVERITY_COLORS[severity];
  
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize",
      colors.bg,
      colors.text,
      className
    )}>
      {severity}
    </span>
  );
}

/**
 * Compact score indicator for tables
 */
export function RiskScoreCompact({ 
  score, 
  className 
}: { 
  score: number; 
  className?: string;
}) {
  const severity = getSeverity(score);
  const colors = SEVERITY_COLORS[severity];
  
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold",
      colors.bg,
      colors.text,
      className
    )}>
      {Math.round(score)}
    </span>
  );
}

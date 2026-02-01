"use client";

import { cn } from "@/lib/utils";
import { 
  AlertTriangle, 
  ShieldCheck, 
  HelpCircle, 
  Minus,
  FileCode
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";

export type ReachabilityStatus = 
  | "REACHABLE" 
  | "UNREACHABLE" 
  | "CONDITIONALLY_REACHABLE" 
  | "NO_RULE";

interface CallSite {
  file: string;
  line: number;
  function: string;
  snippet?: string;
}

interface ReachabilityEvidence {
  status: ReachabilityStatus;
  confidence: number;
  ruleId?: string;
  callPath?: CallSite[];
  conditions?: string[];
  analyzedAt: string;
}

interface ReachabilityBadgeProps {
  evidence: ReachabilityEvidence;
  showTooltip?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<ReachabilityStatus, {
  bg: string;
  text: string;
  border: string;
  icon: typeof AlertTriangle;
  label: string;
  description: string;
}> = {
  REACHABLE: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    border: "border-red-500/30",
    icon: AlertTriangle,
    label: "Reachable",
    description: "Vulnerable code is called in your application"
  },
  UNREACHABLE: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    icon: ShieldCheck,
    label: "Unreachable",
    description: "Vulnerable code is not called in your application"
  },
  CONDITIONALLY_REACHABLE: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    icon: HelpCircle,
    label: "Needs Review",
    description: "Reachability depends on runtime conditions"
  },
  NO_RULE: {
    bg: "bg-gray-500/20",
    text: "text-gray-400",
    border: "border-gray-500/30",
    icon: Minus,
    label: "No Analysis",
    description: "No reachability rule exists for this vulnerability"
  },
};

/**
 * Reachability badge with tooltip showing evidence
 * Based on Semgrep Supply Chain classification
 */
export function ReachabilityBadge({ 
  evidence, 
  showTooltip = true,
  className 
}: ReachabilityBadgeProps) {
  const config = STATUS_CONFIG[evidence.status];
  const Icon = config.icon;
  const confidencePercent = Math.round(evidence.confidence * 100);
  
  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
        config.bg,
        config.text,
        config.border,
        "hover:opacity-80 cursor-help",
        className
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
  
  if (!showTooltip) return badge;
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="z-50 max-w-sm p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl"
        >
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className={cn("font-medium", config.text)}>
                {config.label}
              </span>
              <span className="text-xs text-gray-400">
                {confidencePercent}% confidence
              </span>
            </div>
            
            {/* Description */}
            <p className="text-xs text-gray-300">{config.description}</p>
            
            {/* Rule ID */}
            {evidence.ruleId && (
              <div className="flex items-center gap-1 text-xs">
                <FileCode className="w-3 h-3 text-gray-500" />
                <code className="text-gray-400 bg-gray-800 px-1 rounded">
                  {evidence.ruleId}
                </code>
              </div>
            )}
            
            {/* Call Path */}
            {evidence.callPath && evidence.callPath.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-gray-700">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">
                  Call Path
                </span>
                <div className="space-y-0.5">
                  {evidence.callPath.slice(0, 3).map((site, i) => (
                    <div key={i} className="text-xs font-mono text-gray-300">
                      <span className="text-blue-400">{site.file}</span>
                      <span className="text-gray-500">:</span>
                      <span className="text-yellow-400">{site.line}</span>
                      <span className="text-gray-500"> → </span>
                      <span className="text-purple-400">{site.function}()</span>
                    </div>
                  ))}
                  {evidence.callPath.length > 3 && (
                    <span className="text-[10px] text-gray-500">
                      +{evidence.callPath.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Conditions */}
            {evidence.conditions && evidence.conditions.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-gray-700">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">
                  Conditions
                </span>
                <ul className="text-xs text-yellow-300 space-y-0.5">
                  {evidence.conditions.map((cond, i) => (
                    <li key={i}>• {cond}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Analyzed timestamp */}
            <div className="text-[10px] text-gray-500 pt-1">
              Analyzed: {new Date(evidence.analyzedAt).toLocaleDateString()}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact reachability indicator for lists
 */
export function ReachabilityDot({ status, className }: { 
  status: ReachabilityStatus; 
  className?: string;
}) {
  const config = STATUS_CONFIG[status];
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block w-2.5 h-2.5 rounded-full cursor-help",
              status === "REACHABLE" && "bg-red-500",
              status === "UNREACHABLE" && "bg-green-500",
              status === "CONDITIONALLY_REACHABLE" && "bg-yellow-500",
              status === "NO_RULE" && "bg-gray-500",
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs"
        >
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

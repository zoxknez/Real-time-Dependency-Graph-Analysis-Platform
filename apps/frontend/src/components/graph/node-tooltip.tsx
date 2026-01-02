"use client";

import { motion } from "framer-motion";
import { Package, GitBranch } from "lucide-react";
import { formatEcosystemName, getEcosystemColor } from "@/lib/utils";

interface NodeTooltipProps {
  node: {
    id: string;
    name: string;
    ecosystem: string;
    depth: number;
  };
  position: { x: number; y: number };
}

export function NodeTooltip({ node, position }: NodeTooltipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        position: "fixed",
        left: position.x + 15,
        top: position.y - 10,
        zIndex: 100,
      }}
      className="glass-card px-4 py-3 min-w-[180px] pointer-events-none"
    >
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${getEcosystemColor(node.ecosystem)}30` }}
        >
          <Package
            className="w-4 h-4"
            style={{ color: getEcosystemColor(node.ecosystem) }}
          />
        </div>
        <div>
          <h4 className="font-semibold theme-text-primary text-sm">{node.name}</h4>
          <p className="text-xs theme-text-muted mt-0.5">
            {formatEcosystemName(node.ecosystem)}
          </p>
          <div className="flex items-center gap-1 mt-2 text-xs theme-text-faint">
            <GitBranch className="w-3 h-3" />
            <span>Depth: {node.depth}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

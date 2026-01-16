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
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      style={{
        position: "fixed",
        left: position.x + 20,
        top: position.y - 20,
        zIndex: 100,
      }}
      className="glass-card px-4 py-3 min-w-[200px] pointer-events-none backdrop-blur-xl shadow-2xl relative overflow-hidden"
    >
      {/* Ecosystem colored border line */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: getEcosystemColor(node.ecosystem) }}
      />

      {/* Noise overlay */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      <div className="flex items-start gap-3 relative z-10 pl-2">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${getEcosystemColor(node.ecosystem)}20` }}
        >
          <Package
            className="w-4 h-4"
            style={{ color: getEcosystemColor(node.ecosystem) }}
          />
        </div>
        <div>
          <h4 className="font-semibold theme-text-primary text-sm tracking-wide">{node.name}</h4>
          <span
            className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md mt-1 inline-block"
            style={{
              backgroundColor: `${getEcosystemColor(node.ecosystem)}15`,
              color: getEcosystemColor(node.ecosystem)
            }}
          >
            {formatEcosystemName(node.ecosystem)}
          </span>
          <div className="flex items-center gap-1 mt-2 text-xs theme-text-faint">
            <GitBranch className="w-3 h-3" />
            <span>Depth: {node.depth}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

"use client";

import { motion } from "framer-motion";
import { getEcosystemColor, formatEcosystemName } from "@/lib/utils";

const ecosystems = ["NPM", "PY_PI", "CARGO", "MAVEN", "GO"];

export function GraphLegend() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-4 right-4 glass-card p-4"
    >
      <h4 className="text-xs font-semibold theme-text-tertiary mb-3">Ecosystems</h4>
      <div className="space-y-2">
        {ecosystems.map((eco) => (
          <div key={eco} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getEcosystemColor(eco) }}
            />
            <span className="text-xs theme-text-muted">{formatEcosystemName(eco)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

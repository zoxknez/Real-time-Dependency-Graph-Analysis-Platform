"use client";

import { motion } from "framer-motion";
import { cn, formatEcosystemName, getEcosystemColor } from "@/lib/utils";

const ecosystems = ["ALL", "NPM", "PY_PI", "CARGO", "MAVEN", "NU_GET", "GO"] as const;

interface EcosystemFilterProps {
  selected: string;
  onSelect: (ecosystem: string) => void;
}

export function EcosystemFilter({ selected, onSelect }: EcosystemFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm theme-text-muted mr-2">Filter by:</span>
      {ecosystems.map((eco) => {
        const isSelected = selected === eco;
        const color = getEcosystemColor(eco);
        const label = eco === "ALL" ? "All" : formatEcosystemName(eco);
        return (
          <button
            key={eco}
            onClick={() => onSelect(eco)}
            className={cn(
              "relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
              isSelected
                ? "theme-text-primary"
                : "theme-text-muted theme-hover-text theme-inner-card-hover"
            )}
          >
            {isSelected && (
              <motion.div
                layoutId="ecosystem-filter-bg"
                className="absolute inset-0 rounded-xl"
                style={{ backgroundColor: `${color}30`, border: `1px solid ${color}50` }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { cn, formatEcosystemName, getEcosystemColor } from "@/lib/utils";

const ecosystems = [
  { id: "ALL", name: "All", color: "#6366f1" },
  { id: "NPM", name: "npm", color: "#CB3837" },
  { id: "PY_PI", name: "PyPI", color: "#3775A9" },
  { id: "CARGO", name: "Cargo", color: "#DEA584" },
  { id: "MAVEN", name: "Maven", color: "#C71A36" },
  { id: "GO", name: "Go", color: "#00ADD8" },
];

interface EcosystemFilterProps {
  selected: string;
  onSelect: (ecosystem: string) => void;
}

export function EcosystemFilter({ selected, onSelect }: EcosystemFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm theme-text-muted mr-2">Filter by:</span>
      {ecosystems.map((eco) => {
        const isSelected = selected === eco.id;
        return (
          <button
            key={eco.id}
            onClick={() => onSelect(eco.id)}
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
                style={{ backgroundColor: `${eco.color}30`, border: `1px solid ${eco.color}50` }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: eco.color }}
              />
              {eco.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

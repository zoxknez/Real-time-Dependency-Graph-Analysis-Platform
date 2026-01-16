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
          <motion.button
            key={eco}
            onClick={() => onSelect(eco)}
            className={cn(
              "relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 group",
              isSelected
                ? "theme-text-primary"
                : "theme-text-muted hover:theme-text-secondary theme-inner-card-hover"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isSelected && (
              <motion.div
                layoutId="ecosystem-filter-bg"
                className="absolute inset-0 rounded-xl overflow-hidden"
                style={{
                  backgroundColor: `${color}15`,
                  border: `1px solid ${color}60`,
                  boxShadow: `0 0 15px ${color}30`
                }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-1/3 -skew-x-12"
                  animate={{
                    left: ["-100%", "200%"],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </motion.div>
            )}
            <span className="relative flex items-center gap-2">
              <motion.span
                className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]"
                style={{ backgroundColor: color }}
                animate={isSelected ? {
                  scale: [1, 1.4, 1],
                  boxShadow: [`0 0 0px ${color}`, `0 0 10px ${color}`, `0 0 0px ${color}`]
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              />
              {label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { Package as PackageIcon, ArrowRight, GitBranch, ExternalLink, Star, Sparkles } from "lucide-react";
import { cn, formatEcosystemName, getEcosystemBadgeClass, getEcosystemColor } from "@/lib/utils";
import { Package } from "@/lib/graphql/types";
import { useFavoritesStore } from "@/lib/stores";

interface PackageCardProps {
  package: Package;
  onClick?: () => void;
  isSelected?: boolean;
  depth?: number;
  score?: number;
}

const registryLinks: Record<string, (name: string) => string> = {
  npm: (name) => `https://www.npmjs.com/package/${name}`,
  pypi: (name) => `https://pypi.org/project/${name}`,
  py_pi: (name) => `https://pypi.org/project/${name}`,
  cargo: (name) => `https://crates.io/crates/${name}`,
  maven: (name) => `https://mvnrepository.com/artifact/${name}`,
  nuget: (name) => `https://www.nuget.org/packages/${name}`,
  go: (name) => `https://pkg.go.dev/${name}`,
};

export function PackageCard({ package: pkg, onClick, isSelected, depth, score }: PackageCardProps) {
  const registryLink = registryLinks[pkg.ecosystem.toLowerCase()]?.(pkg.name);
  const { isFavorite, toggleFavorite } = useFavoritesStore();
  const isFav = isFavorite(pkg.id);

  const handleExternalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite({ id: pkg.id, name: pkg.name, ecosystem: pkg.ecosystem });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{
        scale: 1.02,
        y: -1,
        transition: { type: "spring", stiffness: 400, damping: 10 }
      }}
      onClick={onClick}
      className={cn(
        "glass-card p-5 cursor-pointer transition-all duration-300 group relative overflow-hidden",
        isSelected
          ? "border-primary-500/50 shadow-glow ring-1 ring-primary-500/30 bg-primary-500/5"
          : "theme-border hover:border-primary-500/40 hover:shadow-lg"
      )}
    >
      {/* Selection Glow Indicator */}
      {isSelected && (
        <motion.div
          layoutId="package-selection-glow"
          className="absolute -inset-0.5 bg-gradient-to-r from-primary-500/20 via-accent-500/20 to-primary-500/20 blur opacity-70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
        />
      )}

      <div className="relative flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className="p-3 rounded-xl transition-transform group-hover:scale-110 duration-300 shadow-inner"
            style={{ backgroundColor: `${getEcosystemColor(pkg.ecosystem)}15` }}
          >
            <PackageIcon
              className="w-6 h-6"
              style={{ color: getEcosystemColor(pkg.ecosystem) }}
            />
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold theme-text-primary group-hover:text-primary-400 transition-colors">
                {pkg.name}
              </h3>
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold border",
                  getEcosystemBadgeClass(pkg.ecosystem)
                )}
              >
                {formatEcosystemName(pkg.ecosystem)}
              </span>
            </div>
            <p className="text-sm theme-text-muted font-mono bg-black/10 px-2 py-0.5 rounded inline-block">
              {pkg.id}
            </p>
            {typeof score === "number" && (
              <p className="text-xs theme-text-faint mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-accent-400" />
                Match: {(score * 100).toFixed(1)}%
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              {depth !== undefined && (
                <div className="flex items-center gap-1 text-xs theme-text-faint bg-white/5 px-2 py-1 rounded">
                  <GitBranch className="w-3 h-3" />
                  <span>Depth: {depth}</span>
                </div>
              )}
              {registryLink && (
                <a
                  href={registryLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleExternalClick}
                  className="flex items-center gap-1.5 text-xs theme-text-muted hover:text-primary-400 transition-all hover:translate-x-0.5"
                >
                  <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                    <ExternalLink className="w-2.5 h-2.5" />
                  </div>
                  <span>View Registry</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={handleFavoriteClick}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-200",
              isFav
                ? "text-warning bg-warning/10 shadow-lg shadow-warning/10"
                : "theme-text-faint opacity-0 group-hover:opacity-100 hover:bg-white/10"
            )}
            title={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("w-4 h-4 transition-transform", isFav ? "fill-current scale-110" : "group-hover:scale-110")} />
          </button>
          <div className={cn(
            "p-2 rounded-lg transition-all transform",
            isSelected ? "translate-x-1" : "group-hover:translate-x-1 opacity-0 group-hover:opacity-100"
          )}>
            <ArrowRight
              className={cn(
                "w-5 h-5",
                isSelected ? "text-primary-400" : "theme-text-faint"
              )}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

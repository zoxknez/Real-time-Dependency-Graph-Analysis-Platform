"use client";

import { motion } from "framer-motion";
import { Package as PackageIcon, ArrowRight, GitBranch, ExternalLink, Star } from "lucide-react";
import { cn, formatEcosystemName, getEcosystemBadgeClass, getEcosystemColor } from "@/lib/utils";
import { Package } from "@/lib/graphql/types";
import { useFavoritesStore } from "@/lib/stores";

interface PackageCardProps {
  package: Package;
  onClick?: () => void;
  isSelected?: boolean;
  depth?: number;
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

export function PackageCard({ package: pkg, onClick, isSelected, depth }: PackageCardProps) {
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
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className={cn(
        "glass-card p-5 cursor-pointer transition-all duration-200 group",
        isSelected
          ? "border-primary-500/50 shadow-glow ring-1 ring-primary-500/20"
          : "theme-border hover:border-primary-500/30"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className="p-3 rounded-xl"
            style={{ backgroundColor: `${getEcosystemColor(pkg.ecosystem)}20` }}
          >
            <PackageIcon
              className="w-6 h-6"
              style={{ color: getEcosystemColor(pkg.ecosystem) }}
            />
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold theme-text-primary">{pkg.name}</h3>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  getEcosystemBadgeClass(pkg.ecosystem)
                )}
              >
                {formatEcosystemName(pkg.ecosystem)}
              </span>
            </div>
            <p className="text-sm theme-text-muted font-mono">{pkg.id}</p>
            <div className="flex items-center gap-3 mt-2">
              {depth !== undefined && (
                <div className="flex items-center gap-1 text-xs theme-text-faint">
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
                  className="flex items-center gap-1 text-xs theme-text-muted hover:text-primary-400 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Registry</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFavoriteClick}
            className={cn(
              "p-2 rounded-lg transition-all duration-200",
              isFav 
                ? "text-warning bg-warning/10" 
                : "theme-text-faint opacity-0 group-hover:opacity-100 theme-interactive"
            )}
            title={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("w-4 h-4", isFav && "fill-current")} />
          </button>
          <ArrowRight
            className={cn(
              "w-5 h-5 transition-all",
              isSelected ? "text-primary-400" : "theme-text-faint"
            )}
          />
        </div>
      </div>
    </motion.div>
  );
}

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Star,
  Package,
  GitBranch,
  Shield,
  Clock,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react";
import { useFavoritesStore, useHistoryStore } from "@/lib/stores";
import { formatEcosystemName, getEcosystemColor } from "@/lib/utils";
import { useFocusTrap } from "@/components/ui/accessibility";
import { useEffect } from "react";

interface FavoritesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FavoritesPanel({ isOpen, onClose }: FavoritesPanelProps) {
  const router = useRouter();
  const { favorites, removeFavorite } = useFavoritesStore();
  const { recentPackages, clearHistoryByType } = useHistoryStore();
  const focusTrapRef = useFocusTrap(isOpen);

  const navigateTo = (path: string) => {
    router.push(path);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="Favorites and recent items"
            ref={focusTrapRef}
            className="fixed left-0 top-0 h-full w-80 glass-card rounded-none border-l-0 border-t-0 border-b-0 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-4 border-b theme-border flex items-center justify-between">
              <h2 className="text-lg font-semibold theme-text-primary flex items-center gap-2">
                <Star className="w-5 h-5 text-warning" />
                Favorites & Recent
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg theme-interactive transition-colors"
                aria-label="Close favorites panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto h-[calc(100%-64px)]">
              {/* Favorites Section */}
              <div className="p-4 border-b theme-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold theme-text-secondary flex items-center gap-2">
                    <Star className="w-4 h-4 text-warning" />
                    Favorites
                    <span className="text-xs theme-text-faint">({favorites.length})</span>
                  </h3>
                </div>

                {favorites.length === 0 ? (
                  <p className="text-sm theme-text-muted py-4 text-center">
                    No favorites yet. Star packages to save them here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {favorites.map((pkg) => (
                      <motion.div
                        key={pkg.id}
                        layout
                        className="group flex items-center gap-3 p-3 rounded-xl theme-inner-card theme-inner-card-hover transition-colors cursor-pointer"
                        onClick={() => navigateTo(`/explore?q=${encodeURIComponent(pkg.id)}`)}
                      >
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${getEcosystemColor(pkg.ecosystem)}20` }}
                        >
                          <Package
                            className="w-4 h-4"
                            style={{ color: getEcosystemColor(pkg.ecosystem) }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium theme-text-primary truncate">
                            {pkg.name}
                          </p>
                          <p className="text-xs theme-text-faint">
                            {formatEcosystemName(pkg.ecosystem)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateTo(`/graph?pkg=${encodeURIComponent(pkg.id)}`);
                            }}
                            className="p-1.5 rounded-lg theme-interactive transition-colors"
                            title="View Graph"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateTo(`/impact?pkg=${encodeURIComponent(pkg.id)}`);
                            }}
                            className="p-1.5 rounded-lg theme-interactive transition-colors"
                            title="Impact Analysis"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFavorite(pkg.id);
                            }}
                            className="p-1.5 rounded-lg theme-interactive text-danger transition-colors"
                            title="Remove from favorites"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <ChevronRight className="w-4 h-4 theme-text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Packages Section */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold theme-text-secondary flex items-center gap-2">
                    <Clock className="w-4 h-4 theme-text-muted" />
                    Recent Packages
                    <span className="text-xs theme-text-faint">({recentPackages.length})</span>
                  </h3>
                  {recentPackages.length > 0 && (
                    <button
                      onClick={() => clearHistoryByType("package")}
                      className="text-xs theme-text-muted theme-hover-text transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {recentPackages.length === 0 ? (
                  <p className="text-sm theme-text-muted py-4 text-center">
                    No recently viewed packages.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentPackages.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        className="group flex items-center gap-3 p-3 rounded-xl theme-inner-card theme-inner-card-hover transition-colors cursor-pointer"
                        onClick={() => navigateTo(`/explore?q=${encodeURIComponent(item.query)}`)}
                      >
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: item.ecosystem ? `${getEcosystemColor(item.ecosystem)}20` : undefined }}
                        >
                          <Package
                            className="w-4 h-4"
                            style={{ color: item.ecosystem ? getEcosystemColor(item.ecosystem) : undefined }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium theme-text-primary truncate">
                            {item.query}
                          </p>
                          <p className="text-xs theme-text-faint">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 theme-text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

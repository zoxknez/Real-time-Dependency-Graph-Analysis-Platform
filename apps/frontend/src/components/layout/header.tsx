"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sun,
  Moon,
  Command,
  User,
  LogOut,
  Settings,
  Star,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import { NotificationCenter } from "@/components/ui/notification-center";
import { FavoritesPanel } from "@/components/ui/favorites-panel";
import { useHistoryStore } from "@/lib/stores";
import { useCircuitBreakerStatus } from "@/lib/apollo-wrapper";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const router = useRouter();
  const { addToHistory } = useHistoryStore();
  const circuit = useCircuitBreakerStatus();

  const pathname = usePathname();
  const hideSearch = pathname === "/" || pathname === "/explore";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Track search in history
      addToHistory({
        id: `search-${Date.now()}`,
        type: "search",
        query: searchQuery.trim(),
      });
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="h-16 px-6 flex items-center justify-between border-b theme-border glass-card rounded-none border-l-0 border-t-0 border-r-0 relative z-50 transition-colors duration-300">
      {/* Search Bar - Hidden on Explore page to avoid duplication */}
      {hideSearch ? (
        <div className="flex-1" />
      ) : (
        <div className="flex-1 max-w-xl">
          <form onSubmit={handleSearch} className="relative w-full" role="search">
            <div
              className={cn(
                "relative flex items-center transition-all duration-300",
                isSearchFocused && "scale-[1.01]"
              )}
            >
              <Search
                className={cn(
                  "absolute left-4 w-5 h-5 transition-colors duration-300",
                  isSearchFocused ? "text-primary-400" : "theme-text-muted"
                )}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search packages... (e.g., npm:express, pypi:flask)"
                aria-label="Search packages"
                role="searchbox"
                className={cn(
                  "w-full pl-12 pr-24 py-2.5 rounded-xl transition-all duration-300",
                  "bg-surface-900/40 backdrop-blur-md border",
                  "theme-text-primary placeholder:theme-text-muted text-sm",
                  isSearchFocused
                    ? "border-primary-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)] bg-surface-900/60"
                    : "theme-border hover:border-white/20"
                )}
              />
              <div className="absolute right-3 flex items-center gap-1.5 text-[10px] theme-text-faint">
                <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border theme-border font-mono shadow-sm">
                  <Command className="w-2.5 h-2.5 inline-block -mt-0.5" />
                </kbd>
                <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border theme-border font-mono shadow-sm">
                  K
                </kbd>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Right Actions */}
      <div className="flex items-center gap-2 ml-6">
        {/* Favorites */}
        <button
          onClick={() => setShowFavorites(true)}
          className="relative p-2.5 rounded-xl theme-interactive transition-all duration-200"
          title="Favorites & Recent"
          aria-label="Favorites and recent items"
        >
          <Star className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <NotificationCenter />

        {/* API Health Indicator */}
        <div
          className={cn(
            "hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-medium",
            circuit.isOpen
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          )}
          title={
            circuit.isOpen
              ? `Circuit breaker open after ${circuit.failures} failures. Retrying in ${circuit.nextRetryIn}s.`
              : "API healthy"
          }
        >
          {circuit.isOpen ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          <span>
            {circuit.isOpen
              ? `API Paused (${circuit.nextRetryIn}s)`
              : "API OK"}
          </span>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl theme-interactive transition-all duration-200"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          data-testid="theme-toggle"
        >
          <AnimatePresence mode="wait">
            {theme === "dark" ? (
              <motion.div
                key="sun"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.2 }}
              >
                <Sun className="w-5 h-5" />
              </motion.div>
            ) : (
              <motion.div
                key="moon"
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ duration: 0.2 }}
              >
                <Moon className="w-5 h-5" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>

        {/* Divider */}
        <div className="w-px h-8 theme-border mx-2" />

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-1.5 pr-4 rounded-xl theme-bg-hover transition-all duration-200"
          >
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium theme-text-primary">Admin</p>
              <p className="text-xs theme-text-muted">Enterprise</p>
            </div>
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-48 py-2 rounded-xl theme-panel shadow-xl z-50"
              >
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    router.push('/settings');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm theme-text-tertiary theme-hover-text theme-bg-hover transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <hr className="my-2 theme-border" />
                <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-danger theme-bg-hover transition-colors">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Favorites Panel */}
      <FavoritesPanel isOpen={showFavorites} onClose={() => setShowFavorites(false)} />
    </header>
  );
}

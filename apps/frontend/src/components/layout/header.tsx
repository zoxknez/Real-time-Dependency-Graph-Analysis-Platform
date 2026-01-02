"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Bell,
  Sun,
  Moon,
  Command,
  User,
  LogOut,
  Settings,
} from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="h-16 px-6 flex items-center justify-between border-b theme-border glass-card rounded-none border-l-0 border-t-0 border-r-0 relative z-50 transition-colors duration-300">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="relative flex-1 max-w-xl">
        <div
          className={cn(
            "relative flex items-center transition-all duration-300",
            isSearchFocused && "scale-[1.02]"
          )}
        >
          <Search className="absolute left-4 w-5 h-5 theme-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search packages... (e.g., npm:express, pypi:flask)"
            className={cn(
              "w-full pl-12 pr-24 py-3 rounded-xl theme-inner-card border transition-all duration-300",
              "theme-text-primary placeholder:theme-text-muted text-sm",
              "focus:outline-none focus:ring-2 focus:ring-primary-500/50",
              isSearchFocused
                ? "border-primary-500/50 shadow-glow"
                : "theme-border"
            )}
          />
          <div className="absolute right-3 flex items-center gap-1 text-xs theme-text-faint">
            <kbd className="px-2 py-1 rounded-md theme-inner-card theme-border border font-mono">
              <Command className="w-3 h-3 inline-block" />
            </kbd>
            <kbd className="px-2 py-1 rounded-md theme-inner-card theme-border border font-mono">
              K
            </kbd>
          </div>
        </div>
      </form>

      {/* Right Actions */}
      <div className="flex items-center gap-2 ml-6">
        {/* Notifications */}
        <button className="relative p-2.5 rounded-xl theme-interactive transition-all duration-200">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl theme-interactive transition-all duration-200"
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
    </header>
  );
}

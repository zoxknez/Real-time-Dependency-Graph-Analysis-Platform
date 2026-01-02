"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Command,
  Search,
  Home,
  Package,
  GitBranch,
  Shield,
  Route,
  Activity,
  Settings,
  X,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const commands = [
  { id: "home", name: "Go to Dashboard", icon: Home, href: "/", shortcut: "G H" },
  { id: "explore", name: "Explore Packages", icon: Package, href: "/explore", shortcut: "G E" },
  { id: "graph", name: "View Graph", icon: GitBranch, href: "/graph", shortcut: "G G" },
  { id: "impact", name: "Impact Analysis", icon: Shield, href: "/impact", shortcut: "G I" },
  { id: "path", name: "Path Finder", icon: Route, href: "/path", shortcut: "G P" },
  { id: "live", name: "Live Feed", icon: Activity, href: "/live", shortcut: "G L" },
  { id: "settings", name: "Settings", icon: Settings, href: "/settings", shortcut: "G S" },
];

const searchExamples = [
  { id: "s1", name: "Search: cargo:tokio", query: "cargo:tokio" },
  { id: "s2", name: "Search: pypi:requests", query: "pypi:requests" },
  { id: "s3", name: "Search: npm:express", query: "npm:express" },
];

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const filteredCommands = query
    ? commands.filter((cmd) =>
        cmd.name.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const allItems = query.length > 2
    ? [...filteredCommands, ...searchExamples.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))]
    : filteredCommands;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Open palette with Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      if (!isOpen) return;

      switch (e.key) {
        case "Escape":
          setIsOpen(false);
          setQuery("");
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          const item = allItems[selectedIndex];
          if (item) {
            if ("href" in item) {
              router.push(item.href);
            } else if ("query" in item) {
              router.push(`/explore?q=${encodeURIComponent(item.query)}`);
            }
            setIsOpen(false);
            setQuery("");
          }
          break;
      }
    },
    [isOpen, allItems, selectedIndex, router]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item: (typeof commands)[0] | (typeof searchExamples)[0]) => {
    if ("href" in item) {
      router.push(item.href);
    } else if ("query" in item) {
      router.push(`/explore?q=${encodeURIComponent(item.query)}`);
    }
    setIsOpen(false);
    setQuery("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
          >
            <div className="glass-card overflow-hidden shadow-2xl">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-4 border-b theme-border">
                <Search className="w-5 h-5 theme-text-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search commands or packages..."
                  autoFocus
                  className="flex-1 bg-transparent theme-text-primary placeholder:theme-text-muted outline-none text-sm"
                />
                <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded theme-inner-card text-xs theme-text-muted">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto p-2">
                {allItems.length === 0 ? (
                  <div className="py-8 text-center theme-text-muted text-sm">
                    No results found
                  </div>
                ) : (
                  <div className="space-y-1">
                    {allItems.map((item, index) => {
                      const Icon = "icon" in item ? item.icon : Search;
                      const isSelected = index === selectedIndex;
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
                            isSelected
                              ? "bg-primary-500/20 theme-text-primary"
                              : "theme-text-tertiary theme-inner-card-hover"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className={cn(
                              "w-4 h-4",
                              isSelected ? "text-primary-400" : "theme-text-faint"
                            )} />
                            <span className="text-sm">{item.name}</span>
                          </div>
                          {"shortcut" in item && (
                            <div className="flex items-center gap-1">
                              {item.shortcut.split(" ").map((key) => (
                                <kbd
                                  key={key}
                                  className="px-1.5 py-0.5 rounded theme-inner-card text-xs theme-text-muted font-mono"
                                >
                                  {key}
                                </kbd>
                              ))}
                            </div>
                          )}
                          {"query" in item && (
                            <ArrowRight className="w-4 h-4 theme-text-faint" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t theme-border text-xs theme-text-faint">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded theme-inner-card">↑↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded theme-inner-card">↵</kbd>
                    Select
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <Command className="w-3 h-3" />K to toggle
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

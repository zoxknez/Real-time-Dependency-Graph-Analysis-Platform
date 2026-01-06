"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Package, Clock, TrendingUp, Loader2 } from "lucide-react";
import { cn, formatEcosystemName, getEcosystemBadgeClass } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  placeholder?: string;
  suggestions?: string[];
  recentSearches?: string[];
  isLoading?: boolean;
  className?: string;
}

// Popular package suggestions by ecosystem
const POPULAR_PACKAGES = [
  "cargo:tokio",
  "cargo:serde",
  "cargo:reqwest",
  "cargo:clap",
  "cargo:anyhow",
  "cargo:thiserror",
  "npm:express",
  "npm:react",
  "npm:lodash",
  "npm:axios",
  "npm:typescript",
  "pypi:requests",
  "pypi:flask",
  "pypi:django",
  "pypi:numpy",
  "pypi:pandas",
];

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = "Search packages...",
  suggestions: _suggestions = [],
  recentSearches: _recentSearches = [],
  isLoading = false,
  className,
}: SearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage
  const [storedRecentSearches, setStoredRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("recentSearches");
      if (stored) {
        try {
          setStoredRecentSearches(JSON.parse(stored).slice(0, 5));
        } catch {
          setStoredRecentSearches([]);
        }
      }
    }
  }, []);

  // Save to recent searches
  const saveToRecent = useCallback((query: string) => {
    if (!query.trim()) return;
    const updated = [query, ...storedRecentSearches.filter((s) => s !== query)].slice(0, 5);
    setStoredRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  }, [storedRecentSearches]);

  // Filter suggestions based on input
  const filteredSuggestions = useMemo(() => {
    if (!value.trim()) return [];
    const query = value.toLowerCase();
    return POPULAR_PACKAGES.filter((pkg) => pkg.toLowerCase().includes(query)).slice(0, 5);
  }, [value]);

  // Combine all items for the dropdown
  const dropdownItems = useMemo(() => {
    if (value.trim()) {
      // Show filtered suggestions when typing
      return filteredSuggestions.map((s) => ({ type: "suggestion" as const, value: s }));
    } else {
      // Show recent searches when empty
      return storedRecentSearches.map((s) => ({ type: "recent" as const, value: s }));
    }
  }, [value, filteredSuggestions, storedRecentSearches]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!dropdownItems.length) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => 
            prev < dropdownItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => 
            prev > 0 ? prev - 1 : dropdownItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && dropdownItems[selectedIndex]) {
            const selected = dropdownItems[selectedIndex].value;
            onChange(selected);
            onSearch(selected);
            saveToRecent(selected);
            setIsFocused(false);
          } else if (value.trim()) {
            onSearch(value);
            saveToRecent(value);
            setIsFocused(false);
          }
          break;
        case "Escape":
          setIsFocused(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [dropdownItems, selectedIndex, value, onChange, onSearch, saveToRecent]
  );

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [dropdownItems.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value);
      saveToRecent(value);
      setIsFocused(false);
    }
  };

  const handleItemClick = (item: string) => {
    onChange(item);
    onSearch(item);
    saveToRecent(item);
    setIsFocused(false);
  };

  const showDropdown = isFocused && dropdownItems.length > 0;

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 theme-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "input-search pl-12 pr-20",
            showDropdown && "rounded-b-none border-b-0"
          )}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
          )}
          {value && !isLoading && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              className="theme-text-muted theme-hover-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full glass-card border-t-0 
                       rounded-b-xl rounded-t-none shadow-xl overflow-hidden"
          >
            {!value.trim() && storedRecentSearches.length > 0 && (
              <div className="px-4 py-2 text-xs theme-text-faint uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Recent Searches
              </div>
            )}
            {value.trim() && filteredSuggestions.length > 0 && (
              <div className="px-4 py-2 text-xs theme-text-faint uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-3 h-3" />
                Suggestions
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {dropdownItems.map((item, index) => {
                const [ecosystem, name] = item.value.split(":");
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleItemClick(item.value)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "w-full px-4 py-3 flex items-center gap-3 text-left transition-colors",
                      selectedIndex === index
                        ? "bg-primary-600/20"
                        : "theme-inner-card-hover"
                    )}
                  >
                    <Package className="w-4 h-4 theme-text-muted flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {ecosystem && (
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-xs font-medium",
                              getEcosystemBadgeClass(ecosystem.toUpperCase())
                            )}
                          >
                            {formatEcosystemName(ecosystem.toUpperCase())}
                          </span>
                        )}
                        <span className="theme-text-primary font-mono truncate">
                          {name || item.value}
                        </span>
                      </div>
                    </div>
                    {item.type === "recent" && (
                      <Clock className="w-3.5 h-3.5 theme-text-faint flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2 border-t theme-border text-xs theme-text-faint flex items-center justify-between">
              <span>
                <kbd className="px-1.5 py-0.5 theme-inner-card rounded theme-text-muted">↑↓</kbd>
                {" "}to navigate
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 theme-inner-card rounded theme-text-muted">Enter</kbd>
                {" "}to search
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

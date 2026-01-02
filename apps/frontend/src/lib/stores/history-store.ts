"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface HistoryItem {
  id: string;
  type: "package" | "search" | "graph" | "impact" | "path";
  query: string;
  ecosystem?: string;
  timestamp: string; // ISO string for serialization
  metadata?: Record<string, unknown>;
}

interface HistoryState {
  history: HistoryItem[];
  recentPackages: HistoryItem[];
  recentSearches: HistoryItem[];
  
  addToHistory: (item: Omit<HistoryItem, "timestamp">) => void;
  clearHistory: () => void;
  clearHistoryByType: (type: HistoryItem["type"]) => void;
  getRecentByType: (type: HistoryItem["type"], limit?: number) => HistoryItem[];
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      recentPackages: [],
      recentSearches: [],
      
      addToHistory: (item) => {
        set((state) => {
          const newItem = { ...item, timestamp: new Date().toISOString() };
          
          // Remove duplicates
          const filteredHistory = state.history.filter(
            (h) => !(h.type === item.type && h.query === item.query)
          );
          
          const newHistory = [newItem, ...filteredHistory].slice(0, 100);
          
          return {
            history: newHistory,
            recentPackages: newHistory.filter((h) => h.type === "package").slice(0, 10),
            recentSearches: newHistory.filter((h) => h.type === "search").slice(0, 10),
          };
        });
      },
      
      clearHistory: () => {
        set({ history: [], recentPackages: [], recentSearches: [] });
      },
      
      clearHistoryByType: (type) => {
        set((state) => {
          const newHistory = state.history.filter((h) => h.type !== type);
          return {
            history: newHistory,
            recentPackages: type === "package" ? [] : state.recentPackages,
            recentSearches: type === "search" ? [] : state.recentSearches,
          };
        });
      },
      
      getRecentByType: (type, limit = 10) => {
        return get().history.filter((h) => h.type === type).slice(0, limit);
      },
    }),
    {
      name: "idp-history",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

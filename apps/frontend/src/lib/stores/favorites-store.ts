"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface FavoritePackage {
  id: string;
  name: string;
  ecosystem: string;
  addedAt: string; // Store as ISO string for serialization
}

interface FavoritesState {
  favorites: FavoritePackage[];
  addFavorite: (pkg: Omit<FavoritePackage, "addedAt">) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (pkg: Omit<FavoritePackage, "addedAt">) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      
      addFavorite: (pkg) => {
        set((state) => ({
          favorites: [
            { ...pkg, addedAt: new Date().toISOString() },
            ...state.favorites.filter((f) => f.id !== pkg.id),
          ].slice(0, 50), // Max 50 favorites
        }));
      },
      
      removeFavorite: (id) => {
        set((state) => ({
          favorites: state.favorites.filter((f) => f.id !== id),
        }));
      },
      
      isFavorite: (id) => {
        return get().favorites.some((f) => f.id === id);
      },
      
      toggleFavorite: (pkg) => {
        const state = get();
        if (state.isFavorite(pkg.id)) {
          state.removeFavorite(pkg.id);
        } else {
          state.addFavorite(pkg);
        }
      },
    }),
    {
      name: "idp-favorites",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

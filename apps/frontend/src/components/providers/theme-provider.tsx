"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSavedTheme(): Theme | null {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "system") {
    return savedTheme;
  }

  return null;
}

function getDomTheme(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function applyThemeToRoot(root: HTMLElement, theme: Theme) {
  let resolvedTheme = theme;
  if (theme === "system") {
    resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    const root = window.document.documentElement;
    applyThemeToRoot(root, theme);

    // If system theme, listen to changes
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        applyThemeToRoot(root, "system");
      };
      // Modern browsers
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    const hydratedTheme = getSavedTheme() ?? getDomTheme();

    hydratedRef.current = true;
    setThemeState(hydratedTheme);
    applyThemeToRoot(root, hydratedTheme);
    root.dataset.themeReady = "true";

    return () => {
      hydratedRef.current = false;
      delete root.dataset.themeReady;
    };
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      let next: Theme;
      if (prev === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        next = isDark ? "light" : "dark";
      } else {
        next = prev === "dark" ? "light" : "dark";
      }
      localStorage.setItem("theme", next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

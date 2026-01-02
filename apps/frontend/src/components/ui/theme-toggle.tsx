"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "button" | "switch";
}

export function ThemeToggle({
  className,
  size = "md",
  variant = "button",
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  if (variant === "switch") {
    return (
      <button
        onClick={toggleTheme}
        className={cn(
          "relative inline-flex items-center rounded-full p-1 transition-colors duration-300",
          theme === "dark"
            ? "bg-slate-700"
            : "bg-slate-200",
          size === "sm" && "w-10 h-6",
          size === "md" && "w-12 h-7",
          size === "lg" && "w-14 h-8",
          className
        )}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        role="switch"
        aria-checked={theme === "dark"}
      >
        <span
          className={cn(
            "absolute transition-transform duration-300 flex items-center justify-center rounded-full bg-white shadow-md",
            size === "sm" && "w-4 h-4",
            size === "md" && "w-5 h-5",
            size === "lg" && "w-6 h-6",
            theme === "dark"
              ? size === "sm"
                ? "translate-x-4"
                : size === "md"
                ? "translate-x-5"
                : "translate-x-6"
              : "translate-x-0"
          )}
        >
          {theme === "dark" ? (
            <Moon className="w-3 h-3 text-slate-700" />
          ) : (
            <Sun className="w-3 h-3 text-amber-500" />
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center justify-center rounded-lg transition-all duration-200",
        "hover:bg-slate-100 dark:hover:bg-slate-800",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-transparent",
        size === "sm" && "p-1.5",
        size === "md" && "p-2",
        size === "lg" && "p-3",
        className
      )}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <Sun className={cn(iconSizes[size], "text-amber-400")} />
      ) : (
        <Moon className={cn(iconSizes[size], "text-slate-600")} />
      )}
    </button>
  );
}

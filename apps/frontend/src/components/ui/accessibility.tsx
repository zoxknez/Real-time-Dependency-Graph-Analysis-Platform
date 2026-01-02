"use client";

import { cn } from "@/lib/utils";
import React, { forwardRef, ElementType } from "react";

/**
 * Screen reader only text - visible to screen readers but hidden visually
 */
export function VisuallyHidden({
  children,
  as: Component = "span",
}: {
  children: React.ReactNode;
  as?: ElementType;
}) {
  return (
    <Component className="sr-only">
      {children}
    </Component>
  );
}

/**
 * Skip link for keyboard navigation
 */
export function SkipLink({
  href = "#main-content",
  children = "Skip to main content",
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={cn(
        "fixed top-0 left-0 z-[100] p-3 m-2 bg-primary text-white rounded-lg",
        "transform -translate-y-full focus:translate-y-0",
        "transition-transform duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      )}
    >
      {children}
    </a>
  );
}

/**
 * Live region for screen reader announcements
 */
export function LiveRegion({
  children,
  politeness = "polite",
  atomic = true,
  className,
}: {
  children: React.ReactNode;
  politeness?: "polite" | "assertive" | "off";
  atomic?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic={atomic}
      className={cn("sr-only", className)}
    >
      {children}
    </div>
  );
}

/**
 * Focus trap hook for modals and dialogs
 */
export function useFocusTrap(isActive: boolean) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!isActive) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Accessible icon button with required aria-label
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    "aria-label": string;
    icon: React.ReactNode;
    size?: "sm" | "md" | "lg";
    variant?: "default" | "ghost" | "danger";
  }
>(({ icon, size = "md", variant = "default", className, ...props }, ref) => {
  const sizes = {
    sm: "p-1.5",
    md: "p-2",
    lg: "p-3",
  };

  const variants = {
    default: "btn-secondary",
    ghost: "hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg",
    danger: "hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg",
  };

  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
});

IconButton.displayName = "IconButton";

/**
 * Accessible progress bar
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  size = "md",
  variant = "primary",
  className,
}: {
  value: number;
  max?: number;
  label: string;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const heights = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const colors = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };

  return (
    <div className={cn("w-full", className)}>
      {showValue && (
        <div className="flex justify-between mb-1 text-sm">
          <span className="theme-text-muted">{label}</span>
          <span className="theme-text-primary font-medium">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className={cn(
          "w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden",
          heights[size]
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            colors[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Keyboard shortcuts display
 */
export function KeyboardShortcut({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="theme-text-muted">+</span>}
          <kbd
            className={cn(
              "px-1.5 py-0.5 text-xs font-mono rounded",
              "bg-slate-100 dark:bg-slate-700",
              "border border-slate-200 dark:border-slate-600",
              "theme-text-primary"
            )}
          >
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

/**
 * Announce message to screen readers
 */
export function useAnnounce() {
  const [message, setMessage] = React.useState("");

  const announce = React.useCallback((msg: string, politeness: "polite" | "assertive" = "polite") => {
    // Clear and reset to trigger announcement
    setMessage("");
    requestAnimationFrame(() => {
      setMessage(msg);
    });
  }, []);

  const Announcer = React.useCallback(
    () => (
      <LiveRegion politeness="polite" aria-atomic={true}>
        {message}
      </LiveRegion>
    ),
    [message]
  );

  return { announce, Announcer };
}

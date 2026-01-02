"use client";

import { Skeleton, SkeletonCard, SkeletonChart } from "./skeleton";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  isLoading: boolean;
  children: React.ReactNode;
  variant?: "skeleton" | "spinner" | "overlay";
  skeletonType?: "card" | "chart" | "text" | "custom";
  skeletonCount?: number;
  loadingText?: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Wrapper component that shows loading state while data is being fetched.
 * Supports multiple variants: skeleton placeholders, spinner, or overlay.
 */
export function LoadingState({
  isLoading,
  children,
  variant = "skeleton",
  skeletonType = "card",
  skeletonCount = 1,
  loadingText,
  className,
  fallback,
}: LoadingStateProps) {
  if (!isLoading) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (variant === "spinner") {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 gap-3", className)}>
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        {loadingText && (
          <p className="text-sm theme-text-muted animate-pulse">{loadingText}</p>
        )}
      </div>
    );
  }

  if (variant === "overlay") {
    return (
      <div className={cn("relative", className)}>
        {children}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            {loadingText && (
              <p className="text-sm theme-text-muted">{loadingText}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Skeleton variant
  const skeletons = Array.from({ length: skeletonCount });

  switch (skeletonType) {
    case "card":
      return (
        <div className={cn("grid gap-4", className)}>
          {skeletons.map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      );
    case "chart":
      return (
        <div className={cn("space-y-4", className)}>
          {skeletons.map((_, i) => (
            <SkeletonChart key={i} />
          ))}
        </div>
      );
    case "text":
      return (
        <div className={cn("space-y-4", className)}>
          {skeletons.map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div className={cn("space-y-4", className)}>
          {skeletons.map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      );
  }
}

/**
 * Inline loading spinner for buttons and small areas
 */
export function InlineSpinner({
  size = "sm",
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return <Loader2 className={cn(sizes[size], "animate-spin", className)} />;
}

/**
 * Full page loading screen
 */
export function PageLoading({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/30 rounded-full" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-primary rounded-full animate-spin" />
        </div>
        <p className="theme-text-muted text-sm animate-pulse">{message}</p>
      </div>
    </div>
  );
}

/**
 * Loading button state
 */
export function LoadingButton({
  isLoading,
  children,
  loadingText = "Loading...",
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading: boolean;
  loadingText?: string;
}) {
  return (
    <button
      className={cn(
        "btn-primary flex items-center gap-2",
        isLoading && "opacity-70 cursor-not-allowed",
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <InlineSpinner />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

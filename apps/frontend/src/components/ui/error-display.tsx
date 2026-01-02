"use client";

import { motion } from "framer-motion";
import { AlertCircle, RefreshCw, Home, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  showHomeButton?: boolean;
  showBackButton?: boolean;
  className?: string;
}

export function ErrorDisplay({
  title = "Something went wrong",
  message,
  onRetry,
  showHomeButton = false,
  showBackButton = false,
  className,
}: ErrorDisplayProps) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "glass-card p-8 text-center max-w-md mx-auto",
        className
      )}
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-danger/20 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-danger" />
      </div>
      
      <h3 className="text-xl font-semibold theme-text-primary mb-2">
        {title}
      </h3>
      
      <p className="theme-text-muted text-sm mb-6">
        {message}
      </p>

      <div className="flex items-center justify-center gap-3">
        {showBackButton && (
          <button
            onClick={() => router.back()}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        )}
        
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
        
        {showHomeButton && (
          <button
            onClick={() => router.push("/")}
            className="btn-secondary flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            Home
          </button>
        )}
      </div>
    </motion.div>
  );
}

interface QueryErrorProps {
  error: Error | { message: string };
  onRetry?: () => void;
  minimal?: boolean;
}

export function QueryError({ error, onRetry, minimal = false }: QueryErrorProps) {
  const message = error instanceof Error ? error.message : error.message;
  
  // Parse common GraphQL errors for user-friendly messages
  const getUserFriendlyMessage = (msg: string): string => {
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return "Unable to connect to the server. Please check your internet connection.";
    }
    if (msg.includes("not found") || msg.includes("404")) {
      return "The requested resource was not found.";
    }
    if (msg.includes("timeout")) {
      return "The request timed out. The server might be busy.";
    }
    if (msg.includes("unauthorized") || msg.includes("401")) {
      return "You don't have permission to access this resource.";
    }
    return msg;
  };

  if (minimal) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
        <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
        <p className="text-sm theme-text-secondary flex-1">
          {getUserFriendlyMessage(message)}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="p-2 rounded-lg theme-interactive text-danger transition-colors"
            title="Retry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <ErrorDisplay
      title="Error Loading Data"
      message={getUserFriendlyMessage(message)}
      onRetry={onRetry}
    />
  );
}

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = AlertCircle,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "py-12 text-center",
        className
      )}
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-full theme-inner-card flex items-center justify-center">
        <Icon className="w-8 h-8 theme-text-faint" />
      </div>
      
      <h3 className="text-lg font-semibold theme-text-secondary mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="theme-text-muted text-sm mb-6 max-w-sm mx-auto">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, AlertCircle, Info, X, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info" | "breaking" | "update";

interface Toast {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  showToast: (options: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Convenience hooks for common toast operations
export function useToastHelpers() {
  const { showToast } = useToast();

  return {
    success: (message: string, title?: string) =>
      showToast({ type: "success", message, title }),
    
    error: (message: string, title?: string) =>
      showToast({ type: "error", message, title, duration: 8000 }),
    
    warning: (message: string, title?: string) =>
      showToast({ type: "warning", message, title }),
    
    info: (message: string, title?: string) =>
      showToast({ type: "info", message, title }),
    
    breakingChange: (packageName: string, version: string, onView?: () => void) =>
      showToast({
        type: "breaking",
        title: "Breaking Change Detected!",
        message: `${packageName} v${version} has breaking changes`,
        duration: 10000,
        action: onView ? { label: "View Details", onClick: onView } : undefined,
      }),
    
    packageUpdate: (packageName: string, version: string, onView?: () => void) =>
      showToast({
        type: "update",
        title: "Package Updated",
        message: `${packageName} v${version} was published`,
        action: onView ? { label: "View", onClick: onView } : undefined,
      }),
  };
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
  breaking: AlertTriangle,
  update: Zap,
};

const colors = {
  success: "border-success/30 bg-success/10",
  error: "border-danger/30 bg-danger/10",
  warning: "border-warning/30 bg-warning/10",
  info: "border-primary-500/30 bg-primary-500/10",
  breaking: "border-red-500/50 bg-red-500/20",
  update: "border-accent-500/30 bg-accent-500/10",
};

const iconColors = {
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
  info: "text-primary-400",
  breaking: "text-red-500",
  update: "text-accent-400",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      const id = Math.random().toString(36).substring(2);
      setToasts((prev) => [...prev, { id, message, type, duration }].slice(-5));

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    []
  );

  const showToast = useCallback((options: Omit<Toast, "id">): string => {
    const id = Math.random().toString(36).substring(2) + Date.now();
    const toast: Toast = {
      ...options,
      id,
      duration: options.duration ?? 5000,
    };
    
    setToasts((prev) => [...prev, toast].slice(-5)); // Keep max 5 toasts

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, toast.duration);
    }
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, showToast, removeToast, clearAll }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg relative overflow-hidden",
                colors[toast.type]
              )}
            >
              <div className={cn("p-1 rounded-lg flex-shrink-0", colors[toast.type])}>
                <Icon className={cn("w-5 h-5", iconColors[toast.type])} />
              </div>
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <p className="font-medium text-sm text-white mb-0.5">{toast.title}</p>
                )}
                <p className={cn(
                  "text-sm",
                  toast.title ? "text-white/80" : "text-white"
                )}>
                  {toast.message}
                </p>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="mt-2 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="theme-text-muted theme-hover-text transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
              
              {/* Progress bar */}
              {toast.duration && toast.duration > 0 && (
                <motion.div
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: toast.duration / 1000, ease: "linear" }}
                  className={cn(
                    "absolute bottom-0 left-0 h-0.5",
                    iconColors[toast.type].replace("text-", "bg-")
                  )}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

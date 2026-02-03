"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Shield,
  AlertTriangle,
  Info,
  Zap,
  Settings,
  ExternalLink,
} from "lucide-react";
import { useNotificationsStore, Notification, NotificationType } from "@/lib/stores";
import { cn, formatEcosystemName, getEcosystemColor } from "@/lib/utils";
import { useRouter } from "next/navigation";

const typeIcons: Record<NotificationType, typeof Bell> = {
  version: Zap,
  security: Shield,
  impact: AlertTriangle,
  system: Info,
};

const typeColors: Record<NotificationType, string> = {
  version: "text-accent-400",
  security: "text-danger",
  impact: "text-warning",
  system: "text-primary-400",
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    removeNotification, 
    clearAll 
  } = useNotificationsStore();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.link) {
      router.push(notification.link);
      setIsOpen(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        title="Notifications"
        className="relative p-2.5 rounded-xl theme-interactive transition-all duration-200"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-accent-500 text-white text-xs font-bold animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-96 max-h-[500px] glass-card overflow-hidden shadow-2xl z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b theme-border flex items-center justify-between">
              <h3 className="font-semibold theme-text-primary flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notifications
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-400">
                    {unreadCount} new
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    aria-label="Mark all notifications as read"
                    className="p-1.5 rounded-lg theme-interactive transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    aria-label="Clear all notifications"
                    className="p-1.5 rounded-lg theme-interactive transition-colors text-danger"
                    title="Clear all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-12 h-12 mx-auto mb-3 theme-text-faint" />
                  <p className="theme-text-muted text-sm">No notifications yet</p>
                  <p className="theme-text-faint text-xs mt-1">
                    You'll see updates for watched packages here
                  </p>
                </div>
              ) : (
                <div className="divide-y theme-border">
                  {notifications.map((notification) => {
                    const Icon = typeIcons[notification.type];
                    const iconColor = typeColors[notification.type];
                    
                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "px-4 py-3 cursor-pointer transition-colors",
                          "theme-inner-card-hover",
                          !notification.read && "bg-primary-500/5"
                        )}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex gap-3">
                          <div className={cn("p-2 rounded-lg theme-inner-card", iconColor)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                "text-sm font-medium",
                                notification.read ? "theme-text-secondary" : "theme-text-primary"
                              )}>
                                {notification.title}
                              </p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNotification(notification.id);
                                }}
                                className="p-1 rounded theme-interactive opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-xs theme-text-muted mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs theme-text-faint">
                                {formatTime(notification.createdAt)}
                              </span>
                              {notification.ecosystem && (
                                <span 
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{ 
                                    backgroundColor: `${getEcosystemColor(notification.ecosystem)}20`,
                                    color: getEcosystemColor(notification.ecosystem)
                                  }}
                                >
                                  {formatEcosystemName(notification.ecosystem)}
                                </span>
                              )}
                              {notification.link && (
                                <ExternalLink className="w-3 h-3 theme-text-faint" />
                              )}
                            </div>
                          </div>
                          {!notification.read && (
                            <div className="w-2 h-2 rounded-full bg-accent-500 mt-2" />
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t theme-border">
              <button
                onClick={() => {
                  router.push("/settings#notifications");
                  setIsOpen(false);
                }}
                className="w-full py-2 text-sm theme-text-muted theme-hover-text transition-colors flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Notification Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

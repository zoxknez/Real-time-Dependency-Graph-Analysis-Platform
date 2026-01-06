"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type NotificationType = "version" | "security" | "impact" | "system";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  packageId?: string;
  ecosystem?: string;
  severity?: "info" | "warning" | "error" | "success";
  read: boolean;
  createdAt: string; // ISO string for serialization
  link?: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  settings: {
    enableNewVersions: boolean;
    enableSecurityAlerts: boolean;
    enableImpactAlerts: boolean;
    soundEnabled: boolean;
  };
  
  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  updateSettings: (settings: Partial<NotificationsState["settings"]>) => void;
}

let notificationCounter = 0;

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, _get) => ({
      notifications: [],
      unreadCount: 0,
      settings: {
        enableNewVersions: true,
        enableSecurityAlerts: true,
        enableImpactAlerts: false,
        soundEnabled: false,
      },
      
      addNotification: (notification) => {
        const id = `notif-${Date.now()}-${++notificationCounter}`;
        set((state) => {
          const newNotifications = [
            { ...notification, id, createdAt: new Date().toISOString(), read: false },
            ...state.notifications,
          ].slice(0, 50);
          
          return {
            notifications: newNotifications,
            unreadCount: newNotifications.filter((n) => !n.read).length,
          };
        });
      },
      
      markAsRead: (id) => {
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
      },
      
      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },
      
      removeNotification: (id) => {
        set((state) => {
          const notifications = state.notifications.filter((n) => n.id !== id);
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
      },
      
      clearAll: () => {
        set({ notifications: [], unreadCount: 0 });
      },
      
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },
    }),
    {
      name: "idp-notifications",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

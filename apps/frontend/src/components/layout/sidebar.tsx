"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Home,
  Search,
  GitBranch,
  Shield,
  Route,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Package,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: Home,
    description: "Overview & Statistics",
  },
  {
    name: "Explore",
    href: "/explore",
    icon: Search,
    description: "Search Packages",
  },
  {
    name: "Graph",
    href: "/graph",
    icon: GitBranch,
    description: "Dependency Visualization",
  },
  {
    name: "Impact Analysis",
    href: "/impact",
    icon: Shield,
    description: "Vulnerability Impact",
  },
  {
    name: "Path Finder",
    href: "/path",
    icon: Route,
    description: "Find Dependency Paths",
  },
  {
    name: "Live Feed",
    href: "/live",
    icon: Activity,
    description: "Real-time Updates",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="relative flex flex-col h-full glass-card rounded-none border-l-0 border-t-0 border-b-0 transition-colors duration-300"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b theme-border">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent-500 border-2 theme-bg-primary animate-pulse" />
        </div>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col"
          >
            <span className="font-bold text-lg theme-text-primary">IDP</span>
            <span className="text-xs theme-text-muted">Inverse Dependencies</span>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-hide">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                isActive
                  ? "bg-primary-500/20 text-primary-400 border border-primary-500/30"
                  : "theme-text-tertiary theme-hover-text theme-bg-hover"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200",
                  isActive
                    ? "bg-primary-500/20"
                    : "theme-inner-card theme-inner-card-hover"
                )}
              >
                <item.icon
                  className={cn(
                    "w-5 h-5 transition-colors",
                    isActive ? "text-primary-400" : "theme-text-muted group-hover:text-primary-500"
                  )}
                />
              </div>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col"
                >
                  <span className="font-medium text-sm">{item.name}</span>
                  <span className="text-xs theme-text-faint">{item.description}</span>
                </motion.div>
              )}
              {isActive && !isCollapsed && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 
                   rounded-full theme-bg-tertiary theme-border-strong border
                   flex items-center justify-center theme-text-muted 
                   theme-hover-text theme-bg-hover transition-all duration-200
                   shadow-lg"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>

      {/* Bottom Section */}
      <div className="p-3 border-t theme-border">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-3 rounded-xl theme-text-muted theme-hover-text theme-bg-hover transition-all duration-200"
          )}
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg theme-inner-card">
            <Settings className="w-5 h-5" />
          </div>
          {!isCollapsed && <span className="font-medium text-sm">Settings</span>}
        </Link>
      </div>
    </motion.aside>
  );
}

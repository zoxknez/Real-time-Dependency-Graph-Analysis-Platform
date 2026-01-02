"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { 
  Search, 
  GitBranch, 
  Shield, 
  Route,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const actions = [
  {
    title: "Search Packages",
    description: "Find packages across ecosystems",
    href: "/explore",
    icon: Search,
    color: "primary",
  },
  {
    title: "Explore Graph",
    description: "Visualize dependency relationships",
    href: "/graph",
    icon: GitBranch,
    color: "accent",
  },
  {
    title: "Impact Analysis",
    description: "Assess vulnerability blast radius",
    href: "/impact",
    icon: Shield,
    color: "danger",
  },
  {
    title: "Find Path",
    description: "Discover dependency paths",
    href: "/path",
    icon: Route,
    color: "success",
  },
];

const colorClasses = {
  primary: "from-primary-500/20 to-primary-600/20 border-primary-500/30 group-hover:border-primary-500/50",
  accent: "from-accent-500/20 to-accent-600/20 border-accent-500/30 group-hover:border-accent-500/50",
  danger: "from-danger/20 to-red-600/20 border-danger/30 group-hover:border-danger/50",
  success: "from-success/20 to-emerald-600/20 border-success/30 group-hover:border-success/50",
};

const iconClasses = {
  primary: "text-primary-400",
  accent: "text-accent-400",
  danger: "text-danger",
  success: "text-success",
};

export function QuickActions() {
  return (
    <div className="glass-card p-6 h-full">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="w-5 h-5 text-accent-400" />
        <h3 className="text-lg font-semibold theme-text-primary">Quick Actions</h3>
      </div>

      <div className="space-y-3">
        {actions.map((action, index) => (
          <motion.div
            key={action.title}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link
              href={action.href}
              className={cn(
                "group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r border transition-all duration-200",
                colorClasses[action.color as keyof typeof colorClasses]
              )}
            >
              <div className={cn(
                "p-2.5 rounded-lg theme-inner-card",
                iconClasses[action.color as keyof typeof iconClasses]
              )}>
                <action.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium theme-text-primary group-hover:text-accent-300 transition-colors">
                  {action.title}
                </h4>
                <p className="text-xs theme-text-muted">{action.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 theme-text-faint group-hover:theme-text-primary group-hover:translate-x-1 transition-all" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

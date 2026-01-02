"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Palette,
  Database,
  Bell,
  Shield,
  Code,
  Moon,
  Sun,
  Monitor,
  Check,
  RotateCcw,
  Save,
  CheckCircle,
  Download,
  Upload,
  Keyboard,
  Info,
  Trash2,
  HardDrive,
  Wifi,
  WifiOff,
  Loader2,
  ExternalLink,
  Github,
  Heart,
} from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

const sections = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "connection", label: "Connection", icon: Database },
  { id: "api", label: "API Settings", icon: Code },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "keyboard", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Data & Cache", icon: HardDrive },
  { id: "about", label: "About", icon: Info },
];

// Default settings values
const DEFAULT_SETTINGS = {
  graphqlEndpoint: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "http://localhost:8080/graphql",
  maxDepth: 4,
  maxResults: 100,
  notifications: {
    newVersions: true,
    securityAdvisories: true,
    impactAlerts: false,
    dailyDigest: false,
  },
  sessionTimeout: "1 hour",
};

// Keyboard shortcuts
const KEYBOARD_SHORTCUTS = [
  { keys: ["Ctrl", "K"], action: "Open search", category: "Navigation" },
  { keys: ["Ctrl", "G"], action: "Go to Graph", category: "Navigation" },
  { keys: ["Ctrl", "E"], action: "Go to Explore", category: "Navigation" },
  { keys: ["Ctrl", "L"], action: "Go to Live Feed", category: "Navigation" },
  { keys: ["Escape"], action: "Close modal/panel", category: "General" },
  { keys: ["?"], action: "Show keyboard shortcuts", category: "General" },
  { keys: ["+"], action: "Zoom in (Graph)", category: "Graph" },
  { keys: ["-"], action: "Zoom out (Graph)", category: "Graph" },
  { keys: ["0"], action: "Reset zoom (Graph)", category: "Graph" },
  { keys: ["F"], action: "Toggle fullscreen (Graph)", category: "Graph" },
];

// App version info
const APP_INFO = {
  version: "2.0.0",
  buildDate: "January 2, 2026",
  nextVersion: "16.1.1",
  reactVersion: "19.2.3",
};

// Hook for persisting settings
function usePersistedSettings<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          setValue(JSON.parse(stored));
        }
      } catch (e) {
        console.error(`Failed to load setting ${key}:`, e);
      }
      setIsInitialized(true);
    }
  }, [key]);

  // Save to localStorage when value changes
  const setPersistedValue = useCallback((newValue: T) => {
    setValue(newValue);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(newValue));
      } catch (e) {
        console.error(`Failed to save setting ${key}:`, e);
      }
    }
  }, [key]);

  return [value, setPersistedValue];
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [activeSection, setActiveSection] = useState("appearance");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [cacheSize, setCacheSize] = useState<string>("Calculating...");

  // Persisted settings
  const [graphqlEndpoint, setGraphqlEndpoint] = usePersistedSettings(
    'settings:graphqlEndpoint',
    DEFAULT_SETTINGS.graphqlEndpoint
  );
  const [maxDepth, setMaxDepth] = usePersistedSettings('settings:maxDepth', DEFAULT_SETTINGS.maxDepth);
  const [maxResults, setMaxResults] = usePersistedSettings('settings:maxResults', DEFAULT_SETTINGS.maxResults);
  const [notifications, setNotifications] = usePersistedSettings(
    'settings:notifications',
    DEFAULT_SETTINGS.notifications
  );
  const [sessionTimeout, setSessionTimeout] = usePersistedSettings(
    'settings:sessionTimeout',
    DEFAULT_SETTINGS.sessionTimeout
  );

  // Calculate cache size on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          totalSize += localStorage.getItem(key)?.length || 0;
        }
      }
      const sizeKB = (totalSize / 1024).toFixed(2);
      setCacheSize(`${sizeKB} KB`);
    }
  }, []);

  // Test connection
  const testConnection = async () => {
    setConnectionStatus("testing");
    try {
      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      if (response.ok) {
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error");
      }
    } catch {
      setConnectionStatus("error");
    }
    setTimeout(() => setConnectionStatus("idle"), 3000);
  };

  // Export settings
  const exportSettings = () => {
    const settings = {
      graphqlEndpoint,
      maxDepth,
      maxResults,
      notifications,
      sessionTimeout,
      theme,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'idp-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    showSaveMessage();
  };

  // Import settings
  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string);
        if (settings.graphqlEndpoint) setGraphqlEndpoint(settings.graphqlEndpoint);
        if (settings.maxDepth) setMaxDepth(settings.maxDepth);
        if (settings.maxResults) setMaxResults(settings.maxResults);
        if (settings.notifications) setNotifications(settings.notifications);
        if (settings.sessionTimeout) setSessionTimeout(settings.sessionTimeout);
        setSaveMessage("Settings imported successfully!");
        setTimeout(() => setSaveMessage(null), 2000);
      } catch {
        setSaveMessage("Failed to import settings");
        setTimeout(() => setSaveMessage(null), 2000);
      }
    };
    reader.readAsText(file);
  };

  // Clear cache
  const clearCache = () => {
    if (typeof window !== 'undefined') {
      const settingsKeys = ['settings:graphqlEndpoint', 'settings:maxDepth', 'settings:maxResults', 
                           'settings:notifications', 'settings:sessionTimeout'];
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !settingsKeys.includes(key)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      setCacheSize("0 KB");
      setSaveMessage("Cache cleared!");
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  // Toggle notification setting
  const toggleNotification = (key: keyof typeof DEFAULT_SETTINGS.notifications) => {
    setNotifications({ ...notifications, [key]: !notifications[key] });
    showSaveMessage();
  };

  // Show save message
  const showSaveMessage = () => {
    setSaveMessage("Settings saved!");
    setTimeout(() => setSaveMessage(null), 2000);
  };

  // Reset all settings to defaults
  const resetToDefaults = () => {
    setGraphqlEndpoint(DEFAULT_SETTINGS.graphqlEndpoint);
    setMaxDepth(DEFAULT_SETTINGS.maxDepth);
    setMaxResults(DEFAULT_SETTINGS.maxResults);
    setNotifications(DEFAULT_SETTINGS.notifications);
    setSessionTimeout(DEFAULT_SETTINGS.sessionTimeout);
    setSaveMessage("Settings reset to defaults!");
    setTimeout(() => setSaveMessage(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold theme-text-primary flex items-center gap-3">
            <Settings className="w-8 h-8 theme-text-muted" />
            Settings
          </h1>
          <p className="theme-text-muted mt-1">
            Configure your Inverse Dependency Platform experience
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Save Message */}
          {saveMessage && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-success text-sm"
            >
              <CheckCircle className="w-4 h-4" />
              {saveMessage}
            </motion.div>
          )}
          
          {/* Reset Button */}
          <button
            onClick={resetToDefaults}
            className="btn-secondary flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-2"
        >
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  activeSection === section.id
                    ? "bg-primary-500/20 text-primary-400"
                    : "theme-text-muted theme-hover-text theme-inner-card-hover"
                )}
              >
                <section.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{section.label}</span>
              </button>
            ))}
          </nav>
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-3 space-y-6"
        >
          {/* Appearance */}
          {activeSection === "appearance" && (
            <div className="glass-card p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold theme-text-primary mb-2">Theme</h2>
                <p className="text-sm theme-text-muted mb-4">
                  Choose your preferred color scheme
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: "light", label: "Light", icon: Sun },
                    { id: "dark", label: "Dark", icon: Moon },
                    { id: "system", label: "System", icon: Monitor },
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => option.id !== "system" && toggleTheme()}
                      className={cn(
                        "relative p-4 rounded-xl border-2 transition-all",
                        theme === option.id
                          ? "border-primary-500 bg-primary-500/10"
                          : "theme-border hover:border-primary-500/30"
                      )}
                    >
                      <option.icon
                        className={cn(
                          "w-6 h-6 mx-auto mb-2",
                          theme === option.id
                            ? "text-primary-400"
                            : "theme-text-muted"
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          theme === option.id ? "theme-text-primary" : "theme-text-muted"
                        )}
                      >
                        {option.label}
                      </span>
                      {theme === option.id && (
                        <div className="absolute top-2 right-2">
                          <Check className="w-4 h-4 text-primary-400" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Connection */}
          {activeSection === "connection" && (
            <div className="glass-card p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold theme-text-primary mb-2">
                  GraphQL Endpoint
                </h2>
                <p className="text-sm theme-text-muted mb-4">
                  Configure the API endpoint for the dependency graph
                </p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={graphqlEndpoint}
                    onChange={(e) => {
                      setGraphqlEndpoint(e.target.value);
                      showSaveMessage();
                    }}
                    className="input-search flex-1"
                  />
                  <button
                    onClick={testConnection}
                    disabled={connectionStatus === "testing"}
                    className="btn-secondary flex items-center gap-2"
                  >
                    {connectionStatus === "testing" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : connectionStatus === "success" ? (
                      <Wifi className="w-4 h-4 text-success" />
                    ) : connectionStatus === "error" ? (
                      <WifiOff className="w-4 h-4 text-danger" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                    Test
                  </button>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-xl border transition-colors",
                connectionStatus === "success" 
                  ? "bg-success/10 border-success/30"
                  : connectionStatus === "error"
                  ? "bg-danger/10 border-danger/30"
                  : "theme-inner-card theme-border"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    connectionStatus === "success" ? "bg-success animate-pulse" 
                    : connectionStatus === "error" ? "bg-danger"
                    : "theme-text-faint bg-current"
                  )} />
                  <span className="text-sm theme-text-tertiary">
                    {connectionStatus === "success" ? "Connected to GraphQL API"
                     : connectionStatus === "error" ? "Connection failed - check endpoint"
                     : connectionStatus === "testing" ? "Testing connection..."
                     : "Click Test to verify connection"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* API Settings */}
          {activeSection === "api" && (
            <div className="glass-card p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold theme-text-primary mb-2">
                  Query Limits
                </h2>
                <p className="text-sm theme-text-muted mb-4">
                  Configure default limits for graph queries
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm theme-text-tertiary mb-2 block">
                      Max Traversal Depth (1-5)
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={maxDepth}
                      onChange={(e) => {
                        setMaxDepth(Number(e.target.value));
                        showSaveMessage();
                      }}
                      className="w-full accent-primary-500"
                    />
                    <div className="flex justify-between text-xs theme-text-faint mt-1">
                      <span>1</span>
                      <span className="font-medium text-primary-400">
                        Current: {maxDepth}
                      </span>
                      <span>5</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm theme-text-tertiary mb-2 block">
                      Max Results per Query
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="500"
                      value={maxResults}
                      onChange={(e) => {
                        setMaxResults(Number(e.target.value));
                        showSaveMessage();
                      }}
                      className="input-search max-w-[200px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold theme-text-primary mb-4">
                Notification Preferences
              </h2>
              <div className="space-y-4">
                {[
                  { key: "newVersions" as const, label: "New package versions" },
                  { key: "securityAdvisories" as const, label: "Security advisories" },
                  { key: "impactAlerts" as const, label: "Impact analysis alerts" },
                  { key: "dailyDigest" as const, label: "Daily digest" },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-4 rounded-xl theme-inner-card theme-inner-card-hover transition-colors"
                  >
                    <span className="theme-text-tertiary">{item.label}</span>
                    <button
                      onClick={() => toggleNotification(item.key)}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative",
                        notifications[item.key] ? "bg-primary-500" : "theme-panel"
                      )}
                    >
                      <motion.div
                        className="absolute top-1 w-4 h-4 rounded-full bg-white"
                        animate={{ left: notifications[item.key] ? 28 : 4 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security */}
          {activeSection === "security" && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold theme-text-primary mb-4">
                Security Settings
              </h2>
              <div className="space-y-4">
                <div className="p-4 rounded-xl theme-inner-card theme-inner-card-hover transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium theme-text-primary">API Key</p>
                      <p className="text-sm theme-text-muted">
                        Generate an API key for programmatic access
                      </p>
                    </div>
                    <button className="btn-secondary text-sm">Generate</button>
                  </div>
                </div>
                <div className="p-4 rounded-xl theme-inner-card theme-inner-card-hover transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium theme-text-primary">Session Timeout</p>
                      <p className="text-sm theme-text-muted">
                        Automatically log out after inactivity
                      </p>
                    </div>
                    <select 
                      value={sessionTimeout}
                      onChange={(e) => {
                        setSessionTimeout(e.target.value);
                        showSaveMessage();
                      }}
                      className="theme-panel theme-border rounded-lg px-3 py-2 text-sm theme-text-primary"
                    >
                      <option value="30 minutes">30 minutes</option>
                      <option value="1 hour">1 hour</option>
                      <option value="4 hours">4 hours</option>
                      <option value="Never">Never</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts */}
          {activeSection === "keyboard" && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold theme-text-primary mb-4 flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-primary-400" />
                Keyboard Shortcuts
              </h2>
              <div className="space-y-6">
                {["Navigation", "General", "Graph"].map((category) => (
                  <div key={category}>
                    <h3 className="text-sm font-medium theme-text-muted mb-3">{category}</h3>
                    <div className="space-y-2">
                      {KEYBOARD_SHORTCUTS.filter(s => s.category === category).map((shortcut, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl theme-inner-card theme-inner-card-hover transition-colors"
                        >
                          <span className="theme-text-tertiary">{shortcut.action}</span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, i) => (
                              <span key={i}>
                                <kbd className="px-2 py-1 text-xs font-mono theme-panel theme-border rounded theme-text-tertiary">
                                  {key}
                                </kbd>
                                {i < shortcut.keys.length - 1 && <span className="theme-text-faint mx-1">+</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data & Cache */}
          {activeSection === "data" && (
            <div className="glass-card p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold theme-text-primary mb-4 flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-primary-400" />
                  Data Management
                </h2>
                
                <div className="space-y-4">
                  {/* Cache Info */}
                  <div className="p-4 rounded-xl theme-inner-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium theme-text-primary">Local Cache</p>
                        <p className="text-sm theme-text-muted">
                          Cached data stored in your browser
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold theme-text-primary">{cacheSize}</p>
                        <button 
                          onClick={clearCache}
                          className="text-xs text-danger hover:underline flex items-center gap-1 mt-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Clear Cache
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Export/Import */}
                  <div className="p-4 rounded-xl theme-inner-card">
                    <p className="font-medium theme-text-primary mb-3">Export / Import Settings</p>
                    <div className="flex gap-3">
                      <button
                        onClick={exportSettings}
                        className="btn-secondary flex items-center gap-2 flex-1"
                      >
                        <Download className="w-4 h-4" />
                        Export Settings
                      </button>
                      <label className="btn-secondary flex items-center gap-2 flex-1 cursor-pointer">
                        <Upload className="w-4 h-4" />
                        Import Settings
                        <input
                          type="file"
                          accept=".json"
                          onChange={importSettings}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* About */}
          {activeSection === "about" && (
            <div className="glass-card p-6 space-y-6">
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                  <Database className="w-10 h-10 theme-text-primary" />
                </div>
                <h2 className="text-2xl font-bold theme-text-primary mb-2">
                  Inverse Dependency Platform
                </h2>
                <p className="theme-text-muted">
                  Real-time dependency analysis and impact assessment
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl theme-inner-card text-center">
                  <p className="text-2xl font-bold text-primary-400">{APP_INFO.version}</p>
                  <p className="text-xs theme-text-muted">App Version</p>
                </div>
                <div className="p-4 rounded-xl theme-inner-card text-center">
                  <p className="text-lg font-semibold theme-text-primary">{APP_INFO.buildDate}</p>
                  <p className="text-xs theme-text-muted">Build Date</p>
                </div>
                <div className="p-4 rounded-xl theme-inner-card text-center">
                  <p className="text-lg font-semibold theme-text-primary">Next.js {APP_INFO.nextVersion}</p>
                  <p className="text-xs theme-text-muted">Framework</p>
                </div>
                <div className="p-4 rounded-xl theme-inner-card text-center">
                  <p className="text-lg font-semibold theme-text-primary">React {APP_INFO.reactVersion}</p>
                  <p className="text-xs theme-text-muted">UI Library</p>
                </div>
              </div>

              <div className="flex justify-center gap-4 pt-4">
                <a 
                  href="https://github.com" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 theme-text-muted theme-hover-text transition-colors"
                >
                  <Github className="w-5 h-5" />
                  GitHub
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="theme-text-faint">|</span>
                <span className="flex items-center gap-1 theme-text-muted">
                  Made with <Heart className="w-4 h-4 text-danger" /> by the IDP Team
                </span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

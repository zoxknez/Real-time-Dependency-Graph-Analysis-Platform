"use client";

import { useSubscription } from "@apollo/client/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIVE_PACKAGE_ACTIVITY,
  BREAKING_CHANGE_DETECTED,
  LIVE_STATS,
  WATCH_PACKAGES,
  DEPENDENCY_GRAPH_UPDATES,
  DEPENDENCY_IMPACT,
} from "@/lib/graphql/queries";
import type {
  LivePackageEvent,
  BreakingChangeEvent,
  LiveStats,
  WatchedPackageEvent,
  DependencyGraphUpdate,
  DependencyImpactEvent,
  Ecosystem,
  EventType,
  BreakingSeverity,
  VersionEvent,
  NewVersionVariables,
  BreakingChangeVariables,
  WatchPackagesVariables,
} from "@/lib/graphql/types";

const LIVE_INGESTION_ENABLED = process.env.NEXT_PUBLIC_LIVE_INGESTION_ENABLED === "true";

function versionEventToLivePackageEvent(event: VersionEvent): LivePackageEvent {
  return {
    id: event.meta.eventId,
    type: "PUBLISH",
    timestamp: event.meta.occurredAt,
    package: event.package,
    version: event.version.version,
    metadata: {
      isPrerelease: event.version.version.includes("-"),
    },
  };
}

function versionEventToWatchedPackageEvent(event: VersionEvent): WatchedPackageEvent {
  return {
    id: event.meta.eventId,
    event: "PUBLISH",
    package: event.package,
    version: event.version.version,
    timestamp: event.meta.occurredAt,
  };
}

function impactEventToGraphUpdate(event: DependencyImpactEvent): DependencyGraphUpdate {
  return {
    type: "UPDATE",
    affectedPackage: event.package,
    newVersion: event.version,
    timestamp: event.timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════
// LIVE PACKAGE ACTIVITY HOOK
// ═══════════════════════════════════════════════════════════════

interface UseLivePackageActivityOptions {
  ecosystems?: Ecosystem[];
  eventTypes?: EventType[];
  maxEvents?: number;
  paused?: boolean;
  onEvent?: (event: LivePackageEvent) => void;
}

export function useLivePackageActivity(options: UseLivePackageActivityOptions = {}) {
  const { 
    ecosystems, 
    eventTypes, 
    maxEvents = 100, 
    paused = false,
    onEvent,
  } = options;
  
  const [events, setEvents] = useState<LivePackageEvent[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    byEcosystem: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    eventsPerMinute: 0,
  });
  const startTimeRef = useRef(Date.now());
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const ecosystem = ecosystems?.[0];
  const skipForEventType = eventTypes?.length ? !eventTypes.includes("PUBLISH") : false;

  const { data: _data, loading, error } = useSubscription<
    { livePackageActivity: VersionEvent },
    NewVersionVariables
  >(LIVE_PACKAGE_ACTIVITY, {
    variables: { ecosystem },
    skip: paused || skipForEventType || !LIVE_INGESTION_ENABLED,
    shouldResubscribe: true,
    onData: ({ data }) => {
      const versionEvent = data.data?.livePackageActivity;
      const event = versionEvent ? versionEventToLivePackageEvent(versionEvent) : null;
      if (event) {
        setEvents((prev) => {
          const updated = [event, ...prev].slice(0, maxEvents);
          return updated;
        });
        
        // Update stats
        setStats((prev) => {
          const elapsed = Math.max(1, (Date.now() - startTimeRef.current) / 60000);
          return {
            total: prev.total + 1,
            byEcosystem: {
              ...prev.byEcosystem,
              [event.package.ecosystem]: (prev.byEcosystem[event.package.ecosystem] || 0) + 1,
            },
            byType: {
              ...prev.byType,
              [event.type]: (prev.byType[event.type] || 0) + 1,
            },
            eventsPerMinute: Math.round(((prev.total + 1) / elapsed) * 10) / 10,
          };
        });

        // Callback
        onEventRef.current?.(event);
      }
    },
  });

  const clearEvents = useCallback(() => {
    setEvents([]);
    setStats({
      total: 0,
      byEcosystem: {},
      byType: {},
      eventsPerMinute: 0,
    });
    startTimeRef.current = Date.now();
  }, []);

  return {
    events,
    stats,
    loading,
    error,
    clearEvents,
    latestEvent: events[0] ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// BREAKING CHANGE DETECTION HOOK
// ═══════════════════════════════════════════════════════════════

interface UseBreakingChangesOptions {
  ecosystem?: Ecosystem;
  packageId?: string;
  minSeverity?: BreakingSeverity;
  paused?: boolean;
  onBreakingChange?: (event: BreakingChangeEvent) => void;
}

export function useBreakingChanges(options: UseBreakingChangesOptions = {}) {
  const { 
    ecosystem, 
    packageId,
    minSeverity, 
    paused = false,
    onBreakingChange,
  } = options;
  
  const [breakingChanges, setBreakingChanges] = useState<BreakingChangeEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const onBreakingChangeRef = useRef(onBreakingChange);
  onBreakingChangeRef.current = onBreakingChange;

  const { data: _data, loading, error } = useSubscription<
    { breakingChangeDetected: BreakingChangeEvent },
    BreakingChangeVariables
  >(BREAKING_CHANGE_DETECTED, {
    variables: { ecosystem, packageId, minSeverity },
    skip: paused || !LIVE_INGESTION_ENABLED,
    shouldResubscribe: true,
    onData: ({ data }) => {
      const event = data.data?.breakingChangeDetected;
      if (event) {
        setBreakingChanges((prev) => [event, ...prev].slice(0, 50));
        setUnreadCount((prev) => prev + 1);
        onBreakingChangeRef.current?.(event);
      }
    },
  });

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const dismissChange = useCallback((packageName: string, version: string) => {
    setBreakingChanges((prev) => prev.filter((bc) => 
      !(bc.package.name === packageName && bc.toVersion === version)
    ));
  }, []);

  return {
    breakingChanges,
    unreadCount,
    loading,
    error,
    markAllRead,
    dismissChange,
    latestBreakingChange: breakingChanges[0] ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// LIVE STATS HOOK
// ═══════════════════════════════════════════════════════════════

interface UseLiveStatsOptions {
  paused?: boolean;
}

export function useLiveStats(options: UseLiveStatsOptions = {}) {
  const { paused = false } = options;
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [history, setHistory] = useState<LiveStats[]>([]);

  const { data: _data, loading, error } = useSubscription<{ liveStats: LiveStats }>(
    LIVE_STATS,
    {
      skip: paused || !LIVE_INGESTION_ENABLED,
      shouldResubscribe: true,
      onData: ({ data }) => {
        const newStats = data.data?.liveStats;
        if (newStats) {
          setStats(newStats);
          // Keep last 60 stats for charting (1 per minute = 1 hour)
          setHistory((prev) => [...prev, newStats].slice(-60));
        }
      },
    }
  );

  return {
    stats,
    history,
    loading,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEPENDENCY IMPACT HOOK
// ═══════════════════════════════════════════════════════════════

interface UseDependencyImpactOptions {
  ecosystem?: Ecosystem;
  minImpactScore?: number;
  paused?: boolean;
  onImpact?: (event: DependencyImpactEvent) => void;
}

export function useDependencyImpact(options: UseDependencyImpactOptions = {}) {
  const { ecosystem, minImpactScore, paused = false, onImpact } = options;
  const [impacts, setImpacts] = useState<DependencyImpactEvent[]>([]);
  const onImpactRef = useRef(onImpact);
  onImpactRef.current = onImpact;

  const { data: _data, loading, error } = useSubscription<
    { dependencyImpact: DependencyImpactEvent }
  >(DEPENDENCY_IMPACT, {
    variables: { ecosystem, minImpactScore },
    skip: paused || !LIVE_INGESTION_ENABLED,
    shouldResubscribe: true,
    onData: ({ data }) => {
      const event = data.data?.dependencyImpact;
      if (event) {
        setImpacts((prev) => [event, ...prev].slice(0, 50));
        onImpactRef.current?.(event);
      }
    },
  });

  const clearImpacts = useCallback(() => {
    setImpacts([]);
  }, []);

  return {
    impacts,
    loading,
    error,
    clearImpacts,
    latestImpact: impacts[0] ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// WATCH PACKAGES HOOK
// ═══════════════════════════════════════════════════════════════

interface UseWatchPackagesOptions {
  packageIds: string[];
  paused?: boolean;
  onUpdate?: (event: WatchedPackageEvent) => void;
}

export function useWatchPackages(options: UseWatchPackagesOptions) {
  const { packageIds, paused = false, onUpdate } = options;
  const [updates, setUpdates] = useState<WatchedPackageEvent[]>([]);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const activePackageId = packageIds[0];

  const { data: _data, loading, error } = useSubscription<
    { watchPackages: VersionEvent },
    WatchPackagesVariables
  >(WATCH_PACKAGES, {
    variables: { packageId: activePackageId },
    skip: paused || !activePackageId || !LIVE_INGESTION_ENABLED,
    shouldResubscribe: true,
    onData: ({ data }) => {
      const versionEvent = data.data?.watchPackages;
      const event = versionEvent ? versionEventToWatchedPackageEvent(versionEvent) : null;
      if (event) {
        setUpdates((prev) => [event, ...prev].slice(0, 100));
        onUpdateRef.current?.(event);
      }
    },
  });

  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  return {
    updates,
    loading,
    error,
    clearUpdates,
    latestUpdate: updates[0] ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEPENDENCY GRAPH UPDATES HOOK
// ═══════════════════════════════════════════════════════════════

interface UseDependencyGraphUpdatesOptions {
  rootPackageId: string;
  maxDepth?: number;
  paused?: boolean;
  onUpdate?: (update: DependencyGraphUpdate) => void;
}

export function useDependencyGraphUpdates(options: UseDependencyGraphUpdatesOptions) {
  const { rootPackageId, paused = false, onUpdate } = options;
  const [updates, setUpdates] = useState<DependencyGraphUpdate[]>([]);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const { data: _data, loading, error } = useSubscription<
    { dependencyGraphUpdate: DependencyImpactEvent },
    { minImpactScore?: number }
  >(DEPENDENCY_GRAPH_UPDATES, {
    variables: { minImpactScore: 0 },
    skip: paused || !rootPackageId || !LIVE_INGESTION_ENABLED,
    shouldResubscribe: true,
    onData: ({ data }) => {
      const impactEvent = data.data?.dependencyGraphUpdate;
      if (impactEvent && impactEvent.package.id !== rootPackageId) {
        return;
      }

      const update = impactEvent ? impactEventToGraphUpdate(impactEvent) : null;
      if (update) {
        setUpdates((prev) => [update, ...prev].slice(0, 50));
        onUpdateRef.current?.(update);
      }
    },
  });

  return {
    updates,
    loading,
    error,
    latestUpdate: updates[0] ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION STATUS HOOK
// ═══════════════════════════════════════════════════════════════

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ConnectionStatus>;
      setStatus(customEvent.detail);
    };
    
    window.addEventListener("ws-status", handler);
    return () => window.removeEventListener("ws-status", handler);
  }, []);

  return status;
}

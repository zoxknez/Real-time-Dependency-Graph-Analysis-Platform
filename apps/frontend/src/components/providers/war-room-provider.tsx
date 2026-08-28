"use client";

/**
 * War Room React Provider & Custom Hooks
 *
 * Integrates the canonical War Room runtime with React and Apollo Client (Section 8, 9, 10, 11, 12, WMCP-2C).
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useApolloClient } from "@apollo/client/react";
import { useStore } from "zustand";
import {
  WarRoomState,
  createWarRoomStore,
  createWarRoomStatePort,
  WarRoomStoreInstance,
  WarRoomStatePort,
  createWarRoomActions,
  WarRoomActions,
  WarRoomInvocationContext,
  createGraphProjectionStore,
  WarRoomGraphProjectionStore,
  WarRoomGraphProjection,
  createPublicWorkspaceSecurityContextPort,
  createPublicWorkspaceAuthorizationPort,
  createApolloPackageCatalogPort,
  createApolloGraphQueryPort,
  createUnavailableScenarioAnalysisPort,
  createUnavailableMigrationPlanningPort,
  WarRoomApolloClient,
} from "@/lib/war-room";

interface WarRoomRuntime {
  readonly store: WarRoomStoreInstance;
  readonly statePort: WarRoomStatePort;
  readonly actions: WarRoomActions;
  readonly projectionStore: WarRoomGraphProjectionStore;
}

const WarRoomContext = createContext<WarRoomRuntime | null>(null);

export interface WarRoomProviderProps {
  readonly children: React.ReactNode;
  readonly initialRuntime?: WarRoomRuntime;
}

export function WarRoomProvider({ children, initialRuntime }: WarRoomProviderProps) {
  const apolloClient = useApolloClient();

  // Create runtime instance once per provider mount (memoized / persistent across renders)
  const runtimeRef = useRef<WarRoomRuntime | null>(null);

  if (!runtimeRef.current) {
    if (initialRuntime) {
      runtimeRef.current = initialRuntime;
    } else {
      const store = createWarRoomStore();
      const statePort = createWarRoomStatePort(store);
      const projectionStore = createGraphProjectionStore();
      const securityContextPort = createPublicWorkspaceSecurityContextPort();
      const authorizationPort = createPublicWorkspaceAuthorizationPort();
      const client = apolloClient as unknown as WarRoomApolloClient;
      const packageCatalogPort = createApolloPackageCatalogPort(client);
      const graphQueryPort = createApolloGraphQueryPort(client, projectionStore);
      const scenarioAnalysisPort = createUnavailableScenarioAnalysisPort();
      const migrationPlanningPort = createUnavailableMigrationPlanningPort();

      const actions = createWarRoomActions({
        statePort,
        securityContextPort,
        authorizationPort,
        packageCatalogPort,
        graphQueryPort,
        scenarioAnalysisPort,
        migrationPlanningPort,
      });

      runtimeRef.current = {
        store,
        statePort,
        actions,
        projectionStore,
      };
    }
  }

  const runtime = runtimeRef.current;

  // StrictMode-safe bootstrap initialization
  useEffect(() => {
    if (runtime.statePort.getState().phase === "BOOTSTRAP") {
      runtime.actions.initialize();
    }
  }, [runtime]);

  return (
    <WarRoomContext.Provider value={runtime}>
      {children}
    </WarRoomContext.Provider>
  );
}

export function useWarRoomContext(): WarRoomRuntime {
  const context = useContext(WarRoomContext);
  if (!context) {
    throw new Error("useWarRoomContext must be used within a WarRoomProvider");
  }
  return context;
}

export function useWarRoomSelector<T>(selector: (state: WarRoomState) => T): T {
  const { store } = useWarRoomContext();
  return useStore(store, (s) => selector(s.canonical));
}

export function useWarRoomActions(): WarRoomActions {
  const { actions } = useWarRoomContext();
  return actions;
}

/**
 * Human invocation factory hook.
 * Reads the latest contextRevision from statePort AT CALL TIME.
 */
export function useHumanWarRoomInvocation() {
  const { statePort } = useWarRoomContext();

  return useMemo(() => {
    return (signal?: AbortSignal): WarRoomInvocationContext => ({
      channel: "HUMAN",
      capturedContextRevision: statePort.getState().contextRevision,
      signal,
    });
  }, [statePort]);
}

/**
 * Hook to observe the active graph render projection matching the canonical graph ID.
 */
export function useWarRoomGraphProjection(): WarRoomGraphProjection | null {
  const { projectionStore } = useWarRoomContext();
  const graphId = useWarRoomSelector((s) => (s.phase !== "BOOTSTRAP" && s.phase !== "IDLE" ? s.graph.id : null));

  return useSyncExternalStore(
    projectionStore.subscribe,
    () => (graphId ? projectionStore.getProjection(graphId) : null),
    () => null
  );
}

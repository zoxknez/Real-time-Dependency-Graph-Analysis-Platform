/**
 * WebMCP Live Adaptive Registration Session (WMCP-4D)
 *
 * Orchestrates live dynamic tool registration against browser modelContext by subscribing
 * to the canonical WarRoomStatePort, deriving registrable surfaces, and reconciling via
 * the hardened single-owner lifecycle manager (WMCP-4A) using executable definitions (WMCP-4C).
 *
 * Follows INV-WMCP4D-001 through INV-WMCP4D-017.
 */

import { WarRoomStatePort } from "../../war-room/state/store";
import { WarRoomActions } from "../../war-room/application/actions";
import { WarRoomGraphProjectionStore } from "../../war-room/integration/graph-projection";
import {
  WebMcpPlatformAdapter,
} from "../platform/types";
import {
  WebMcpReconciliationResult,
  WebMcpCapabilityState,
  WebMcpRegistrationOwner,
} from "../lifecycle/types";
import { deriveDesiredToolSurface } from "../lifecycle/surface";
import { createWebMcpRegistrationOwner } from "../lifecycle/lifecycle-owner";
import { createAdaptiveToolDefinition } from "./adaptive-tools";
import { deriveRegistrableToolSurface } from "./registrable-surface";

export interface LiveAdaptiveRegistrationContext {
  readonly statePort: WarRoomStatePort;
  readonly actions: WarRoomActions;
  readonly projectionStore?: WarRoomGraphProjectionStore;
  readonly platformAdapter: WebMcpPlatformAdapter;
}

export interface LiveAdaptiveRegistrationSession {
  start(): Promise<WebMcpReconciliationResult>;
  dispose(): void;
}

/**
 * Creates a live adaptive registration session bound to the provided War Room runtime.
 *
 * - Exactly one registration owner per session lifetime.
 * - Subscribes to canonical state before reading the initial snapshot.
 * - Reconciles dynamically on every state transition.
 * - Re-samples platform availability on each reconciliation cycle.
 * - Filters deferred tools before calling the factory to ensure 0 deferred factory exceptions.
 * - Completely disposes registrations and state listeners on session cleanup.
 */
export function createLiveAdaptiveRegistrationSession(
  context: LiveAdaptiveRegistrationContext
): LiveAdaptiveRegistrationSession {
  const { statePort, actions, projectionStore, platformAdapter } = context;

  const owner: WebMcpRegistrationOwner = createWebMcpRegistrationOwner(platformAdapter);
  let isDisposed = false;
  let stateUnsub: (() => void) | null = null;

  const adaptiveToolContext = {
    statePort,
    actions,
    projectionStore,
    platformAdapter,
  };

  async function reconcileCurrentState(): Promise<WebMcpReconciliationResult> {
    if (isDisposed) {
      return {
        registered: [],
        retained: [],
        removed: [],
        errors: { owner: "Session has been disposed" },
        activeSurface: new Set(),
      };
    }

    const state = statePort.getState();
    const availability = platformAdapter.getSnapshot().availability;

    const capabilityState: WebMcpCapabilityState = {
      phase: state.phase,
      contextRevision: state.contextRevision,
      webMcpAvailability: availability,
    };

    const logicalSurface = deriveDesiredToolSurface(capabilityState);
    const registrableSurface = deriveRegistrableToolSurface(logicalSurface);

    try {
      return await owner.reconcile(registrableSurface, (toolName) =>
        createAdaptiveToolDefinition(toolName, adaptiveToolContext)
      );
    } catch {
      // Non-fatal: Progressive enhancement guarantees registration failure does not crash the session
      return {
        registered: [],
        retained: [],
        removed: [],
        errors: { reconcile: "Unexpected reconciliation failure" },
        activeSurface: new Set(),
      };
    }
  }

  return {
    async start(): Promise<WebMcpReconciliationResult> {
      if (isDisposed) {
        return {
          registered: [],
          retained: [],
          removed: [],
          errors: { owner: "Session is already disposed" },
          activeSurface: new Set(),
        };
      }

      // INV-WMCP4D-006: Subscribe before initial state snapshot to avoid missing concurrent transitions
      if (!stateUnsub) {
        stateUnsub = statePort.subscribe(() => {
          if (!isDisposed) {
            void reconcileCurrentState();
          }
        });
      }

      return reconcileCurrentState();
    },

    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;

      if (stateUnsub) {
        stateUnsub();
        stateUnsub = null;
      }

      owner.dispose();
    },
  };
}

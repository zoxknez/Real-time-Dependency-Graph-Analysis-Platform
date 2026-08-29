/**
 * WebMCP Registration Lifecycle Owner (WMCP-4A)
 *
 * Implements the authoritative single-owner lifecycle manager that reconciles
 * active browser registrations with desired tool surfaces using pinned upstream
 * AbortSignal lifetime semantics.
 * Follows INV-WMCP4-OWN-001..003, INV-WMCP4-LIFE-001..004, INV-WMCP4-CAP-001..002, INV-WMCP4-RACE-001.
 */

import { WebMcpPlatformAdapter, WebMcpPlatformToolDefinition } from "../platform/types";
import { computeReconciliationPlan } from "./reconciler";
import {
  WebMcpActionName,
  WebMcpDesiredSurface,
  WebMcpRegistrationEntry,
  WebMcpRegistrationOwner,
  WebMcpReconciliationResult,
} from "./types";

export function createWebMcpRegistrationOwner(
  platform: WebMcpPlatformAdapter
): WebMcpRegistrationOwner {
  const activeRegistrations = new Map<WebMcpActionName, WebMcpRegistrationEntry>();
  let isDisposed = false;
  let reconciliationSequence = 0;

  return {
    async reconcile(
      desired: WebMcpDesiredSurface,
      toolFactory: (name: WebMcpActionName) => WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>
    ): Promise<WebMcpReconciliationResult> {
      if (isDisposed) {
        return {
          registered: [],
          retained: [],
          removed: [],
          errors: { owner: "Lifecycle owner has been disposed" },
          activeSurface: new Set(),
        };
      }

      // Generation token to detect and prevent stale asynchronous reconciliation races
      reconciliationSequence++;
      const currentSequence = reconciliationSequence;

      // Capability check: if WebMCP is not available, dispose all active registrations
      if (!platform.isAvailable()) {
        const removedOnUnavailable: WebMcpActionName[] = [];
        for (const [name, entry] of activeRegistrations.entries()) {
          entry.abortController.abort();
          removedOnUnavailable.push(name);
        }
        activeRegistrations.clear();
        return {
          registered: [],
          retained: [],
          removed: removedOnUnavailable,
          errors: {},
          activeSurface: new Set(),
        };
      }

      const currentActiveNames = new Set<WebMcpActionName>(activeRegistrations.keys());
      const plan = computeReconciliationPlan(currentActiveNames, desired.toolNames);

      const removed: WebMcpActionName[] = [];
      const registered: WebMcpActionName[] = [];
      const retained: WebMcpActionName[] = [...plan.toRetain];
      const errors: Record<string, string> = {};

      // 1. Remove obsolete registrations by aborting individual registration signals
      for (const name of plan.toRemove) {
        const entry = activeRegistrations.get(name);
        if (entry) {
          entry.abortController.abort();
          activeRegistrations.delete(name);
          removed.push(name);
        }
      }

      // 2. Register newly desired tools
      for (const name of plan.toRegister) {
        // Guard against mid-flight disposal or newer reconciliation sequence
        if (isDisposed || currentSequence !== reconciliationSequence) {
          break;
        }

        const controller = new AbortController();
        const definition = toolFactory(name);

        try {
          const result = await platform.registerTool(definition, {
            signal: controller.signal,
          });

          // Check again if superseded or disposed while awaiting platform.registerTool
          if (isDisposed || currentSequence !== reconciliationSequence) {
            controller.abort();
            break;
          }

          if (result.ok) {
            activeRegistrations.set(name, {
              toolName: name,
              abortController: controller,
              registeredAtRevision: desired.contextRevision,
              definition,
            });
            registered.push(name);
          } else {
            controller.abort();
            errors[name] = result.error.message;
          }
        } catch (err: unknown) {
          controller.abort();
          errors[name] = err instanceof Error ? err.message : "Registration failed";
        }
      }

      return {
        registered,
        retained,
        removed,
        errors,
        activeSurface: new Set(activeRegistrations.keys()),
      };
    },

    getActiveRegistrations(): ReadonlySet<WebMcpActionName> {
      return new Set(activeRegistrations.keys());
    },

    isDisposed(): boolean {
      return isDisposed;
    },

    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;

      for (const entry of activeRegistrations.values()) {
        if (!entry.abortController.signal.aborted) {
          entry.abortController.abort();
        }
      }
      activeRegistrations.clear();
    },
  };
}

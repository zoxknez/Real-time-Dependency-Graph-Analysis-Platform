/**
 * WebMCP Registration Lifecycle Owner (WMCP-4A / WMCP-4A-R2)
 *
 * Implements the authoritative single-owner lifecycle manager that reconciles
 * active and pending browser registrations with desired tool surfaces using pinned
 * upstream AbortSignal lifetime semantics.
 * Follows INV-WMCP4-OWN-001..003, INV-WMCP4-LIFE-001..005, INV-WMCP4-CAP-001..003,
 * INV-WMCP4-RACE-001..003.
 */

import {
  WebMcpPlatformAdapter,
  WebMcpPlatformRegistrationResult,
  WebMcpPlatformToolDefinition,
} from "../platform/types";
import {
  WebMcpActionName,
  WebMcpDesiredSurface,
  WebMcpRegistrationEntry,
  WebMcpRegistrationOwner,
  WebMcpReconciliationResult,
} from "./types";

interface PendingRegistrationEntry {
  readonly toolName: WebMcpActionName;
  readonly abortController: AbortController;
  readonly definition: WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>;
  readonly promise: Promise<WebMcpPlatformRegistrationResult>;
  contextRevision: number;
}

export function createWebMcpRegistrationOwner(
  platform: WebMcpPlatformAdapter
): WebMcpRegistrationOwner {
  const activeRegistrations = new Map<WebMcpActionName, WebMcpRegistrationEntry>();
  const pendingRegistrations = new Map<WebMcpActionName, PendingRegistrationEntry>();
  let isDisposed = false;
  let latestDesiredSurface: WebMcpDesiredSurface | null = null;

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

      latestDesiredSurface = desired;

      // Capability check: if WebMCP is unavailable, clean both active and pending registrations
      if (!platform.isAvailable()) {
        const removedOnUnavailable: WebMcpActionName[] = [];
        for (const [name, entry] of activeRegistrations.entries()) {
          entry.abortController.abort();
          removedOnUnavailable.push(name);
        }
        activeRegistrations.clear();

        for (const [, entry] of pendingRegistrations.entries()) {
          entry.abortController.abort();
        }
        pendingRegistrations.clear();

        return {
          registered: [],
          retained: [],
          removed: removedOnUnavailable,
          errors: {},
          activeSurface: new Set(),
        };
      }

      const removed: WebMcpActionName[] = [];
      const retained: WebMcpActionName[] = [];
      const newlyInitiated: WebMcpActionName[] = [];
      const adoptedPending: WebMcpActionName[] = [];
      const errors: Record<string, string> = {};

      // 1. Remove active registrations that are no longer desired
      for (const [name, entry] of activeRegistrations.entries()) {
        if (!desired.toolNames.has(name)) {
          entry.abortController.abort();
          activeRegistrations.delete(name);
          removed.push(name);
        } else {
          retained.push(name);
        }
      }

      // 2. Abort pending registrations that are no longer desired
      for (const [name, entry] of pendingRegistrations.entries()) {
        if (!desired.toolNames.has(name)) {
          entry.abortController.abort();
          pendingRegistrations.delete(name);
        }
      }

      // 3. Process desired tools: adopt existing pending or initiate new single-flight registration
      const flightPromises: Promise<{ name: WebMcpActionName; result: WebMcpPlatformRegistrationResult } | null>[] = [];

      for (const name of desired.toolNames) {
        if (activeRegistrations.has(name)) {
          // Already active and retained
          continue;
        }

        const existingPending = pendingRegistrations.get(name);
        if (existingPending) {
          // INV-WMCP4-RACE-002 & INV-WMCP4-RACE-003: Adopt/reuse existing in-flight registration
          existingPending.contextRevision = desired.contextRevision;
          adoptedPending.push(name);
          flightPromises.push(
            existingPending.promise
              .then((res) => ({ name, result: res }))
              .catch((err) => ({
                name,
                result: {
                  ok: false,
                  error: {
                    code: "REGISTRATION_FAILED",
                    message: err instanceof Error ? err.message : "Registration failed",
                  },
                } as WebMcpPlatformRegistrationResult,
              }))
          );
          continue;
        }

        // New single-flight registration
        const controller = new AbortController();
        const definition = toolFactory(name);
        const registerPromise = platform.registerTool(definition, {
          signal: controller.signal,
        });

        const pendingEntry: PendingRegistrationEntry = {
          toolName: name,
          abortController: controller,
          definition,
          promise: registerPromise,
          contextRevision: desired.contextRevision,
        };

        pendingRegistrations.set(name, pendingEntry);
        newlyInitiated.push(name);

        // Attach settlement handler to manage state transition and promotion
        registerPromise
          .then(
            (result) => {
              const current = pendingRegistrations.get(name);
              if (current?.promise === registerPromise) {
                pendingRegistrations.delete(name);
              }

              // Check promotion validity against authoritative latest desired intent
              if (
                !isDisposed &&
                !controller.signal.aborted &&
                platform.isAvailable() &&
                latestDesiredSurface?.toolNames.has(name)
              ) {
                if (result.ok) {
                  activeRegistrations.set(name, {
                    toolName: name,
                    abortController: controller,
                    registeredAtRevision: latestDesiredSurface.contextRevision,
                    definition,
                  });
                } else {
                  controller.abort();
                }
              } else {
                if (!controller.signal.aborted) {
                  controller.abort();
                }
              }
            },
            () => {
              const current = pendingRegistrations.get(name);
              if (current?.promise === registerPromise) {
                pendingRegistrations.delete(name);
              }
              if (!controller.signal.aborted) {
                controller.abort();
              }
            }
          );

        flightPromises.push(
          registerPromise
            .then((res) => ({ name, result: res }))
            .catch((err) => ({
              name,
              result: {
                ok: false,
                error: {
                  code: "REGISTRATION_FAILED",
                  message: err instanceof Error ? err.message : "Registration failed",
                },
              } as WebMcpPlatformRegistrationResult,
            }))
        );
      }

      // Await all in-flight promises relevant to this desired surface
      if (flightPromises.length > 0) {
        const settled = await Promise.all(flightPromises);
        for (const item of settled) {
          if (!item) continue;
          if (!item.result.ok) {
            errors[item.name] = item.result.error.message;
          }
        }
      }

      const registered: WebMcpActionName[] = [];
      for (const name of desired.toolNames) {
        if (activeRegistrations.has(name) && !retained.includes(name)) {
          registered.push(name);
        }
      }

      return {
        registered: registered.sort(),
        retained: retained.sort(),
        removed: removed.sort(),
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
      latestDesiredSurface = null;

      for (const entry of activeRegistrations.values()) {
        if (!entry.abortController.signal.aborted) {
          entry.abortController.abort();
        }
      }
      activeRegistrations.clear();

      for (const entry of pendingRegistrations.values()) {
        if (!entry.abortController.signal.aborted) {
          entry.abortController.abort();
        }
      }
      pendingRegistrations.clear();
    },
  };
}

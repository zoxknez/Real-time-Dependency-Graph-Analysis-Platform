/**
 * WebMCP Primitive Registration Session (WMCP-3B)
 *
 * Manages the registration lifecycle of the static two-tool primitive set (`search_packages`
 * and `open_package_graph`) using a single shared registration AbortController,
 * ensuring complete rollback upon partial registration failure and clean unregistration on dispose.
 */

import {
  WebMcpPlatformAdapter,
  WebMcpPlatformToolDefinition,
} from "../platform/types";

export interface PrimitiveWebMcpRegistrationSession {
  start(): Promise<{ ok: boolean }>;
  dispose(): void;
}

export function createPrimitiveWebMcpRegistrationSession(
  platform: WebMcpPlatformAdapter,
  tools: readonly [
    WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>,
    WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>
  ]
): PrimitiveWebMcpRegistrationSession {
  const registrationController = new AbortController();
  let startPromise: Promise<{ ok: boolean }> | null = null;
  let isDisposed = false;

  return {
    async start(): Promise<{ ok: boolean }> {
      if (startPromise) {
        return startPromise;
      }

      startPromise = (async () => {
        if (isDisposed || registrationController.signal.aborted) {
          return { ok: false };
        }

        if (!platform.isAvailable()) {
          return { ok: false };
        }

        const [tool1, tool2] = tools;

        // 1. Register search_packages
        const res1 = await platform.registerTool(tool1, {
          signal: registrationController.signal,
        });

        if (!res1.ok || isDisposed || registrationController.signal.aborted) {
          registrationController.abort();
          return { ok: false };
        }

        // 2. Register open_package_graph
        const res2 = await platform.registerTool(tool2, {
          signal: registrationController.signal,
        });

        if (!res2.ok || isDisposed || registrationController.signal.aborted) {
          // Partial registration rollback: aborting shared controller unregisters tool1
          registrationController.abort();
          return { ok: false };
        }

        return { ok: true };
      })();

      return startPromise;
    },

    dispose(): void {
      isDisposed = true;
      if (!registrationController.signal.aborted) {
        registrationController.abort();
      }
    },
  };
}

/**
 * Browser WebMCP Platform Adapter Implementation (WMCP-3A)
 *
 * Implements lazy, SSR-safe feature detection of document.modelContext without
 * module-scope DOM evaluation or side-effectful tool registration.
 */

import {
  WebMcpAvailability,
  WebMcpPlatformAdapter,
  WebMcpPlatformSnapshot,
} from "./types";

export interface BrowserWebMcpPlatformAdapterOptions {
  /**
   * Optional custom global scope for deterministic testing and dependency injection.
   * If omitted, defaults lazily to `globalThis`.
   */
  readonly customGlobal?: unknown;
}

interface TargetGlobalScope {
  readonly document?: {
    readonly modelContext?: {
      readonly registerTool?: unknown;
      readonly getTools?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  readonly isSecureContext?: unknown;
  readonly window?: unknown;
  [key: string]: unknown;
}

export function createBrowserWebMcpPlatformAdapter(
  options: BrowserWebMcpPlatformAdapterOptions = {}
): WebMcpPlatformAdapter {
  function getGlobalScope(): TargetGlobalScope {
    if (options.customGlobal !== undefined && options.customGlobal !== null) {
      return options.customGlobal as unknown as TargetGlobalScope;
    }
    if (typeof globalThis !== "undefined") {
      return globalThis as unknown as TargetGlobalScope;
    }
    return {};
  }

  function detect(): {
    availability: WebMcpAvailability;
    hasDocument: boolean;
    hasModelContext: boolean;
    secureContext: boolean | null;
  } {
    const scope = getGlobalScope();
    const doc = scope.document;
    const hasDocument = typeof doc === "object" && doc !== null;

    let secureContext: boolean | null = null;
    if (typeof scope.isSecureContext === "boolean") {
      secureContext = scope.isSecureContext;
    }

    if (!hasDocument) {
      return {
        availability: "UNAVAILABLE",
        hasDocument: false,
        hasModelContext: false,
        secureContext,
      };
    }

    const modelContext = doc.modelContext;
    const hasModelContext =
      typeof modelContext === "object" && modelContext !== null;

    if (!hasModelContext) {
      return {
        availability: "UNAVAILABLE",
        hasDocument: true,
        hasModelContext: false,
        secureContext,
      };
    }

    const isRegisterToolFunction =
      typeof modelContext.registerTool === "function";
    const isGetToolsFunction = typeof modelContext.getTools === "function";

    // Standard draft detection requires both registerTool and getTools to be functions
    const isAvailable = isRegisterToolFunction && isGetToolsFunction;

    return {
      availability: isAvailable ? "AVAILABLE" : "UNAVAILABLE",
      hasDocument: true,
      hasModelContext: true,
      secureContext,
    };
  }

  return {
    getSnapshot(): WebMcpPlatformSnapshot {
      const { availability, hasDocument, hasModelContext, secureContext } =
        detect();

      return {
        availability,
        hasDocument,
        hasModelContext,
        secureContext,
      };
    },

    isAvailable(): boolean {
      return detect().availability === "AVAILABLE";
    },
  };
}

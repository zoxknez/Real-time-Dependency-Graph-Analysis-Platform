/**
 * Browser WebMCP Platform Adapter Implementation (WMCP-3A/3B)
 *
 * Implements lazy, SSR-safe feature detection and tool registration of document.modelContext
 * without module-scope DOM evaluation.
 */

import {
  WebMcpAvailability,
  WebMcpPlatformAdapter,
  WebMcpPlatformRegistrationOptions,
  WebMcpPlatformRegistrationResult,
  WebMcpPlatformSnapshot,
  WebMcpPlatformToolDefinition,
} from "./types";
import type {
  WebMcpBrowserTool,
  WebMcpBrowserToolExecuteOptions,
} from "../../../types/webmcp";

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
      readonly registerTool?: <
        TIn extends object = Record<string, unknown>,
        TOut = unknown
      >(
        tool: WebMcpBrowserTool<TIn, TOut>,
        options?: { signal?: AbortSignal; exposedTo?: readonly string[] }
      ) => Promise<void>;
      readonly getTools?: unknown;
      readonly executeTool?: unknown;
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

    async registerTool<
      TInput extends object = Record<string, unknown>,
      TOutput = unknown
    >(
      tool: WebMcpPlatformToolDefinition<TInput, TOutput>,
      registrationOptions?: WebMcpPlatformRegistrationOptions
    ): Promise<WebMcpPlatformRegistrationResult> {
      const { availability } = detect();
      if (availability !== "AVAILABLE") {
        return {
          ok: false,
          error: {
            code: "UNAVAILABLE",
            message: "WebMCP document.modelContext is unavailable",
          },
        };
      }

      if (registrationOptions?.signal?.aborted) {
        return {
          ok: false,
          error: {
            code: "CANCELLED",
            message: "Tool registration was cancelled",
          },
        };
      }

      const scope = getGlobalScope();
      const modelContext = scope.document?.modelContext;
      if (!modelContext || typeof modelContext.registerTool !== "function") {
        return {
          ok: false,
          error: {
            code: "UNAVAILABLE",
            message: "WebMCP document.modelContext is unavailable",
          },
        };
      }

      const browserTool: WebMcpBrowserTool<TInput, TOutput> = {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: async (
          input: TInput,
          execOptions: WebMcpBrowserToolExecuteOptions
        ): Promise<TOutput> => {
          return tool.execute(input, { signal: execOptions.signal });
        },
      };

      try {
        await modelContext.registerTool(browserTool, {
          signal: registrationOptions?.signal,
        });

        if (registrationOptions?.signal?.aborted) {
          return {
            ok: false,
            error: {
              code: "CANCELLED",
              message: "Tool registration was cancelled",
            },
          };
        }

        return { ok: true };
      } catch (err: unknown) {
        const isAbort =
          registrationOptions?.signal?.aborted ||
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            (err as { name?: string }).name === "AbortError");

        if (isAbort) {
          return {
            ok: false,
            error: {
              code: "CANCELLED",
              message: "Tool registration was cancelled",
            },
          };
        }

        return {
          ok: false,
          error: {
            code: "REGISTRATION_FAILED",
            message: "Tool registration failed",
          },
        };
      }
    },
  };
}

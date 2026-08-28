/**
 * WebMCP Platform Capability & Detection Types (WMCP-3A/3B)
 *
 * Plain serializable diagnostic types and platform adapter interfaces describing
 * browser WebMCP platform presence and tool registration without leaking raw DOM,
 * Window, ModelContext, or EventTarget instances.
 */

export type WebMcpAvailability = "AVAILABLE" | "UNAVAILABLE";

export interface WebMcpPlatformSnapshot {
  readonly availability: WebMcpAvailability;
  readonly hasDocument: boolean;
  readonly hasModelContext: boolean;
  readonly secureContext: boolean | null;
  readonly originAgentCluster?: boolean | null;
}

export interface WebMcpPlatformExecutionContext {
  readonly signal: AbortSignal;
}

export interface WebMcpPlatformToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

export interface WebMcpPlatformToolDefinition<
  TInput extends object = Record<string, unknown>,
  TOutput = unknown
> {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly annotations?: WebMcpPlatformToolAnnotations;
  readonly execute: (
    input: TInput,
    context: WebMcpPlatformExecutionContext
  ) => Promise<TOutput>;
}

export interface WebMcpPlatformRegistrationOptions {
  readonly signal?: AbortSignal;
}

export type WebMcpPlatformRegistrationErrorCode =
  | "UNAVAILABLE"
  | "CANCELLED"
  | "REGISTRATION_FAILED";

export type WebMcpPlatformRegistrationResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: WebMcpPlatformRegistrationErrorCode;
        readonly message: string;
      };
    };

export interface WebMcpPlatformAdapter {
  /**
   * Returns a plain, JSON-serializable diagnostic snapshot of current WebMCP platform capability.
   */
  getSnapshot(): WebMcpPlatformSnapshot;

  /**
   * Fast boolean check indicating whether a valid WebMCP document.modelContext surface is detected.
   */
  isAvailable(): boolean;

  /**
   * Registers a tool definition on the browser modelContext with registration-lifetime options.
   */
  registerTool<
    TInput extends object = Record<string, unknown>,
    TOutput = unknown
  >(
    tool: WebMcpPlatformToolDefinition<TInput, TOutput>,
    options?: WebMcpPlatformRegistrationOptions
  ): Promise<WebMcpPlatformRegistrationResult>;
}

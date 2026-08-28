/**
 * WebMCP Browser Compatibility Declarations (WMCP-3A)
 *
 * Conservative local type definitions based on the Web Machine Learning Community Group
 * WebMCP Draft Community Group Report (26 August 2026) and experimental Chrome documentation.
 *
 * NOTE: These are local application compatibility declarations, NOT a claim that WebMCP
 * is a finalized W3C standard or part of default lib.dom.
 */

export interface WebMcpBrowserToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

export interface WebMcpBrowserChromeExecutionContext {
  readonly signal?: AbortSignal;
}

export type WebMcpBrowserToolExecuteCallback<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  chromeExecutionContext?: WebMcpBrowserChromeExecutionContext
) => Promise<TOutput> | TOutput;

export interface WebMcpBrowserTool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly execute: WebMcpBrowserToolExecuteCallback<TInput, TOutput>;
  readonly annotations?: WebMcpBrowserToolAnnotations;
}

export interface WebMcpBrowserRegisteredTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly origin: string;
  readonly annotations?: WebMcpBrowserToolAnnotations;
}

export interface WebMcpBrowserRegisterOptions {
  readonly signal?: AbortSignal;
  readonly exposedTo?: readonly string[];
}

export interface WebMcpBrowserGetToolsOptions {
  readonly signal?: AbortSignal;
}

export interface WebMcpBrowserModelContext extends EventTarget {
  registerTool(
    tool: WebMcpBrowserTool<any, any>,
    options?: WebMcpBrowserRegisterOptions
  ): Promise<void> | void;

  getTools(
    options?: WebMcpBrowserGetToolsOptions
  ): Promise<readonly WebMcpBrowserRegisteredTool[]>;

  ontoolchange?: ((this: WebMcpBrowserModelContext, ev: Event) => any) | null;
}

declare global {
  interface Document {
    /**
     * Optional WebMCP ModelContext surface.
     * Present only in environments supporting the WebMCP Draft Community Group specification.
     */
    readonly modelContext?: WebMcpBrowserModelContext;
  }
}

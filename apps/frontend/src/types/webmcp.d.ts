/**
 * WebMCP Browser Compatibility Declarations (WMCP-3A-R1)
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
) => Promise<TOutput>;

export interface WebMcpBrowserTool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly execute: WebMcpBrowserToolExecuteCallback<TInput, TOutput>;
  readonly annotations?: WebMcpBrowserToolAnnotations;
}

/**
 * Safe metadata subset of RegisteredTool returned by getTools().
 * Note: Normative WebIDL RegisteredTool dictionary contains a `window` (Window) member.
 * We intentionally model a clean metadata subset to prevent leaking raw Window instances into application snapshots.
 * The `inputSchema` property in RegisteredTool is a serialized DOMString (string), distinct from the registration-time object.
 */
export interface WebMcpBrowserRegisteredToolMetadata {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: string;
  readonly origin: string;
  readonly annotations?: WebMcpBrowserToolAnnotations;
}

export interface WebMcpBrowserRegisterOptions {
  readonly signal?: AbortSignal;
  readonly exposedTo?: readonly string[];
}

export interface WebMcpBrowserGetToolsOptions {
  readonly fromOrigins?: readonly string[];
}

export interface WebMcpBrowserModelContext extends EventTarget {
  registerTool(
    tool: WebMcpBrowserTool<unknown, unknown>,
    options?: WebMcpBrowserRegisterOptions
  ): Promise<void>;

  getTools(
    options?: WebMcpBrowserGetToolsOptions
  ): Promise<readonly WebMcpBrowserRegisteredToolMetadata[]>;

  ontoolchange?: ((this: WebMcpBrowserModelContext, ev: Event) => any) | null;
}

declare global {
  interface Document {
    /**
     * Optional WebMCP ModelContext surface.
     * Note: In the normative WebMCP WebIDL specification, this attribute is declared as:
     * `[SecureContext, SameObject] readonly attribute ModelContext modelContext;`
     * It is intentionally declared optional (`?`) in our local TypeScript ambient environment
     * to support progressive enhancement and feature detection in browsers where WebMCP is absent.
     */
    readonly modelContext?: WebMcpBrowserModelContext;
  }
}

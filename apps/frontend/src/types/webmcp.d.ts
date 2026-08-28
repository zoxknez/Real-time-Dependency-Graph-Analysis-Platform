/**
 * WebMCP Browser Compatibility Declarations (WMCP-3A-R3)
 *
 * Conservative local type definitions aligned directly with upstream `webmachinelearning/webmcp`
 * repository main branch (commit: 41d12f057167ccf5954dbcf49d99502cb6c84491, 2026-08-28).
 *
 * NOTE: These are local application compatibility declarations, NOT a claim that WebMCP
 * is a finalized W3C standard or part of default lib.dom.
 */

export interface WebMcpBrowserToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

export interface WebMcpBrowserToolExecuteOptions {
  readonly signal: AbortSignal;
}

export type WebMcpBrowserToolExecuteCallback<
  TInput extends object = Record<string, unknown>,
  TOutput = unknown
> = (
  input: TInput,
  options: WebMcpBrowserToolExecuteOptions
) => Promise<TOutput>;

export interface WebMcpBrowserTool<
  TInput extends object = Record<string, unknown>,
  TOutput = unknown
> {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly execute: WebMcpBrowserToolExecuteCallback<TInput, TOutput>;
  readonly annotations?: WebMcpBrowserToolAnnotations;
}

/**
 * Normative RegisteredTool dictionary returned by getTools().
 * Corresponds to current upstream WebIDL:
 * dictionary RegisteredTool {
 *   DOMString name;
 *   DOMString? title;
 *   DOMString description;
 *   object inputSchema;
 *   Window window;
 *   USVString origin;
 *   ToolAnnotations? annotations;
 * };
 */
export interface WebMcpBrowserRegisteredTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly window: Window;
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

export interface WebMcpBrowserExecuteToolOptions {
  readonly signal?: AbortSignal;
}

export interface WebMcpBrowserModelContext extends EventTarget {
  registerTool<
    TInput extends object = Record<string, unknown>,
    TOutput = unknown
  >(
    tool: WebMcpBrowserTool<TInput, TOutput>,
    options?: WebMcpBrowserRegisterOptions
  ): Promise<void>;

  getTools(
    options?: WebMcpBrowserGetToolsOptions
  ): Promise<readonly WebMcpBrowserRegisteredTool[]>;

  executeTool(
    tool: WebMcpBrowserRegisteredTool,
    inputObject?: object,
    options?: WebMcpBrowserExecuteToolOptions
  ): Promise<string>;

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

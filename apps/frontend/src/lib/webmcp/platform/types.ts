/**
 * WebMCP Platform Capability & Detection Types (WMCP-3A)
 *
 * Plain serializable diagnostic types describing browser WebMCP platform presence
 * without leaking raw DOM, Window, ModelContext, or EventTarget instances.
 */

export type WebMcpAvailability = "AVAILABLE" | "UNAVAILABLE";

export interface WebMcpPlatformSnapshot {
  readonly availability: WebMcpAvailability;
  readonly hasDocument: boolean;
  readonly hasModelContext: boolean;
  readonly secureContext: boolean | null;
  readonly originAgentCluster?: boolean | null;
}

export interface WebMcpPlatformAdapter {
  /**
   * Returns a plain, JSON-serializable diagnostic snapshot of current WebMCP platform capability.
   */
  getSnapshot(): WebMcpPlatformSnapshot;

  /**
   * Fast boolean check indicating whether a valid WebMCP document.modelContext surface is detected.
   */
  isAvailable(): boolean;
}

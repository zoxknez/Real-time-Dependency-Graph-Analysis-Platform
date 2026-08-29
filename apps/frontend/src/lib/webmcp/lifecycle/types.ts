/**
 * WebMCP Adaptive Capability & Registration Lifecycle Types (WMCP-4A)
 *
 * Defines the contracts for state-derived desired tool surfaces, registration ownership,
 * reconciliation plans, and lifecycle management.
 * Follows WMCP-INV-001, WMCP-INV-013, WMCP-INV-014, WMCP-INV-015, WMCP-INV-016, WMCP-INV-019.
 */

import { WarRoomPhase } from "../../war-room/domain/types";
import {
  WebMcpAvailability,
  WebMcpPlatformToolDefinition,
} from "../platform/types";

/**
 * Standard WebMCP Action Identifiers across all War Room phases.
 * Follows locked state-to-tools mapping from WEBMCP-STATE-MACHINE.md.
 */
export type WebMcpActionName =
  | "search_packages"
  | "open_package_graph"
  | "summarize_graph"
  | "calculate_blast_radius"
  | "trace_dependency_path"
  | "focus_graph_nodes"
  | "inspect_selected_package"
  | "simulate_api_changes"
  | "inspect_scenario"
  | "set_scenario_priority"
  | "set_scenario_exclusion"
  | "recalculate_scenario"
  | "generate_migration_plan"
  | "inspect_critical_paths"
  | "inspect_migration_plan"
  | "focus_critical_path";

/**
 * Minimal snapshot of application capability state used for pure desired-surface derivation.
 */
export interface WebMcpCapabilityState {
  readonly phase: WarRoomPhase;
  readonly webMcpAvailability: WebMcpAvailability;
  readonly contextRevision: number;
  readonly selectedPackageId?: string | null;
  readonly activeScenarioId?: string | null;
  readonly hasHumanReview?: boolean;
  readonly hasMigrationPlan?: boolean;
}

/**
 * Pure descriptor of the desired WebMCP tool surface for an active capability state.
 */
export interface WebMcpDesiredSurface {
  readonly phase: WarRoomPhase;
  readonly contextRevision: number;
  readonly toolNames: ReadonlySet<WebMcpActionName>;
}

/**
 * Single registration entry managed by an authoritative lifecycle owner.
 */
export interface WebMcpRegistrationEntry {
  readonly toolName: WebMcpActionName;
  readonly abortController: AbortController;
  readonly registeredAtRevision: number;
  readonly definition: WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>;
}

/**
 * Reconciliation plan computed from comparing actual active tools vs desired tools.
 */
export interface WebMcpReconciliationPlan {
  readonly toRegister: readonly WebMcpActionName[];
  readonly toRetain: readonly WebMcpActionName[];
  readonly toRemove: readonly WebMcpActionName[];
}

/**
 * Result emitted by a reconciliation pass.
 */
export interface WebMcpReconciliationResult {
  readonly registered: readonly WebMcpActionName[];
  readonly retained: readonly WebMcpActionName[];
  readonly removed: readonly WebMcpActionName[];
  readonly errors: Readonly<Record<string, string>>;
  readonly activeSurface: ReadonlySet<WebMcpActionName>;
}

/**
 * Authoritative WebMCP registration lifecycle owner contract.
 */
export interface WebMcpRegistrationOwner {
  /**
   * Reconciles owned active registrations with the desired tool surface.
   * Idempotent: repeated calls with unchanged desired surface perform zero platform operations.
   */
  reconcile(
    desired: WebMcpDesiredSurface,
    toolFactory: (name: WebMcpActionName) => WebMcpPlatformToolDefinition<Record<string, unknown>, unknown>
  ): Promise<WebMcpReconciliationResult>;

  /**
   * Returns current active owned tool registrations.
   */
  getActiveRegistrations(): ReadonlySet<WebMcpActionName>;

  /**
   * Returns true if the lifecycle owner has been disposed.
   */
  isDisposed(): boolean;

  /**
   * Idempotently disposes all active owned registrations.
   */
  dispose(): void;
}

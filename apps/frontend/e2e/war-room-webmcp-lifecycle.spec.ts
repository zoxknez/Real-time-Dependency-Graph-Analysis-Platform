/**
 * WebMCP Adaptive Capability & Registration Lifecycle Tests (WMCP-4A)
 *
 * Validates state-derived tool surface mapping, reconciliation planning,
 * authoritative lifecycle ownership, idempotent disposal, capability loss handling,
 * and asynchronous sequence race safety.
 * Follows WMCP-INV-001, WMCP-INV-013, WMCP-INV-014, WMCP-INV-015, WMCP-INV-016, WMCP-INV-019.
 */

import { test, expect } from "@playwright/test";
import {
  computeReconciliationPlan,
  createWebMcpRegistrationOwner,
  deriveDesiredToolSurface,
  WebMcpActionName,
  WebMcpCapabilityState,
  WebMcpDesiredSurface,
  WebMcpPlatformAdapter,
  WebMcpPlatformRegistrationOptions,
  WebMcpPlatformRegistrationResult,
  WebMcpPlatformSnapshot,
  WebMcpPlatformToolDefinition,
} from "../src/lib/webmcp";
import { WarRoomPhase } from "../src/lib/war-room/domain/types";

function createMockPlatformAdapter(initialAvailable = true): WebMcpPlatformAdapter & {
  setAvailable(available: boolean): void;
  registeredTools: Map<string, { definition: WebMcpPlatformToolDefinition<any, any>; options?: WebMcpPlatformRegistrationOptions }>;
  registrationCallCount: number;
  failNextRegistration?: { code: "REGISTRATION_FAILED" | "UNAVAILABLE" | "CANCELLED"; message: string };
} {
  let isAvail = initialAvailable;
  const registeredTools = new Map<string, { definition: WebMcpPlatformToolDefinition<any, any>; options?: WebMcpPlatformRegistrationOptions }>();
  let registrationCallCount = 0;
  let failNext: { code: "REGISTRATION_FAILED" | "UNAVAILABLE" | "CANCELLED"; message: string } | undefined = undefined;

  return {
    registeredTools,
    get registrationCallCount() {
      return registrationCallCount;
    },
    get failNextRegistration() {
      return failNext;
    },
    set failNextRegistration(val) {
      failNext = val;
    },
    setAvailable(available: boolean) {
      isAvail = available;
    },
    getSnapshot(): WebMcpPlatformSnapshot {
      return {
        availability: isAvail ? "AVAILABLE" : "UNAVAILABLE",
        hasDocument: true,
        hasModelContext: isAvail,
        secureContext: true,
      };
    },
    isAvailable(): boolean {
      return isAvail;
    },
    async registerTool<TInput extends object = Record<string, unknown>, TOutput = unknown>(
      tool: WebMcpPlatformToolDefinition<TInput, TOutput>,
      options?: WebMcpPlatformRegistrationOptions
    ): Promise<WebMcpPlatformRegistrationResult> {
      registrationCallCount++;

      if (!isAvail) {
        return {
          ok: false,
          error: {
            code: "UNAVAILABLE",
            message: "WebMCP is unavailable",
          },
        };
      }

      if (options?.signal?.aborted) {
        return {
          ok: false,
          error: {
            code: "CANCELLED",
            message: "Registration signal already aborted",
          },
        };
      }

      if (failNext) {
        const error = failNext;
        failNext = undefined;
        return {
          ok: false,
          error,
        };
      }

      registeredTools.set(tool.name, { definition: tool, options });

      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          registeredTools.delete(tool.name);
        });
      }

      return { ok: true };
    },
  };
}

function createDummyTool(name: WebMcpActionName): WebMcpPlatformToolDefinition<Record<string, unknown>, unknown> {
  return {
    name,
    description: `Tool for ${name}`,
    inputSchema: { type: "object" },
    execute: async () => ({ executed: name }),
  };
}

test.describe("WebMCP Adaptive Capability & Registration Lifecycle (WMCP-4A)", () => {
  test.describe("1. Pure Desired Tool Surface Derivation", () => {
    test("deriveDesiredToolSurface returns exact tool sets for each canonical phase", () => {
      const phases: Record<WarRoomPhase, string[]> = {
        BOOTSTRAP: [],
        IDLE: ["search_packages", "open_package_graph"],
        GRAPH_READY: [
          "summarize_graph",
          "calculate_blast_radius",
          "trace_dependency_path",
          "focus_graph_nodes",
          "open_package_graph",
        ],
        NODE_SELECTED: [
          "inspect_selected_package",
          "calculate_blast_radius",
          "trace_dependency_path",
          "simulate_api_changes",
          "focus_graph_nodes",
        ],
        SIMULATION_READY: [
          "inspect_scenario",
          "calculate_blast_radius",
          "trace_dependency_path",
          "set_scenario_priority",
          "set_scenario_exclusion",
          "focus_graph_nodes",
        ],
        HUMAN_REVIEW: [
          "recalculate_scenario",
          "generate_migration_plan",
          "inspect_critical_paths",
          "set_scenario_priority",
        ],
        PLAN_READY: [
          "inspect_migration_plan",
          "recalculate_scenario",
          "focus_critical_path",
        ],
      };

      for (const [phaseStr, expectedTools] of Object.entries(phases)) {
        const phase = phaseStr as WarRoomPhase;
        const state: WebMcpCapabilityState = {
          phase,
          webMcpAvailability: "AVAILABLE",
          contextRevision: 1,
        };

        const surface = deriveDesiredToolSurface(state);
        expect(surface.phase).toBe(phase);
        expect(surface.contextRevision).toBe(1);
        expect(Array.from(surface.toolNames).sort()).toEqual(expectedTools.sort());
      }
    });

    test("deriveDesiredToolSurface returns empty surface when WebMCP is UNAVAILABLE", () => {
      const state: WebMcpCapabilityState = {
        phase: "GRAPH_READY",
        webMcpAvailability: "UNAVAILABLE",
        contextRevision: 5,
      };

      const surface = deriveDesiredToolSurface(state);
      expect(surface.phase).toBe("GRAPH_READY");
      expect(surface.contextRevision).toBe(5);
      expect(surface.toolNames.size).toBe(0);
    });

    test("deriveDesiredToolSurface is pure and deterministic across unrelated state mutations", () => {
      const baseState: WebMcpCapabilityState = {
        phase: "GRAPH_READY",
        webMcpAvailability: "AVAILABLE",
        contextRevision: 2,
        selectedPackageId: "npm:pkg-a",
      };

      const state1 = deriveDesiredToolSurface(baseState);
      const state2 = deriveDesiredToolSurface({
        ...baseState,
        contextRevision: 3,
        selectedPackageId: "npm:pkg-b", // unrelated selection while in GRAPH_READY
      });

      expect(Array.from(state1.toolNames).sort()).toEqual(Array.from(state2.toolNames).sort());
    });
  });

  test.describe("2. Pure Reconciliation Planner", () => {
    test("computes correct plan for empty -> desired", () => {
      const actual = new Set<WebMcpActionName>();
      const desired = new Set<WebMcpActionName>(["search_packages", "open_package_graph"]);

      const plan = computeReconciliationPlan(actual, desired);
      expect(plan.toRegister).toEqual(["open_package_graph", "search_packages"]);
      expect(plan.toRetain).toEqual([]);
      expect(plan.toRemove).toEqual([]);
    });

    test("computes correct plan for unchanged surface (idempotent)", () => {
      const actual = new Set<WebMcpActionName>(["search_packages", "open_package_graph"]);
      const desired = new Set<WebMcpActionName>(["search_packages", "open_package_graph"]);

      const plan = computeReconciliationPlan(actual, desired);
      expect(plan.toRegister).toEqual([]);
      expect(plan.toRetain).toEqual(["open_package_graph", "search_packages"]);
      expect(plan.toRemove).toEqual([]);
    });

    test("computes correct plan for partial addition (A -> A + B)", () => {
      const actual = new Set<WebMcpActionName>(["open_package_graph"]);
      const desired = new Set<WebMcpActionName>(["open_package_graph", "summarize_graph"]);

      const plan = computeReconciliationPlan(actual, desired);
      expect(plan.toRegister).toEqual(["summarize_graph"]);
      expect(plan.toRetain).toEqual(["open_package_graph"]);
      expect(plan.toRemove).toEqual([]);
    });

    test("computes correct plan for partial removal (A + B -> B)", () => {
      const actual = new Set<WebMcpActionName>(["open_package_graph", "search_packages"]);
      const desired = new Set<WebMcpActionName>(["open_package_graph"]);

      const plan = computeReconciliationPlan(actual, desired);
      expect(plan.toRegister).toEqual([]);
      expect(plan.toRetain).toEqual(["open_package_graph"]);
      expect(plan.toRemove).toEqual(["search_packages"]);
    });

    test("computes correct plan for complete removal (A + B -> empty)", () => {
      const actual = new Set<WebMcpActionName>(["open_package_graph", "search_packages"]);
      const desired = new Set<WebMcpActionName>();

      const plan = computeReconciliationPlan(actual, desired);
      expect(plan.toRegister).toEqual([]);
      expect(plan.toRetain).toEqual([]);
      expect(plan.toRemove).toEqual(["open_package_graph", "search_packages"]);
    });
  });

  test.describe("3. Authoritative Registration Lifecycle Owner", () => {
    test("initial reconcile registers tools and activates them", async () => {
      const platform = createMockPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      const desired: WebMcpDesiredSurface = {
        phase: "IDLE",
        contextRevision: 1,
        toolNames: new Set<WebMcpActionName>(["search_packages", "open_package_graph"]),
      };

      const result = await owner.reconcile(desired, createDummyTool);

      expect(result.registered.sort()).toEqual(["open_package_graph", "search_packages"]);
      expect(result.retained).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(result.errors).toEqual({});
      expect(Array.from(owner.getActiveRegistrations()).sort()).toEqual([
        "open_package_graph",
        "search_packages",
      ]);
      expect(platform.registeredTools.has("search_packages")).toBe(true);
      expect(platform.registeredTools.has("open_package_graph")).toBe(true);
    });

    test("repeated reconcile with unchanged surface performs zero additional platform calls (INV-WMCP4-LIFE-002)", async () => {
      const platform = createMockPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      const desired: WebMcpDesiredSurface = {
        phase: "IDLE",
        contextRevision: 1,
        toolNames: new Set<WebMcpActionName>(["search_packages", "open_package_graph"]),
      };

      await owner.reconcile(desired, createDummyTool);
      const callCountAfterFirst = platform.registrationCallCount;
      expect(callCountAfterFirst).toBe(2);

      const secondResult = await owner.reconcile(desired, createDummyTool);
      expect(secondResult.registered).toEqual([]);
      expect(secondResult.retained.sort()).toEqual(["open_package_graph", "search_packages"]);
      expect(secondResult.removed).toEqual([]);
      expect(platform.registrationCallCount).toBe(callCountAfterFirst);
    });

    test("phase transition adds new tools and disposes obsolete tools cleanly (INV-WMCP4-LIFE-001)", async () => {
      const platform = createMockPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      // Phase 1: IDLE -> search_packages, open_package_graph
      await owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 1,
          toolNames: new Set<WebMcpActionName>(["search_packages", "open_package_graph"]),
        },
        createDummyTool
      );

      // Phase 2: GRAPH_READY -> summarize_graph, calculate_blast_radius, trace_dependency_path, focus_graph_nodes, open_package_graph
      const graphReadyResult = await owner.reconcile(
        {
          phase: "GRAPH_READY",
          contextRevision: 2,
          toolNames: new Set<WebMcpActionName>([
            "summarize_graph",
            "calculate_blast_radius",
            "trace_dependency_path",
            "focus_graph_nodes",
            "open_package_graph",
          ]),
        },
        createDummyTool
      );

      expect(graphReadyResult.removed).toEqual(["search_packages"]);
      expect(graphReadyResult.retained).toEqual(["open_package_graph"]);
      expect(graphReadyResult.registered.sort()).toEqual([
        "calculate_blast_radius",
        "focus_graph_nodes",
        "summarize_graph",
        "trace_dependency_path",
      ]);

      // Verify obsolete tool was removed from platform via abort signal
      expect(platform.registeredTools.has("search_packages")).toBe(false);
      expect(platform.registeredTools.has("open_package_graph")).toBe(true);
      expect(platform.registeredTools.has("summarize_graph")).toBe(true);
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(false);
    });

    test("failed registration does not create false active state and captures error (INV-WMCP4-OWN-001)", async () => {
      const platform = createMockPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      platform.failNextRegistration = {
        code: "REGISTRATION_FAILED",
        message: "Simulated browser registration failure",
      };

      const result = await owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 1,
          toolNames: new Set<WebMcpActionName>(["search_packages"]),
        },
        createDummyTool
      );

      expect(result.registered).toEqual([]);
      expect(result.errors.search_packages).toBe("Simulated browser registration failure");
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(false);

      // Subsequent retry succeeds
      const retryResult = await owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 1,
          toolNames: new Set<WebMcpActionName>(["search_packages"]),
        },
        createDummyTool
      );
      expect(retryResult.registered).toEqual(["search_packages"]);
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(true);
    });

    test("capability loss disposes active registrations cleanly without breaking app (INV-WMCP4-CAP-001, INV-WMCP4-CAP-002)", async () => {
      const platform = createMockPlatformAdapter(true);
      const owner = createWebMcpRegistrationOwner(platform);

      await owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 1,
          toolNames: new Set<WebMcpActionName>(["search_packages", "open_package_graph"]),
        },
        createDummyTool
      );
      expect(owner.getActiveRegistrations().size).toBe(2);

      // WebMCP capability lost (e.g. context destroyed or feature disabled)
      platform.setAvailable(false);

      const result = await owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 2,
          toolNames: new Set<WebMcpActionName>(["search_packages", "open_package_graph"]),
        },
        createDummyTool
      );

      expect(result.removed.sort()).toEqual(["open_package_graph", "search_packages"]);
      expect(owner.getActiveRegistrations().size).toBe(0);
      expect(platform.registeredTools.size).toBe(0);
    });

    test("owner disposal aborts all registrations idempotently (INV-WMCP4-LIFE-003, INV-WMCP4-OWN-003)", async () => {
      const platform = createMockPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      await owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 1,
          toolNames: new Set<WebMcpActionName>(["search_packages", "open_package_graph"]),
        },
        createDummyTool
      );

      expect(owner.isDisposed()).toBe(false);
      expect(platform.registeredTools.size).toBe(2);

      owner.dispose();
      expect(owner.isDisposed()).toBe(true);
      expect(owner.getActiveRegistrations().size).toBe(0);
      expect(platform.registeredTools.size).toBe(0);

      // Repeated disposal is a no-op
      expect(() => owner.dispose()).not.toThrow();

      // Reconcile on disposed owner returns error
      const postDispose = await owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 2,
          toolNames: new Set<WebMcpActionName>(["search_packages"]),
        },
        createDummyTool
      );
      expect(postDispose.errors.owner).toBeDefined();
    });

    test("asynchronous reconciliation race safety prevents stale pass from overwriting newer state (INV-WMCP4-RACE-001)", async () => {
      const platform = createMockPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      let slowRegistrationResolve: (() => void) | null = null;
      const slowRegistrationPromise = new Promise<void>((resolve) => {
        slowRegistrationResolve = resolve;
      });

      const originalRegisterTool = platform.registerTool.bind(platform);
      let isFirstCall = true;

      platform.registerTool = async function (tool, options) {
        if (isFirstCall && tool.name === "search_packages") {
          isFirstCall = false;
          await slowRegistrationPromise;
        }
        return originalRegisterTool(tool, options);
      };

      // 1. Start Pass 1 (slow)
      const pass1Promise = owner.reconcile(
        {
          phase: "IDLE",
          contextRevision: 1,
          toolNames: new Set<WebMcpActionName>(["search_packages"]),
        },
        createDummyTool
      );

      // 2. Start Pass 2 (fast, newer state: GRAPH_READY without search_packages)
      const pass2Promise = owner.reconcile(
        {
          phase: "GRAPH_READY",
          contextRevision: 2,
          toolNames: new Set<WebMcpActionName>(["open_package_graph"]),
        },
        createDummyTool
      );

      await pass2Promise;
      expect(owner.getActiveRegistrations().has("open_package_graph")).toBe(true);

      // 3. Unblock Pass 1
      if (slowRegistrationResolve) {
        (slowRegistrationResolve as () => void)();
      }
      await pass1Promise;

      // Assert stale Pass 1 did NOT resurrect search_packages
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(false);
      expect(owner.getActiveRegistrations().has("open_package_graph")).toBe(true);
    });
  });
});

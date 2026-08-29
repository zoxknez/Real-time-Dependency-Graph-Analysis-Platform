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

function createAdversarialPlatformAdapter(): WebMcpPlatformAdapter & {
  registeredTools: Map<string, { definition: WebMcpPlatformToolDefinition<any, any>; options?: WebMcpPlatformRegistrationOptions }>;
  pendingRegistrations: Map<string, { resolve: (res: WebMcpPlatformRegistrationResult) => void; reject: (err: unknown) => void }>;
  registrationCallCounts: Map<string, number>;
  setAvailable(available: boolean): void;
} {
  let isAvail = true;
  const registeredTools = new Map<string, { definition: WebMcpPlatformToolDefinition<any, any>; options?: WebMcpPlatformRegistrationOptions }>();
  const pendingRegistrations = new Map<string, { resolve: (res: WebMcpPlatformRegistrationResult) => void; reject: (err: unknown) => void }>();
  const registrationCallCounts = new Map<string, number>();

  return {
    registeredTools,
    pendingRegistrations,
    registrationCallCounts,
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
      const currentCount = registrationCallCounts.get(tool.name) ?? 0;
      registrationCallCounts.set(tool.name, currentCount + 1);

      if (!isAvail) {
        return { ok: false, error: { code: "UNAVAILABLE", message: "WebMCP is unavailable" } };
      }

      if (options?.signal?.aborted) {
        return { ok: false, error: { code: "CANCELLED", message: "Registration signal already aborted" } };
      }

      // Enforce duplicate collision in simulated platform map
      if (registeredTools.has(tool.name)) {
        return {
          ok: false,
          error: {
            code: "REGISTRATION_FAILED",
            message: `InvalidStateError: Tool ${tool.name} already registered`,
          },
        };
      }

      registeredTools.set(tool.name, { definition: tool, options });

      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          registeredTools.delete(tool.name);
        });
      }

      return new Promise<WebMcpPlatformRegistrationResult>((resolve, reject) => {
        pendingRegistrations.set(tool.name, { resolve, reject });
      });
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

    test("owner disposal aborts all registrations idempotently (INV-WMCP4-LIFE-003, INV-WMCP4-OWN-003, INV-WMCP4-LIFE-005)", async () => {
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

    // --- WMCP-4A-R2 Adversarial Race Tests (TEST R2-1 through R2-7) ---

    test("R2-1: Same-tool pending adoption prevents duplicate call and retains tool (INV-WMCP4-RACE-002, INV-WMCP4-RACE-003)", async () => {
      const platform = createAdversarialPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      // Pass 1: desired search_packages
      const pass1Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 1, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      expect(platform.registeredTools.has("search_packages")).toBe(true);
      expect(platform.registrationCallCounts.get("search_packages")).toBe(1);

      // Pass 2: also desired search_packages (before Pass 1 promise resolves)
      const pass2Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 2, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      // Single-flight guarantee: no second call to registerTool issued
      expect(platform.registrationCallCounts.get("search_packages")).toBe(1);

      // Now resolve the in-flight registration
      const pending = platform.pendingRegistrations.get("search_packages");
      expect(pending).toBeDefined();
      pending!.resolve({ ok: true });

      const [res1, res2] = await Promise.all([pass1Promise, pass2Promise]);

      expect(res1.errors).toEqual({});
      expect(res2.errors).toEqual({});
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(true);
      expect(platform.registeredTools.has("search_packages")).toBe(true);
      expect(platform.registrationCallCounts.get("search_packages")).toBe(1);
    });

    test("R2-2: Multi-tool pending adoption removes obsolete tool and adopts pending tool (INV-WMCP4-RACE-002)", async () => {
      const platform = createAdversarialPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      // Pass 1: wants ['search_packages', 'open_package_graph']
      // Let search_packages resolve immediately, open_package_graph stay pending
      const originalRegister = platform.registerTool.bind(platform);
      platform.registerTool = async (tool, options) => {
        if (tool.name === "search_packages") {
          platform.registeredTools.set(tool.name, { definition: tool, options });
          if (options?.signal) {
            options.signal.addEventListener("abort", () => {
              platform.registeredTools.delete(tool.name);
            });
          }
          platform.registrationCallCounts.set(tool.name, 1);
          return { ok: true };
        }
        return originalRegister(tool, options);
      };

      const pass1Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 1, toolNames: new Set<WebMcpActionName>(["search_packages", "open_package_graph"]) },
        createDummyTool
      );

      // Allow microtasks to run so open_package_graph starts registration
      await new Promise((r) => setTimeout(r, 10));

      // Pass 2: wants only ['open_package_graph']
      const pass2Promise = owner.reconcile(
        { phase: "GRAPH_READY", contextRevision: 2, toolNames: new Set<WebMcpActionName>(["open_package_graph"]) },
        createDummyTool
      );

      // Resolve pending open_package_graph
      const pending = platform.pendingRegistrations.get("open_package_graph");
      if (pending) pending.resolve({ ok: true });

      const [, res2] = await Promise.all([pass1Promise, pass2Promise]);

      expect(res2.removed).toEqual(["search_packages"]);
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(false);
      expect(owner.getActiveRegistrations().has("open_package_graph")).toBe(true);
      expect(platform.registeredTools.has("search_packages")).toBe(false);
      expect(platform.registeredTools.has("open_package_graph")).toBe(true);
      expect(platform.registrationCallCounts.get("open_package_graph")).toBe(1);
    });

    test("R2-3: Pending tool becomes obsolete in newer pass and is aborted without resurrection (INV-WMCP4-LIFE-001)", async () => {
      const platform = createAdversarialPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      const pass1Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 1, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      // Pass 2: wants empty surface
      const pass2Promise = owner.reconcile(
        { phase: "BOOTSTRAP", contextRevision: 2, toolNames: new Set<WebMcpActionName>() },
        createDummyTool
      );

      // Late resolve of Pass 1
      const pending = platform.pendingRegistrations.get("search_packages");
      if (pending) pending.resolve({ ok: true });

      await Promise.all([pass1Promise, pass2Promise]);

      expect(owner.getActiveRegistrations().size).toBe(0);
      expect(platform.registeredTools.size).toBe(0);
    });

    test("R2-4: Capability loss after platform acceptance aborts pending tools without resurrection (INV-WMCP4-CAP-003)", async () => {
      const platform = createAdversarialPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      const pass1Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 1, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      // Capability lost
      platform.setAvailable(false);

      const pass2Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 2, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      // Late resolve of Pass 1
      const pending = platform.pendingRegistrations.get("search_packages");
      if (pending) pending.resolve({ ok: true });

      await Promise.all([pass1Promise, pass2Promise]);

      expect(owner.getActiveRegistrations().size).toBe(0);
      expect(platform.registeredTools.size).toBe(0);
    });

    test("R2-5: Owner disposal after platform acceptance aborts pending tools without resurrection (INV-WMCP4-LIFE-005)", async () => {
      const platform = createAdversarialPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      const pass1Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 1, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      owner.dispose();

      // Late resolve of Pass 1
      const pending = platform.pendingRegistrations.get("search_packages");
      if (pending) pending.resolve({ ok: true });

      await pass1Promise;

      expect(owner.isDisposed()).toBe(true);
      expect(owner.getActiveRegistrations().size).toBe(0);
      expect(platform.registeredTools.size).toBe(0);
    });

    test("R2-6: Pending registration failure clears pending ownership and allows subsequent retry", async () => {
      const platform = createAdversarialPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      const pass1Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 1, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      // Fail Pass 1 registration
      const pending = platform.pendingRegistrations.get("search_packages");
      if (pending) {
        pending.resolve({
          ok: false,
          error: { code: "REGISTRATION_FAILED", message: "Simulated browser error" },
        });
      }

      const res1 = await pass1Promise;
      expect(res1.errors.search_packages).toBe("Simulated browser error");
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(false);

      // Next reconciliation retries fresh registration
      const pass2Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 2, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      const pending2 = platform.pendingRegistrations.get("search_packages");
      if (pending2) pending2.resolve({ ok: true });

      const res2 = await pass2Promise;
      expect(res2.registered).toEqual(["search_packages"]);
      expect(owner.getActiveRegistrations().has("search_packages")).toBe(true);
    });

    test("R2-7: Pre-registration delay race remains safe without resurrecting obsolete tool (Race A preservation)", async () => {
      const platform = createMockPlatformAdapter();
      const owner = createWebMcpRegistrationOwner(platform);

      let slowResolve: (() => void) | null = null;
      const slowPromise = new Promise<void>((resolve) => {
        slowResolve = resolve;
      });

      const originalRegister = platform.registerTool.bind(platform);
      let isFirst = true;

      platform.registerTool = async (tool, options) => {
        if (isFirst && tool.name === "search_packages") {
          isFirst = false;
          await slowPromise;
        }
        return originalRegister(tool, options);
      };

      const pass1Promise = owner.reconcile(
        { phase: "IDLE", contextRevision: 1, toolNames: new Set<WebMcpActionName>(["search_packages"]) },
        createDummyTool
      );

      const pass2Promise = owner.reconcile(
        { phase: "GRAPH_READY", contextRevision: 2, toolNames: new Set<WebMcpActionName>(["open_package_graph"]) },
        createDummyTool
      );

      await pass2Promise;
      expect(owner.getActiveRegistrations().has("open_package_graph")).toBe(true);

      if (slowResolve) {
        (slowResolve as () => void)();
      }
      await pass1Promise;

      expect(owner.getActiveRegistrations().has("search_packages")).toBe(false);
      expect(owner.getActiveRegistrations().has("open_package_graph")).toBe(true);
    });
  });
});

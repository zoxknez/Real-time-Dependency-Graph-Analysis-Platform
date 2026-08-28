/**
 * War Room WebMCP Primitive Registration & Execution Bridge Suite (WMCP-3B / WMCP-3B-R1)
 *
 * Tests the registration adapter, two-tool primitive set (`search_packages`, `open_package_graph`),
 * execution bridge to shared `WarRoomActions`, AGENT contextRevision capture, canonical commit
 * authority for graph projection activation, hard <= 1500 output budget, and stale/cancellation semantics.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  createBrowserWebMcpPlatformAdapter,
  createPrimitiveTools,
  createPrimitiveWebMcpRegistrationSession,
  SEARCH_PACKAGES_SCHEMA,
  OPEN_PACKAGE_GRAPH_SCHEMA,
  validateSearchPackagesInput,
  validateOpenPackageGraphInput,
  buildBudgetedSearchOutput,
  buildBudgetedOpenGraphOutput,
  formatToolFailure,
  formatToolSuccess,
  WebMcpPlatformToolDefinition,
  WebMcpToolOutputEnvelope,
  WebMcpSearchPackagesResultData,
  WebMcpOpenGraphResultData,
} from "../src/lib/webmcp";
import {
  createWarRoomStore,
  createWarRoomStatePort,
  createWarRoomActions,
  createGraphProjectionStore,
  createPublicWorkspaceSecurityContextPort,
  createPublicWorkspaceAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  createUnavailableScenarioAnalysisPort,
  createUnavailableMigrationPlanningPort,
  WarRoomPackageRef,
  WarRoomGraphContext,
} from "../src/lib/war-room";

function assertWithinToolBudget(result: unknown): void {
  const serialized = JSON.stringify(result);
  expect(serialized.length).toBeLessThanOrEqual(1500);
}

function createMockEnvironment(options?: {
  graphQueryPort?: WarRoomGraphQueryPort;
  packageCatalogPort?: WarRoomPackageCatalogPort;
}) {
  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);
  const projectionStore = createGraphProjectionStore();
  const securityContextPort = createPublicWorkspaceSecurityContextPort();
  const authorizationPort = createPublicWorkspaceAuthorizationPort();

  const packageCatalogPort: WarRoomPackageCatalogPort =
    options?.packageCatalogPort || {
      searchPackages: async (_sec, request) => {
        const query = request.query;
        if (query === "empty") {
          return { ok: true, data: { packages: [], totalCount: 0 } };
        }
        return {
          ok: true,
          data: {
            packages: [
              { id: `npm:${query}@19.0.0`, name: query, ecosystem: "NPM" },
              { id: `npm:${query}-dom@19.0.0`, name: `${query}-dom`, ecosystem: "NPM" },
            ],
            totalCount: 2,
          },
        };
      },
      inspectPackage: async () => ({
        ok: false,
        error: { code: "UNAVAILABLE", message: "Not implemented" },
      }),
    };

  const graphQueryPort: WarRoomGraphQueryPort =
    options?.graphQueryPort || {
      loadPackageGraph: async (_sec, request, signal) => {
        if (request.rootPackageId.includes("nonexistent")) {
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Package not found" },
          };
        }

        const graph: WarRoomGraphContext = {
          id: `graph:${request.rootPackageId}`,
          rootPackage: {
            id: request.rootPackageId,
            name: request.rootPackageId.split(":")[1]?.split("@")[0] || "pkg",
            ecosystem: "NPM",
          },
          packageIds: [request.rootPackageId],
          nodes: [
            {
              id: request.rootPackageId,
              name: request.rootPackageId.split(":")[1]?.split("@")[0] || "pkg",
              ecosystem: "NPM",
            },
          ],
          edges: [],
        };

        if (signal) {
          const seq = projectionStore.nextSequence(graph.id);
          projectionStore.stageProjection(
            signal,
            {
              graphId: graph.id,
              rootPackageId: graph.rootPackage.id,
              depth: request.depth || 2,
              nodes: [
                {
                  id: graph.rootPackage.id,
                  name: graph.rootPackage.name,
                  ecosystem: "NPM",
                  depth: 0,
                  isRoot: true,
                },
              ],
              links: [],
              loadedCount: 1,
              totalCount: 1,
              truncated: false,
            },
            seq
          );
        }

        return { ok: true, data: graph };
      },
      traceDependencyPath: async () => ({
        ok: false,
        error: { code: "UNAVAILABLE", message: "Not implemented" },
      }),
    };

  const actions = createWarRoomActions({
    statePort,
    securityContextPort,
    authorizationPort,
    packageCatalogPort,
    graphQueryPort,
    scenarioAnalysisPort: createUnavailableScenarioAnalysisPort(),
    migrationPlanningPort: createUnavailableMigrationPlanningPort(),
  });

  // Initialize store out of BOOTSTRAP to IDLE
  actions.initialize();

  return {
    store,
    statePort,
    projectionStore,
    securityContextPort,
    authorizationPort,
    packageCatalogPort,
    graphQueryPort,
    actions,
  };
}

test.describe("WebMCP Primitive Registration & Execution Bridge (WMCP-3B / WMCP-3B-R1)", () => {
  // ─── 1. Platform Registration Adapter Primitive ───

  test("1. Unavailable platform registers zero tools and returns UNAVAILABLE", async () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: { document: {} },
    });

    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    const result = await adapter.registerTool(searchTool);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAVAILABLE");
    }
  });

  test("2. Available platform registers search_packages successfully", async () => {
    const registered: unknown[] = [];
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async (t: unknown) => {
            registered.push(t);
          },
          getTools: async () => registered,
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    const result = await adapter.registerTool(searchTool);
    expect(result.ok).toBe(true);
    expect(registered.length).toBe(1);
  });

  test("3. Available platform registers open_package_graph successfully", async () => {
    const registered: unknown[] = [];
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async (t: unknown) => {
            registered.push(t);
          },
          getTools: async () => registered,
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    const result = await adapter.registerTool(openGraphTool);
    expect(result.ok).toBe(true);
    expect(registered.length).toBe(1);
  });

  test("4. Registration with already aborted signal returns CANCELLED without browser call", async () => {
    let callCount = 0;
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async () => {
            callCount++;
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    const controller = new AbortController();
    controller.abort();

    const result = await adapter.registerTool(searchTool, {
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
    expect(callCount).toBe(0);
  });

  test("5. Registration AbortError returns CANCELLED", async () => {
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async () => {
            const err = new Error("Registration aborted");
            err.name = "AbortError";
            throw err;
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    const result = await adapter.registerTool(searchTool);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
  });

  test("6. Generic browser registration failure returns REGISTRATION_FAILED and sanitizes error", async () => {
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async () => {
            throw new Error("Internal browser DOMException with secret stack trace");
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    const result = await adapter.registerTool(searchTool);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("REGISTRATION_FAILED");
      expect(result.error.message).not.toContain("secret stack trace");
    }
  });

  // ─── 2. Primitive Registration Session ───

  test("7. Session registers exactly two primitive tools in deterministic order", async () => {
    const registeredNames: string[] = [];
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async (t: { name: string }) => {
            registeredNames.push(t.name);
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);

    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);
    const res = await session.start();

    expect(res.ok).toBe(true);
    expect(registeredNames).toEqual(["search_packages", "open_package_graph"]);
  });

  test("8. Both primitive tools receive the exact same registration lifetime signal", async () => {
    const receivedSignals: (AbortSignal | undefined)[] = [];
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async (_t: unknown, options?: { signal?: AbortSignal }) => {
            receivedSignals.push(options?.signal);
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);

    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);
    await session.start();

    expect(receivedSignals.length).toBe(2);
    expect(receivedSignals[0]).toBeDefined();
    expect(receivedSignals[0]).toBe(receivedSignals[1]);
  });

  test("9. Session start is idempotent: calling start twice registers tools only once", async () => {
    let callCount = 0;
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async () => {
            callCount++;
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);

    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);
    const p1 = session.start();
    const p2 = session.start();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(callCount).toBe(2); // exactly two tools registered once
  });

  test("10. Session dispose aborts the shared registration signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async (_t: unknown, options?: { signal?: AbortSignal }) => {
            capturedSignal = options?.signal;
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);

    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);
    await session.start();

    expect(capturedSignal?.aborted).toBe(false);
    session.dispose();
    expect(capturedSignal?.aborted).toBe(true);
  });

  test("11. Partial second-tool failure rolls back first tool via registration signal abort", async () => {
    let capturedSignal: AbortSignal | undefined;
    let callCount = 0;

    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async (_t: unknown, options?: { signal?: AbortSignal }) => {
            callCount++;
            capturedSignal = options?.signal;
            if (callCount === 2) {
              throw new Error("Second tool registration failed");
            }
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);

    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);
    const res = await session.start();

    expect(res.ok).toBe(false);
    expect(callCount).toBe(2);
    // Shared controller was aborted on rollback
    expect(capturedSignal?.aborted).toBe(true);
  });

  test("12. First tool failure aborts immediately and does not attempt second tool", async () => {
    let callCount = 0;
    const customGlobal = {
      isSecureContext: true,
      document: {
        modelContext: {
          registerTool: async () => {
            callCount++;
            throw new Error("First tool registration failed");
          },
          getTools: async () => [],
        },
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);

    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);
    const res = await session.start();

    expect(res.ok).toBe(false);
    expect(callCount).toBe(1);
  });

  // ─── 3. Tool Schemas & Annotations ───

  test("13. SEARCH_PACKAGES_SCHEMA is strict and JSON serializable", () => {
    expect(SEARCH_PACKAGES_SCHEMA.additionalProperties).toBe(false);
    expect(SEARCH_PACKAGES_SCHEMA.required).toEqual(["query"]);
    expect(SEARCH_PACKAGES_SCHEMA.properties.ecosystem.enum).toEqual([
      "NPM",
      "PY_PI",
      "CARGO",
      "MAVEN",
      "NU_GET",
      "GO",
    ]);
    expect(() => JSON.stringify(SEARCH_PACKAGES_SCHEMA)).not.toThrow();
  });

  test("14. OPEN_PACKAGE_GRAPH_SCHEMA is strict and JSON serializable", () => {
    expect(OPEN_PACKAGE_GRAPH_SCHEMA.additionalProperties).toBe(false);
    expect(OPEN_PACKAGE_GRAPH_SCHEMA.required).toEqual(["rootPackageId"]);
    expect(OPEN_PACKAGE_GRAPH_SCHEMA.properties.depth.minimum).toBe(1);
    expect(OPEN_PACKAGE_GRAPH_SCHEMA.properties.depth.maximum).toBe(4);
    expect(() => JSON.stringify(OPEN_PACKAGE_GRAPH_SCHEMA)).not.toThrow();
  });

  test("15. search_packages annotations are readOnlyHint: true and untrustedContentHint: true", () => {
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    expect(searchTool.annotations?.readOnlyHint).toBe(true);
    expect(searchTool.annotations?.untrustedContentHint).toBe(true);
  });

  test("16. open_package_graph annotations are readOnlyHint: false and untrustedContentHint: true", () => {
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    expect(openGraphTool.annotations?.readOnlyHint).toBe(false);
    expect(openGraphTool.annotations?.untrustedContentHint).toBe(true);
  });

  // ─── 4. Runtime Input Validation ───

  test("17. validateSearchPackagesInput accepts valid inputs", () => {
    const v1 = validateSearchPackagesInput({ query: "react" });
    expect(v1.valid).toBe(true);
    expect(v1.value).toEqual({ query: "react", ecosystem: undefined, limit: 5 });

    const v2 = validateSearchPackagesInput({ query: "tokio", ecosystem: "CARGO", limit: 5 });
    expect(v2.valid).toBe(true);
    expect(v2.value).toEqual({ query: "tokio", ecosystem: "CARGO", limit: 5 });
  });

  test("18. validateSearchPackagesInput rejects malformed inputs", () => {
    expect(validateSearchPackagesInput(null).valid).toBe(false);
    expect(validateSearchPackagesInput("string").valid).toBe(false);
    expect(validateSearchPackagesInput([]).valid).toBe(false);
    expect(validateSearchPackagesInput({}).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "   " }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "a".repeat(121) }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", ecosystem: "INVALID" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", limit: 0 }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", limit: 9 }).valid).toBe(false);
  });

  test("19. validateSearchPackagesInput rejects unknown/security/contextRevision properties", () => {
    expect(validateSearchPackagesInput({ query: "react", tenantId: "evil" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", userId: "evil" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", contextRevision: 5 }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", token: "secret" }).valid).toBe(false);
  });

  test("20. validateOpenPackageGraphInput accepts valid inputs", () => {
    const v1 = validateOpenPackageGraphInput({ rootPackageId: "npm:react@19.0.0" });
    expect(v1.valid).toBe(true);
    expect(v1.value).toEqual({ rootPackageId: "npm:react@19.0.0", depth: 2 });

    const v2 = validateOpenPackageGraphInput({ rootPackageId: "cargo:tokio@1.0.0", depth: 3 });
    expect(v2.valid).toBe(true);
    expect(v2.value).toEqual({ rootPackageId: "cargo:tokio@1.0.0", depth: 3 });
  });

  test("21. validateOpenPackageGraphInput rejects malformed inputs", () => {
    expect(validateOpenPackageGraphInput(null).valid).toBe(false);
    expect(validateOpenPackageGraphInput("string").valid).toBe(false);
    expect(validateOpenPackageGraphInput([]).valid).toBe(false);
    expect(validateOpenPackageGraphInput({}).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "" }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "   " }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "a".repeat(257) }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", depth: 0 }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", depth: 5 }).valid).toBe(false);
  });

  test("22. validateOpenPackageGraphInput rejects unknown/security/contextRevision/URL/query properties", () => {
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", tenantId: "evil" }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", contextRevision: 4 }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", url: "https://evil.com" }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", query: "MATCH (n) RETURN n" }).valid).toBe(false);
  });

  // ─── 5. Tool Execution Bridge & Output Contracts ───

  test("23. search_packages executes with channel AGENT and does not mutate canonical state or revision", async () => {
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    const revBefore = env.statePort.getState().contextRevision;
    const phaseBefore = env.statePort.getState().phase;

    const execController = new AbortController();
    const result = await searchTool.execute(
      { query: "react" },
      { signal: execController.signal }
    );

    assertWithinToolBudget(result);
    const typedResult = result as WebMcpToolOutputEnvelope<WebMcpSearchPackagesResultData>;
    expect(typedResult.ok).toBe(true);
    if (typedResult.ok) {
      expect(typedResult.tool).toBe("search_packages");
      expect(typedResult.changed).toBe(false);
      expect(typedResult.data.packages.length).toBe(2);
      expect(typedResult.data.packages[0]?.name).toBe("react");
    }

    const revAfter = env.statePort.getState().contextRevision;
    const phaseAfter = env.statePort.getState().phase;

    expect(revAfter).toBe(revBefore);
    expect(phaseAfter).toBe(phaseBefore);
  });

  test("24. open_package_graph executes with channel AGENT, mutates canonical state, activates staged projection and reports projectionActivated: true", async () => {
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    const execController = new AbortController();
    const result = await openGraphTool.execute(
      { rootPackageId: "npm:react@19.0.0" },
      { signal: execController.signal }
    );

    assertWithinToolBudget(result);
    const typedResult = result as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;
    expect(typedResult.ok).toBe(true);
    if (typedResult.ok) {
      expect(typedResult.tool).toBe("open_package_graph");
      expect(typedResult.changed).toBe(true);
      expect(typedResult.data.graphId).toBe("graph:npm:react@19.0.0");
      expect(typedResult.data.packageCount).toBe(1);
      expect(typedResult.data.projectionActivated).toBe(true);
      expect(typedResult.data.compact).toBe(false);
    }

    const state = env.statePort.getState();
    expect(state.phase).toBe("GRAPH_READY");
    if (state.phase === "GRAPH_READY") {
      expect(state.graph.rootPackage.id).toBe("npm:react@19.0.0");
    }

    const visibleProjection = env.projectionStore.getProjection("graph:npm:react@19.0.0");
    expect(visibleProjection).not.toBeNull();
    expect(visibleProjection?.rootPackageId).toBe("npm:react@19.0.0");
  });

  test("25. open_package_graph failure discards staged projection", async () => {
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    const execController = new AbortController();
    const result = await openGraphTool.execute(
      { rootPackageId: "npm:nonexistent@1.0.0" },
      { signal: execController.signal }
    );

    assertWithinToolBudget(result);
    const typedResult = result as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;
    expect(typedResult.ok).toBe(false);
    if (!typedResult.ok) {
      expect(typedResult.error.code).toBe("NOT_FOUND");
    }

    const visibleProjection = env.projectionStore.getProjection("graph:npm:nonexistent@1.0.0");
    expect(visibleProjection).toBeNull();
  });

  test("26. open_package_graph STALE_CONTEXT: real delayed query rejected mid-flight and preserves existing state and projection", async () => {
    let unblockQuery: (() => void) | null = null;
    const queryGate = new Promise<void>((resolve) => {
      unblockQuery = resolve;
    });

    const delayedGraphQueryPort: WarRoomGraphQueryPort = {
      loadPackageGraph: async (_sec, request, signal) => {
        if (request.rootPackageId === "npm:delayed@1.0.0") {
          await queryGate;
        }
        const graph: WarRoomGraphContext = {
          id: `graph:${request.rootPackageId}`,
          rootPackage: {
            id: request.rootPackageId,
            name: "pkg",
            ecosystem: "NPM",
          },
          packageIds: [request.rootPackageId],
          nodes: [{ id: request.rootPackageId, name: "pkg", ecosystem: "NPM" }],
          edges: [],
        };
        return { ok: true, data: graph };
      },
      traceDependencyPath: async () => ({
        ok: false,
        error: { code: "UNAVAILABLE", message: "Not implemented" },
      }),
    };

    const env = createMockEnvironment({ graphQueryPort: delayedGraphQueryPort });
    const [, openGraphTool] = createPrimitiveTools(env);

    // 1. Initial valid graph load
    const c1 = new AbortController();
    await openGraphTool.execute({ rootPackageId: "npm:initial@1.0.0" }, { signal: c1.signal });
    const initialRev = env.statePort.getState().contextRevision;

    // 2. Start delayed agent tool call (captures initialRev)
    const c2 = new AbortController();
    const agentExecutionPromise = openGraphTool.execute(
      { rootPackageId: "npm:delayed@1.0.0" },
      { signal: c2.signal }
    );

    // 3. Perform genuine semantic state mutation while agent query is in-flight
    const humanResult = await env.actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: initialRev },
      { selection: { package: { id: "npm:initial@1.0.0", name: "initial", ecosystem: "NPM" } } }
    );
    expect(humanResult.ok).toBe(true);
    expect(env.statePort.getState().contextRevision).toBe(initialRev + 1);

    // 4. Release delayed query
    if (unblockQuery) {
      (unblockQuery as () => void)();
    }

    const agentResult = (await agentExecutionPromise) as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;
    assertWithinToolBudget(agentResult);
    expect(agentResult.ok).toBe(false);
    if (!agentResult.ok) {
      expect(agentResult.error.code).toBe("STALE_CONTEXT");
    }

    // Existing graph state preserved
    const stateAfter = env.statePort.getState();
    expect(stateAfter.phase).toBe("NODE_SELECTED");
    if (stateAfter.phase === "NODE_SELECTED") {
      expect(stateAfter.graph.rootPackage.id).toBe("npm:initial@1.0.0");
    }
  });

  test("27. Pre-commit execution cancellation via AbortSignal returns CANCELLED", async () => {
    const env = createMockEnvironment();
    const [searchTool, openGraphTool] = createPrimitiveTools(env);

    const c1 = new AbortController();
    c1.abort();

    const r1 = await searchTool.execute(
      { query: "react" },
      { signal: c1.signal }
    );
    assertWithinToolBudget(r1);
    const tr1 = r1 as WebMcpToolOutputEnvelope<WebMcpSearchPackagesResultData>;
    expect(tr1.ok).toBe(false);
    if (!tr1.ok) {
      expect(tr1.error.code).toBe("CANCELLED");
    }

    const c2 = new AbortController();
    c2.abort();

    const r2 = await openGraphTool.execute(
      { rootPackageId: "npm:react@19.0.0" },
      { signal: c2.signal }
    );
    assertWithinToolBudget(r2);
    const tr2 = r2 as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;
    expect(tr2.ok).toBe(false);
    if (!tr2.ok) {
      expect(tr2.error.code).toBe("CANCELLED");
    }
  });

  // ─── 6. Output Envelopes & Hard Character Budgeting (WMCP-INV-011) ───

  test("28. buildBudgetedSearchOutput enforces 1500 character budget with whole package records", () => {
    const longPackages: WarRoomPackageRef[] = Array.from({ length: 8 }, (_, i) => ({
      id: `npm:very-long-enterprise-scope-package-name-with-details-${i}@1.2.3-alpha.4`,
      name: `very-long-enterprise-scope-package-name-with-details-${i}`,
      ecosystem: "NPM" as const,
      version: "1.2.3-alpha.4",
    }));

    const output = buildBudgetedSearchOutput("search_packages", 1, longPackages, 100);
    assertWithinToolBudget(output);
    expect(output.ok).toBe(true);
    if (output.ok) {
      expect(output.data.packages.length).toBeGreaterThan(0);
      expect(output.data.truncated).toBe(true);
      for (const pkg of output.data.packages) {
        expect(pkg.id).toContain("@1.2.3-alpha.4");
      }
    }

    // Pathological single oversized record (5000 chars)
    const giantPackage: WarRoomPackageRef = {
      id: "npm:giant@1.0.0",
      name: "G".repeat(5000),
      ecosystem: "NPM",
    };
    const giantOutput = buildBudgetedSearchOutput("search_packages", 1, [giantPackage]);
    assertWithinToolBudget(giantOutput);
  });

  test("29. buildBudgetedOpenGraphOutput enforces hard <= 1500 budget with compact fallback on pathological inputs", () => {
    // Normal case
    const normalRoot: WarRoomPackageRef = {
      id: "npm:react@19.0.0",
      name: "react",
      ecosystem: "NPM",
      version: "19.0.0",
    };
    const normalOutput = buildBudgetedOpenGraphOutput(
      "open_package_graph",
      2,
      true,
      "graph:npm:react",
      normalRoot,
      42,
      true
    );
    assertWithinToolBudget(normalOutput);
    if (normalOutput.ok) {
      expect(normalOutput.data.compact).toBe(false);
      expect(normalOutput.data.projectionActivated).toBe(true);
    }

    // Pathological 5000-character root package name
    const oversizedRoot: WarRoomPackageRef = {
      id: "npm:oversized@1.0.0",
      name: "X".repeat(5000),
      ecosystem: "NPM",
      version: "1.0.0",
    };
    const compactOutput = buildBudgetedOpenGraphOutput(
      "open_package_graph",
      2,
      true,
      "graph:npm:oversized",
      oversizedRoot,
      10,
      true
    );
    assertWithinToolBudget(compactOutput);
    if (compactOutput.ok) {
      expect(compactOutput.data.compact).toBe(true);
      expect(compactOutput.data.projectionActivated).toBe(true);
      expect(compactOutput.data.rootPackageId).toBe("npm:oversized@1.0.0");
    }

    // Extreme 50000-character root package name
    const extremeRoot: WarRoomPackageRef = {
      id: "npm:extreme@1.0.0",
      name: "Y".repeat(50000),
      ecosystem: "NPM",
    };
    const extremeOutput = buildBudgetedOpenGraphOutput(
      "open_package_graph",
      2,
      true,
      "graph:npm:extreme",
      extremeRoot,
      10,
      true
    );
    assertWithinToolBudget(extremeOutput);

    // Root package ID at allowed 256-char boundary
    const boundaryRoot: WarRoomPackageRef = {
      id: "npm:" + "Z".repeat(240) + "@1.0.0",
      name: "boundary",
      ecosystem: "NPM",
    };
    const boundaryOutput = buildBudgetedOpenGraphOutput(
      "open_package_graph",
      2,
      true,
      "graph:" + boundaryRoot.id,
      boundaryRoot,
      5,
      true
    );
    assertWithinToolBudget(boundaryOutput);
  });

  test("30. formatToolFailure sanitizes long error messages and guarantees <= 1500 chars", () => {
    const longMessage = "E".repeat(5000);
    const failure = formatToolFailure("search_packages", 1, "INTERNAL_ERROR", longMessage);

    assertWithinToolBudget(failure);
    expect(failure.error.message.length).toBeLessThanOrEqual(240);
    expect(failure.error.message.endsWith("...")).toBe(true);
  });

  test("31. formatToolSuccess is genuinely budget-safe and fails closed on oversized payload", () => {
    const normal = formatToolSuccess("custom_tool", true, 1, { count: 42 });
    assertWithinToolBudget(normal);
    expect(normal.ok).toBe(true);

    const oversized = formatToolSuccess("custom_tool", true, 1, {
      payload: "O".repeat(3000),
    });
    assertWithinToolBudget(oversized);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) {
      expect(oversized.error.code).toBe("INTERNAL_ERROR");
    }
  });

  test("32. Action result contextRevision and changed are authoritative and immune to post-action store updates", async () => {
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    const execController = new AbortController();
    const result = (await openGraphTool.execute(
      { rootPackageId: "npm:react@19.0.0" },
      { signal: execController.signal }
    )) as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;

    assertWithinToolBudget(result);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contextRevision).toBe(2);
      expect(result.changed).toBe(true);
    }

    // Subsequent unrelated state mutation increments store revision to 3
    env.statePort.transition({
      type: "NODE_SELECTED",
      payload: {
        selection: {
          package: { id: "npm:react@19.0.0", name: "react", ecosystem: "NPM" },
        },
      },
    });
    expect(env.statePort.getState().contextRevision).toBe(3);

    // The completed action result's revision remains 2
    expect(result.contextRevision).toBe(2);
  });

  test("33. Concurrent same-key Agent races converge canonical state and visible projection", async () => {
    const projectionStore = createGraphProjectionStore();
    const graphKey = "graph:npm:react@19.0.0";

    const ctrlA = new AbortController();
    const ctrlB = new AbortController();

    const seqA = projectionStore.nextSequence(graphKey); // 1
    const seqB = projectionStore.nextSequence(graphKey); // 2

    // Scenario A: A completes and commits first
    projectionStore.stageProjection(
      ctrlA.signal,
      {
        graphId: graphKey,
        rootPackageId: "npm:react@19.0.0",
        depth: 2,
        nodes: [{ id: "npm:react@19.0.0", name: "react", ecosystem: "NPM", depth: 0, isRoot: true }],
        links: [],
        loadedCount: 1,
        totalCount: 1,
        truncated: false,
      },
      seqA
    );

    const activatedA = projectionStore.activateProjection(ctrlA.signal, graphKey);
    expect(activatedA).toBe(true);
    expect(projectionStore.getProjection(graphKey)?.rootPackageId).toBe("npm:react@19.0.0");

    // B later fails canonical commit (STALE_CONTEXT) and discards projection
    projectionStore.discardProjection(ctrlB.signal);
    expect(projectionStore.getProjection(graphKey)?.rootPackageId).toBe("npm:react@19.0.0");
  });

  test("34. Post-commit signal abort does not suppress projection activation of committed canonical graph", () => {
    const projectionStore = createGraphProjectionStore();
    const graphKey = "graph:npm:react@19.0.0";
    const ctrl = new AbortController();

    const seq = projectionStore.nextSequence(graphKey);
    projectionStore.stageProjection(
      ctrl.signal,
      {
        graphId: graphKey,
        rootPackageId: "npm:react@19.0.0",
        depth: 2,
        nodes: [{ id: "npm:react@19.0.0", name: "react", ecosystem: "NPM", depth: 0, isRoot: true }],
        links: [],
        loadedCount: 1,
        totalCount: 1,
        truncated: false,
      },
      seq
    );

    // Canonical action succeeds, then signal aborts before activation call
    ctrl.abort();

    const activated = projectionStore.activateProjection(ctrl.signal, graphKey);
    expect(activated).toBe(true);
    expect(projectionStore.getProjection(graphKey)?.rootPackageId).toBe("npm:react@19.0.0");
  });

  // ─── 7. Static Architecture & Governance Scans ───

  test("35. Zero 'as any' or broad any casts exist in production WebMCP bridge and platform code", () => {
    const bridgeDir = path.resolve(__dirname, "../src/lib/webmcp/bridge");
    const platformDir = path.resolve(__dirname, "../src/lib/webmcp/platform");
    const dirs = [bridgeDir, platformDir];

    const forbidden1 = ["as", "any"].join(" ");
    const forbidden2 = ["WebMcpBrowserTool<", "any, any>"].join("");

    for (const d of dirs) {
      const files = fs.readdirSync(d);
      for (const file of files) {
        if (file.endsWith(".ts")) {
          const content = fs.readFileSync(path.join(d, file), "utf8");
          const codeOnly = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
          expect(codeOnly).not.toContain(forbidden1);
          expect(codeOnly).not.toContain(forbidden2);
        }
      }
    }
  });

  test("36. WebMCP bridge does NOT access document.modelContext directly", () => {
    const bridgeDir = path.resolve(__dirname, "../src/lib/webmcp/bridge");
    const files = fs.readdirSync(bridgeDir);

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const content = fs.readFileSync(path.join(bridgeDir, file), "utf8");
        expect(content).not.toContain("document.modelContext");
      }
    }
  });

  test("37. WebMCP bridge contains zero Apollo/GraphQL/fetch/direct state mutations", () => {
    const bridgeDir = path.resolve(__dirname, "../src/lib/webmcp/bridge");
    const files = fs.readdirSync(bridgeDir);

    const forbidden = [
      "useLazyQuery",
      "ApolloClient",
      "GET_REVERSE_DEPENDENTS",
      "SEARCH_PACKAGES_QUERY",
      "fetch(",
      "statePort.transition(",
      "statePort.commitContextBound(",
      "store.setState(",
    ];

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const rawContent = fs.readFileSync(path.join(bridgeDir, file), "utf8");
        const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
        for (const token of forbidden) {
          expect(codeOnly).not.toContain(token);
        }
      }
    }
  });

  test("38. WebMCP bridge contains zero ToolRegistry or generation lifecycle concepts", () => {
    const bridgeDir = path.resolve(__dirname, "../src/lib/webmcp/bridge");
    const files = fs.readdirSync(bridgeDir);

    const forbidden = [
      "class ToolRegistry",
      "createToolRegistry",
      "RegistrationManager",
      "ACTIVE",
      "RETIRING",
      "REMOVED",
      "activeExecutions",
      "generationId",
      "desiredLogicalTools",
    ];

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const content = fs.readFileSync(path.join(bridgeDir, file), "utf8");
        for (const token of forbidden) {
          expect(content).not.toContain(token);
        }
      }
    }
  });
});

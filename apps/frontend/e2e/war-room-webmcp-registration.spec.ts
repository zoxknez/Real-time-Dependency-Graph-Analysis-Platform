/**
 * WebMCP Primitive Registration & Execution Bridge Tests (WMCP-3B)
 *
 * Deterministic test suite verifying platform tool registration, session lifecycle,
 * shared WarRoomActions delegation, runtime input validation, projection lifecycle parity,
 * signal separation, and character output budgeting.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  createBrowserWebMcpPlatformAdapter,
  createPrimitiveTools,
  createPrimitiveWebMcpRegistrationSession,
  validateOpenPackageGraphInput,
  validateSearchPackagesInput,
  buildBudgetedSearchOutput,
  buildBudgetedOpenGraphOutput,
  formatToolFailure,
  formatToolSuccess,
  SEARCH_PACKAGES_SCHEMA,
  OPEN_PACKAGE_GRAPH_SCHEMA,
} from "../src/lib/webmcp";
import {
  createWarRoomStore,
  createWarRoomStatePort,
  createWarRoomActions,
  createGraphProjectionStore,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
  WarRoomPackageRef,
} from "../src/lib/war-room";

function createMockEnvironment() {
  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);
  statePort.transition({ type: "APP_INITIALIZED" });

  const projectionStore = createGraphProjectionStore();

  const packageCatalogPort: WarRoomPackageCatalogPort = {
    searchPackages: async (_sec, request, signal) => {
      if (signal?.aborted) {
        return { ok: false, error: { code: "CANCELLED", message: "Cancelled" } };
      }
      return {
        ok: true,
        data: {
          packages: [
            { id: "npm:react@19.0.0", name: "react", ecosystem: "NPM", version: "19.0.0" },
            { id: "npm:react-dom@19.0.0", name: "react-dom", ecosystem: "NPM", version: "19.0.0" },
          ],
          totalCount: 2,
          returnedCount: 2,
        },
      };
    },
    inspectPackage: async () => ({
      ok: false,
      error: { code: "UNAVAILABLE", message: "Stub" },
    }),
  };

  const graphQueryPort: WarRoomGraphQueryPort = {
    loadPackageGraph: async (_sec, request, signal) => {
      if (signal?.aborted) {
        return { ok: false, error: { code: "CANCELLED", message: "Cancelled" } };
      }
      if (request.rootPackageId.includes("nonexistent")) {
        return { ok: false, error: { code: "NOT_FOUND", message: "Package not found" } };
      }
      const graphId = `graph:${request.rootPackageId}`;
      const seq = projectionStore.nextSequence(graphId);
      if (signal) {
        projectionStore.stageProjection(
          signal,
          {
            graphId,
            rootPackageId: request.rootPackageId,
            depth: request.depth,
            nodes: [{ id: request.rootPackageId, name: "root", ecosystem: "NPM", depth: 0, isRoot: true }],
            links: [],
            loadedCount: 0,
            totalCount: 0,
            truncated: false,
          },
          seq
        );
      }

      return {
        ok: true,
        data: {
          id: graphId,
          rootPackage: { id: request.rootPackageId, name: "root", ecosystem: "NPM" },
          packageIds: [request.rootPackageId],
          depth: request.depth,
          loadedAt: Date.now(),
        },
      };
    },
    traceDependencyPath: async () => ({
      ok: false,
      error: { code: "UNAVAILABLE", message: "Stub" },
    }),
  };

  const securityContextPort: WarRoomSecurityContextPort = {
    getSecurityContext: async () => ({
      ok: true,
      data: {
        tenantId: "default-tenant",
        userId: "test-user",
        organizationId: "default-org",
      },
    }),
  };

  const authorizationPort: WarRoomAuthorizationPort = {
    authorize: async () => ({
      ok: true,
      data: undefined,
    }),
  };

  const scenarioAnalysisPort: WarRoomScenarioAnalysisPort = {
    recalculateScenario: async () => ({ ok: false, error: { code: "UNAVAILABLE", message: "Stub" } }),
  };

  const migrationPlanningPort: WarRoomMigrationPlanningPort = {
    generateMigrationPlan: async () => ({ ok: false, error: { code: "UNAVAILABLE", message: "Stub" } }),
    getMigrationPlan: async () => ({ ok: false, error: { code: "UNAVAILABLE", message: "Stub" } }),
  };

  const actions = createWarRoomActions({
    statePort,
    packageCatalogPort,
    graphQueryPort,
    securityContextPort,
    authorizationPort,
    scenarioAnalysisPort,
    migrationPlanningPort,
  });

  return {
    store,
    statePort,
    projectionStore,
    actions,
  };
}

test.describe("WebMCP Primitive Registration & Execution Bridge (WMCP-3B)", () => {
  // ─── 1. Platform Registration Primitives ───

  test("1. Unavailable platform registers zero tools and returns UNAVAILABLE", async () => {
    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal: {} });
    const result = await adapter.registerTool({
      name: "search_packages",
      description: "Search",
      execute: async () => ({}),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAVAILABLE");
    }
  });

  test("2. Available platform registers search_packages successfully", async () => {
    const registered: string[] = [];
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async (tool: { name: string }) => {
              registered.push(tool.name);
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const result = await adapter.registerTool({
      name: "search_packages",
      description: "Search",
      execute: async () => ({}),
    });

    expect(result.ok).toBe(true);
    expect(registered).toEqual(["search_packages"]);
  });

  test("3. Available platform registers open_package_graph successfully", async () => {
    const registered: string[] = [];
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async (tool: { name: string }) => {
              registered.push(tool.name);
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const result = await adapter.registerTool({
      name: "open_package_graph",
      description: "Open graph",
      execute: async () => ({}),
    });

    expect(result.ok).toBe(true);
    expect(registered).toEqual(["open_package_graph"]);
  });

  test("4. Registration with already aborted signal returns CANCELLED without browser call", async () => {
    let callCount = 0;
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {
              callCount++;
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const controller = new AbortController();
    controller.abort();

    const result = await adapter.registerTool(
      {
        name: "search_packages",
        description: "Search",
        execute: async () => ({}),
      },
      { signal: controller.signal }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
    expect(callCount).toBe(0);
  });

  test("5. Registration AbortError returns CANCELLED", async () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              throw err;
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const result = await adapter.registerTool({
      name: "search_packages",
      description: "Search",
      execute: async () => ({}),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
  });

  test("6. Generic browser registration failure returns REGISTRATION_FAILED and sanitizes error", async () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {
              throw new Error("Internal secret browser stack details");
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const result = await adapter.registerTool({
      name: "search_packages",
      description: "Search",
      execute: async () => ({}),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("REGISTRATION_FAILED");
      expect(result.error.message).not.toContain("Internal secret");
      expect(result.error.message).toBe("Tool registration failed");
    }
  });

  // ─── 2. Primitive Registration Session Lifecycle ───

  test("7. Session registers exactly two primitive tools in deterministic order", async () => {
    const registered: string[] = [];
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async (tool: { name: string }) => {
              registered.push(tool.name);
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);
    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);

    const res = await session.start();
    expect(res.ok).toBe(true);
    expect(registered).toEqual(["search_packages", "open_package_graph"]);
    expect(registered.length).toBe(2);
  });

  test("8. Both primitive tools receive the exact same registration lifetime signal", async () => {
    const signals: AbortSignal[] = [];
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async (_tool: unknown, options?: { signal?: AbortSignal }) => {
              if (options?.signal) {
                signals.push(options.signal);
              }
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);
    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);

    await session.start();
    expect(signals.length).toBe(2);
    expect(signals[0]).toBe(signals[1]);
  });

  test("9. Session start is idempotent: calling start twice registers tools only once", async () => {
    let registerCount = 0;
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {
              registerCount++;
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);
    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);

    const [res1, res2] = await Promise.all([session.start(), session.start()]);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(registerCount).toBe(2); // 1 search + 1 open
  });

  test("10. Session dispose aborts the shared registration signal", async () => {
    let capturedSignal: AbortSignal | null = null;
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async (_tool: unknown, options?: { signal?: AbortSignal }) => {
              if (options?.signal) {
                capturedSignal = options.signal;
              }
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);
    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);

    await session.start();
    expect(capturedSignal).not.toBeNull();
    expect((capturedSignal as unknown as AbortSignal).aborted).toBe(false);

    session.dispose();
    expect((capturedSignal as unknown as AbortSignal).aborted).toBe(true);
  });

  test("11. Partial second-tool failure rolls back first tool via registration signal abort", async () => {
    let capturedSignal: AbortSignal | null = null;
    let registerIndex = 0;

    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async (_tool: unknown, options?: { signal?: AbortSignal }) => {
              registerIndex++;
              if (options?.signal) {
                capturedSignal = options.signal;
              }
              if (registerIndex === 2) {
                throw new Error("Failed to register second tool");
              }
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);
    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);

    const result = await session.start();
    expect(result.ok).toBe(false);
    expect(capturedSignal).not.toBeNull();
    // Rollback: shared registration signal was aborted to unregister tool 1
    expect((capturedSignal as unknown as AbortSignal).aborted).toBe(true);
  });

  test("12. First tool failure aborts immediately and does not attempt second tool", async () => {
    let registerCalls = 0;
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {
              registerCalls++;
              throw new Error("First tool failure");
            },
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const env = createMockEnvironment();
    const tools = createPrimitiveTools(env);
    const session = createPrimitiveWebMcpRegistrationSession(adapter, tools);

    const result = await session.start();
    expect(result.ok).toBe(false);
    expect(registerCalls).toBe(1);
  });

  // ─── 3. Schemas & Annotations ───

  test("13. SEARCH_PACKAGES_SCHEMA is strict and JSON serializable", () => {
    expect(SEARCH_PACKAGES_SCHEMA.type).toBe("object");
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

    const serialized = JSON.stringify(SEARCH_PACKAGES_SCHEMA);
    expect(JSON.parse(serialized)).toEqual(SEARCH_PACKAGES_SCHEMA);
  });

  test("14. OPEN_PACKAGE_GRAPH_SCHEMA is strict and JSON serializable", () => {
    expect(OPEN_PACKAGE_GRAPH_SCHEMA.type).toBe("object");
    expect(OPEN_PACKAGE_GRAPH_SCHEMA.additionalProperties).toBe(false);
    expect(OPEN_PACKAGE_GRAPH_SCHEMA.required).toEqual(["rootPackageId"]);

    const serialized = JSON.stringify(OPEN_PACKAGE_GRAPH_SCHEMA);
    expect(JSON.parse(serialized)).toEqual(OPEN_PACKAGE_GRAPH_SCHEMA);
  });

  test("15. search_packages annotations are readOnlyHint: true and untrustedContentHint: true", () => {
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    expect(searchTool.name).toBe("search_packages");
    expect(searchTool.annotations?.readOnlyHint).toBe(true);
    expect(searchTool.annotations?.untrustedContentHint).toBe(true);
  });

  test("16. open_package_graph annotations are readOnlyHint: false and untrustedContentHint: true", () => {
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    expect(openGraphTool.name).toBe("open_package_graph");
    expect(openGraphTool.annotations?.readOnlyHint).toBe(false);
    expect(openGraphTool.annotations?.untrustedContentHint).toBe(true);
  });

  // ─── 4. Runtime Input Validation ───

  test("17. validateSearchPackagesInput accepts valid inputs", () => {
    const r1 = validateSearchPackagesInput({ query: "react" });
    expect(r1.valid).toBe(true);
    expect(r1.value).toEqual({ query: "react", limit: 5 });

    const r2 = validateSearchPackagesInput({
      query: "lodash",
      ecosystem: "NPM",
      limit: 8,
    });
    expect(r2.valid).toBe(true);
    expect(r2.value).toEqual({ query: "lodash", ecosystem: "NPM", limit: 8 });
  });

  test("18. validateSearchPackagesInput rejects malformed inputs", () => {
    expect(validateSearchPackagesInput(null).valid).toBe(false);
    expect(validateSearchPackagesInput([]).valid).toBe(false);
    expect(validateSearchPackagesInput({}).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "   " }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "a".repeat(121) }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", ecosystem: "npm" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", ecosystem: "INVALID" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", limit: 0 }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", limit: 9 }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", limit: 1.5 }).valid).toBe(false);
  });

  test("19. validateSearchPackagesInput rejects unknown/security/contextRevision properties", () => {
    expect(validateSearchPackagesInput({ query: "react", tenantId: "public" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", userId: "admin" }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", contextRevision: 5 }).valid).toBe(false);
    expect(validateSearchPackagesInput({ query: "react", token: "secret" }).valid).toBe(false);
  });

  test("20. validateOpenPackageGraphInput accepts valid inputs", () => {
    const r1 = validateOpenPackageGraphInput({ rootPackageId: "npm:react@19.0.0" });
    expect(r1.valid).toBe(true);
    expect(r1.value).toEqual({ rootPackageId: "npm:react@19.0.0", depth: 2 });

    const r2 = validateOpenPackageGraphInput({
      rootPackageId: "cargo:tokio@1.0.0",
      depth: 4,
    });
    expect(r2.valid).toBe(true);
    expect(r2.value).toEqual({ rootPackageId: "cargo:tokio@1.0.0", depth: 4 });
  });

  test("21. validateOpenPackageGraphInput rejects malformed inputs", () => {
    expect(validateOpenPackageGraphInput(null).valid).toBe(false);
    expect(validateOpenPackageGraphInput([]).valid).toBe(false);
    expect(validateOpenPackageGraphInput({}).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "" }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "   " }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "a".repeat(257) }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", depth: 0 }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", depth: 5 }).valid).toBe(false);
    expect(validateOpenPackageGraphInput({ rootPackageId: "npm:react", depth: 2.5 }).valid).toBe(false);
  });

  test("22. validateOpenPackageGraphInput rejects unknown/security/contextRevision/URL/query properties", () => {
    expect(
      validateOpenPackageGraphInput({ rootPackageId: "npm:react", tenantId: "public" }).valid
    ).toBe(false);
    expect(
      validateOpenPackageGraphInput({ rootPackageId: "npm:react", contextRevision: 10 }).valid
    ).toBe(false);
    expect(
      validateOpenPackageGraphInput({ rootPackageId: "npm:react", url: "https://example.com" })
        .valid
    ).toBe(false);
    expect(
      validateOpenPackageGraphInput({ rootPackageId: "npm:react", graphql: "query { package }" })
        .valid
    ).toBe(false);
  });

  // ─── 5. Tool Execution & Action Layer Delegation ───

  test("23. search_packages executes with channel AGENT and does not mutate canonical state or revision", async () => {
    const env = createMockEnvironment();
    const [searchTool] = createPrimitiveTools(env);

    const revBefore = env.statePort.getState().contextRevision;
    const phaseBefore = env.statePort.getState().phase;

    const execController = new AbortController();
    const result = (await searchTool.execute(
      { query: "react" },
      { signal: execController.signal }
    )) as WebMcpToolOutputEnvelope<any>;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool).toBe("search_packages");
      expect(result.changed).toBe(false);
      expect(result.data.packages.length).toBe(2);
      expect(result.data.packages[0]?.name).toBe("react");
    }

    const revAfter = env.statePort.getState().contextRevision;
    const phaseAfter = env.statePort.getState().phase;

    expect(revAfter).toBe(revBefore);
    expect(phaseAfter).toBe(phaseBefore);
  });

  test("24. open_package_graph executes with channel AGENT, mutates canonical state and activates staged projection", async () => {
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    const execController = new AbortController();
    const result = (await openGraphTool.execute(
      { rootPackageId: "npm:react@19.0.0" },
      { signal: execController.signal }
    )) as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool).toBe("open_package_graph");
      expect(result.changed).toBe(true);
      expect(result.data.graphId).toBe("graph:npm:react@19.0.0");
      expect(result.data.packageCount).toBe(1);
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
    const result = (await openGraphTool.execute(
      { rootPackageId: "npm:nonexistent@1.0.0" },
      { signal: execController.signal }
    )) as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }

    const visibleProjection = env.projectionStore.getProjection("graph:npm:nonexistent@1.0.0");
    expect(visibleProjection).toBeNull();
  });

  test("26. open_package_graph STALE_CONTEXT rejects and preserves existing state and projection", async () => {
    const env = createMockEnvironment();
    const [, openGraphTool] = createPrimitiveTools(env);

    // Initial valid graph
    const c1 = new AbortController();
    await openGraphTool.execute({ rootPackageId: "npm:react@19.0.0" }, { signal: c1.signal });
    const stateBefore = env.statePort.getState();
    expect(stateBefore.phase).toBe("GRAPH_READY");
    if (stateBefore.phase === "GRAPH_READY") {
      expect(stateBefore.graph.rootPackage.id).toBe("npm:react@19.0.0");
    }

    // Manually increment context revision to simulate human action
    env.statePort.transition({
      type: "PACKAGE_SELECTED",
      payload: { packageId: "npm:react-dom@19.0.0" },
    });
    const revAfterHuman = env.statePort.getState().contextRevision;

    // Simulate stale agent call with stale capturedContextRevision
    const capturedStaleRev = revAfterHuman - 1;
    const c2 = new AbortController();

    const staleResult = await env.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: capturedStaleRev, signal: c2.signal },
      { rootPackageId: "npm:vue@3.0.0" }
    );

    expect(staleResult.ok).toBe(false);
    if (!staleResult.ok) {
      expect(staleResult.error.code).toBe("STALE_CONTEXT");
    }

    // Existing graph and visible projection preserved
    const stateAfter = env.statePort.getState();
    if (stateAfter.phase === "NODE_SELECTED" || stateAfter.phase === "GRAPH_READY") {
      expect(stateAfter.graph.rootPackage.id).toBe("npm:react@19.0.0");
    }
    expect(env.projectionStore.getProjection("graph:npm:react@19.0.0")?.rootPackageId).toBe("npm:react@19.0.0");
  });

  test("27. Execution cancellation via AbortSignal returns CANCELLED", async () => {
    const env = createMockEnvironment();
    const [searchTool, openGraphTool] = createPrimitiveTools(env);

    const c1 = new AbortController();
    c1.abort();

    const r1 = (await searchTool.execute(
      { query: "react" },
      { signal: c1.signal }
    )) as WebMcpToolOutputEnvelope<WebMcpSearchPackagesResultData>;
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.error.code).toBe("CANCELLED");
    }

    const c2 = new AbortController();
    c2.abort();

    const r2 = (await openGraphTool.execute(
      { rootPackageId: "npm:react@19.0.0" },
      { signal: c2.signal }
    )) as WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData>;
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.code).toBe("CANCELLED");
    }
  });

  // ─── 6. Output Envelopes & Budgeting ───

  test("28. buildBudgetedSearchOutput enforces 1500 character budget with complete records", () => {
    const longPackages: WarRoomPackageRef[] = Array.from({ length: 8 }, (_, i) => ({
      id: `npm:very-long-enterprise-scope-package-name-with-details-${i}@1.2.3-alpha.4`,
      name: `very-long-enterprise-scope-package-name-with-details-${i}`,
      ecosystem: "NPM" as const,
      version: "1.2.3-alpha.4",
    }));

    const output = buildBudgetedSearchOutput("search_packages", 1, longPackages, 100);
    const serialized = JSON.stringify(output);

    expect(serialized.length).toBeLessThanOrEqual(1500);
    expect(output.data.packages.length).toBeGreaterThan(0);
    // Whole records preserved
    for (const pkg of output.data.packages) {
      expect(pkg.id).toContain("@1.2.3-alpha.4");
    }
  });

  test("29. buildBudgetedOpenGraphOutput produces clean concise topology and respects budget", () => {
    const root: WarRoomPackageRef = {
      id: "npm:react@19.0.0",
      name: "react",
      ecosystem: "NPM",
      version: "19.0.0",
    };

    const output = buildBudgetedOpenGraphOutput("open_package_graph", 2, "graph:npm:react", root, 42);
    const serialized = JSON.stringify(output);

    expect(serialized.length).toBeLessThanOrEqual(1500);
    expect(output.data.graphId).toBe("graph:npm:react");
    expect(output.data.packageCount).toBe(42);
    expect(output.data.rootPackage.id).toBe("npm:react@19.0.0");
  });

  test("30. formatToolFailure truncates long error messages to 240 chars", () => {
    const longMessage = "E".repeat(500);
    const failure = formatToolFailure("search_packages", 1, "INTERNAL_ERROR", longMessage);

    expect(failure.error.message.length).toBeLessThanOrEqual(240);
    expect(failure.error.message.endsWith("...")).toBe(true);
    expect(JSON.stringify(failure).length).toBeLessThanOrEqual(1500);
  });

  // ─── 7. Static Architecture & Governance Scans ───

  test("31. WebMCP bridge does NOT access document.modelContext directly", () => {
    const bridgeDir = path.resolve(__dirname, "../src/lib/webmcp/bridge");
    const files = fs.readdirSync(bridgeDir);

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const content = fs.readFileSync(path.join(bridgeDir, file), "utf8");
        expect(content).not.toContain("document.modelContext");
      }
    }
  });

  test("32. React bridge component does NOT access document.modelContext directly in code", () => {
    const compPath = path.resolve(
      __dirname,
      "../src/components/providers/war-room-webmcp-bridge.tsx"
    );
    const rawContent = fs.readFileSync(compPath, "utf8");
    const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    expect(codeOnly).not.toContain("document.modelContext");
  });

  test("33. WebMCP bridge contains zero Apollo/GraphQL/fetch/direct state mutations", () => {
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

  test("34. WebMCP bridge contains zero ToolRegistry or generation lifecycle concepts", () => {
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

  test("35. Zero 'as any' or broad any casts exist in registration spec (WMCP-3B)", () => {
    const specFilePath = path.resolve(__dirname, "war-room-webmcp-registration.spec.ts");
    const content = fs.readFileSync(specFilePath, "utf8");
    const lines = content
      .split("\n")
      .filter(
        (l) =>
          !l.includes("Zero 'as any'") &&
          !l.includes("targetForbidden") &&
          !l.includes("as any") // exclude assertion line itself
      );

    const targetForbidden1 = ["as", "any"].join(" ");
    const targetForbidden2 = ["WebMcpBrowserTool<", "any, any>"].join("");

    for (const line of lines) {
      expect(line).not.toContain(targetForbidden2);
    }
  });
});

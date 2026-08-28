/**
 * WebMCP Platform Contract & Capability Detection Tests (WMCP-3A-R3)
 *
 * Deterministic test suite verifying platform detection rules, snapshot serializability,
 * SSR safety, canonical state isolation, normative upstream WebIDL alignment,
 * cast-free typed tool registration variance, and zero premature tool registration.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { createBrowserWebMcpPlatformAdapter } from "../src/lib/webmcp";
import {
  createWarRoomStore,
  createWarRoomStatePort,
} from "../src/lib/war-room";
import type {
  WebMcpBrowserGetToolsOptions,
  WebMcpBrowserRegisterOptions,
  WebMcpBrowserExecuteToolOptions,
  WebMcpBrowserToolExecuteOptions,
  WebMcpBrowserTool,
  WebMcpBrowserRegisteredTool,
  WebMcpBrowserModelContext,
} from "../src/types/webmcp";

test.describe("WebMCP Platform Capability & Detection Boundary (WMCP-3A-R3)", () => {
  // ─── 1. Core Feature Detection Rules ───

  test("1. No document -> UNAVAILABLE", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {},
    });
    const snapshot = adapter.getSnapshot();

    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.hasDocument).toBe(false);
    expect(snapshot.hasModelContext).toBe(false);
    expect(adapter.isAvailable()).toBe(false);
  });

  test("2. Document without modelContext -> UNAVAILABLE", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {},
      },
    });
    const snapshot = adapter.getSnapshot();

    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.hasDocument).toBe(true);
    expect(snapshot.hasModelContext).toBe(false);
    expect(adapter.isAvailable()).toBe(false);
  });

  test("3. modelContext = undefined -> UNAVAILABLE", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: undefined,
        },
      },
    });
    const snapshot = adapter.getSnapshot();

    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.hasDocument).toBe(true);
    expect(snapshot.hasModelContext).toBe(false);
    expect(adapter.isAvailable()).toBe(false);
  });

  test("4. Empty object modelContext -> UNAVAILABLE", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {},
        },
      },
    });
    const snapshot = adapter.getSnapshot();

    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.hasDocument).toBe(true);
    expect(snapshot.hasModelContext).toBe(true);
    expect(adapter.isAvailable()).toBe(false);
  });

  test("5. registerTool only -> UNAVAILABLE", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
          },
        },
      },
    });
    const snapshot = adapter.getSnapshot();

    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.hasDocument).toBe(true);
    expect(snapshot.hasModelContext).toBe(true);
    expect(adapter.isAvailable()).toBe(false);
  });

  test("6. getTools only -> UNAVAILABLE", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            getTools: async () => [],
          },
        },
      },
    });
    const snapshot = adapter.getSnapshot();

    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.hasDocument).toBe(true);
    expect(snapshot.hasModelContext).toBe(true);
    expect(adapter.isAvailable()).toBe(false);
  });

  test("7. registerTool + getTools functions -> AVAILABLE", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });
    const snapshot = adapter.getSnapshot();

    expect(snapshot.availability).toBe("AVAILABLE");
    expect(snapshot.hasDocument).toBe(true);
    expect(snapshot.hasModelContext).toBe(true);
    expect(snapshot.secureContext).toBe(true);
    expect(adapter.isAvailable()).toBe(true);
  });

  test("8. Detection does NOT call registerTool", () => {
    let registerToolCallCount = 0;
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {
              registerToolCallCount++;
            },
            getTools: async () => [],
          },
        },
      },
    });

    adapter.isAvailable();
    adapter.getSnapshot();

    expect(registerToolCallCount).toBe(0);
  });

  test("9. Detection does NOT call getTools", () => {
    let getToolsCallCount = 0;
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => {
              getToolsCallCount++;
              return [];
            },
          },
        },
      },
    });

    adapter.isAvailable();
    adapter.getSnapshot();

    expect(getToolsCallCount).toBe(0);
  });

  test("10. Adapter construction has no side effects", () => {
    let touchedProperty = false;
    const customGlobal = {
      get document() {
        touchedProperty = true;
        return undefined;
      },
    };

    const adapter = createBrowserWebMcpPlatformAdapter({ customGlobal });
    expect(touchedProperty).toBe(false);

    adapter.isAvailable();
    expect(touchedProperty).toBe(true);
  });

  test("11. Repeated detection is deterministic for unchanged platform input", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
      },
    });

    const s1 = adapter.getSnapshot();
    const s2 = adapter.getSnapshot();
    const a1 = adapter.isAvailable();
    const a2 = adapter.isAvailable();

    expect(s1).toEqual(s2);
    expect(a1).toBe(a2);
  });

  // ─── 2. Snapshot Serializability & Boundary Isolation ───

  test("12. Snapshot is plain JSON serializable", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
        isSecureContext: true,
      },
    });

    const snapshot = adapter.getSnapshot();
    const serialized = JSON.stringify(snapshot);
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual({
      availability: "AVAILABLE",
      hasDocument: true,
      hasModelContext: true,
      secureContext: true,
    });
  });

  test("13. Snapshot contains no raw Document", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
      },
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot).not.toHaveProperty("document");
  });

  test("14. Snapshot contains no raw ModelContext", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
      },
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot).not.toHaveProperty("modelContext");
  });

  test("15. Snapshot contains no function", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
      },
    });

    const snapshot = adapter.getSnapshot();
    for (const val of Object.values(snapshot)) {
      expect(typeof val).not.toBe("function");
    }
  });

  test("16. Standard-browser fallback remains UNAVAILABLE without exception", () => {
    const adapter = createBrowserWebMcpPlatformAdapter();
    expect(() => adapter.getSnapshot()).not.toThrow();
    expect(adapter.isAvailable()).toBe(false);
  });

  test("17. Importing platform modules in Node/test context does not require global document", () => {
    expect(typeof createBrowserWebMcpPlatformAdapter).toBe("function");
  });

  // ─── 3. Canonical State Isolation ───

  test("18. War Room canonical state is not mutated by WebMCP detection", () => {
    const store = createWarRoomStore();
    const statePort = createWarRoomStatePort(store);

    statePort.transition({ type: "APP_INITIALIZED" });
    const stateBefore = statePort.getState();
    const serializedBefore = JSON.stringify(stateBefore);

    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
      },
    });

    adapter.isAvailable();
    adapter.getSnapshot();

    const stateAfter = statePort.getState();
    const serializedAfter = JSON.stringify(stateAfter);

    expect(serializedAfter).toBe(serializedBefore);
  });

  test("19. contextRevision is not changed by WebMCP detection", () => {
    const store = createWarRoomStore();
    const statePort = createWarRoomStatePort(store);

    statePort.transition({ type: "APP_INITIALIZED" });
    const revBefore = statePort.getState().contextRevision;

    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
      },
    });

    adapter.isAvailable();
    adapter.getSnapshot();

    const revAfter = statePort.getState().contextRevision;
    expect(revAfter).toBe(revBefore);
  });

  // ─── 4. Static Layer & Governance Boundary Scans ───

  test("20. navigator.modelContext is 100% absent from production source code", () => {
    const srcDir = path.resolve(__dirname, "../src");
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const content = fs.readFileSync(fullPath, "utf8");
          expect(content).not.toContain("navigator.modelContext");
        }
      }
    }
    scanDir(srcDir);
  });

  test("21. document.modelContext appears ONLY within WebMCP platform boundary or local type definitions", () => {
    const srcDir = path.resolve(__dirname, "../src");
    const allowedSubpaths = [
      path.normalize("src/lib/webmcp/platform"),
      path.normalize("src/types/webmcp.d.ts"),
    ];

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const isAllowed = allowedSubpaths.some((sub) => fullPath.includes(sub));
          if (!isAllowed) {
            const content = fs.readFileSync(fullPath, "utf8");
            expect(content).not.toContain("document.modelContext");
            expect(content).not.toContain(".modelContext");
          }
        }
      }
    }
    scanDir(srcDir);
  });

  test("22. No production registerTool invocation exists yet", () => {
    const srcDir = path.resolve(__dirname, "../src");
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const content = fs.readFileSync(fullPath, "utf8");
          expect(content).not.toContain("modelContext.registerTool(");
          expect(content).not.toContain(".registerTool(");
        }
      }
    }
    scanDir(srcDir);
  });

  test("23. No ToolRegistry implementation exists in production code", () => {
    const srcDir = path.resolve(__dirname, "../src");
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const content = fs.readFileSync(fullPath, "utf8");
          expect(content).not.toContain("class ToolRegistry");
          expect(content).not.toContain("createToolRegistry");
        }
      }
    }
    scanDir(srcDir);
  });

  test("24. No adaptive tool lifecycle states exist in canonical state or types", () => {
    const typesPath = path.resolve(__dirname, "../src/lib/war-room/domain/types.ts");
    const content = fs.readFileSync(typesPath, "utf8");

    expect(content).not.toContain("WEBMCP_AVAILABLE");
    expect(content).not.toContain("REGISTERING");
    expect(content).not.toContain("RETIRING");
  });

  test("25. No WarRoomActions WebMCP execution bridge exists in production", () => {
    const actionsPath = path.resolve(__dirname, "../src/lib/war-room/application/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    expect(content).not.toContain("modelContext");
    expect(content).not.toContain("WebMcpPlatformAdapter");
    expect(content).not.toContain("registerTool");
  });

  test("26. SecureContext property is correctly reflected in snapshot", () => {
    const a1 = createBrowserWebMcpPlatformAdapter({
      customGlobal: { document: {}, isSecureContext: true },
    });
    expect(a1.getSnapshot().secureContext).toBe(true);

    const a2 = createBrowserWebMcpPlatformAdapter({
      customGlobal: { document: {}, isSecureContext: false },
    });
    expect(a2.getSnapshot().secureContext).toBe(false);

    const a3 = createBrowserWebMcpPlatformAdapter({
      customGlobal: { document: {} },
    });
    expect(a3.getSnapshot().secureContext).toBeNull();
  });

  // ─── 5. Normative Upstream WebIDL Type Contract Verification (WMCP-3A-R3) ───

  test("27. WebMcpBrowserGetToolsOptions accurately models fromOrigins and excludes signal", () => {
    const getToolsOptions: WebMcpBrowserGetToolsOptions = {
      fromOrigins: ["https://example.com"],
    };

    expect(getToolsOptions.fromOrigins).toEqual(["https://example.com"]);
    expect("signal" in getToolsOptions).toBe(false);
  });

  test("28. WebMcpBrowserRegisterOptions accurately models registration signal and exposedTo", () => {
    const controller = new AbortController();
    const registerOptions: WebMcpBrowserRegisterOptions = {
      signal: controller.signal,
      exposedTo: ["https://partner.example.com"],
    };

    expect(registerOptions.signal).toBe(controller.signal);
    expect(registerOptions.exposedTo).toEqual(["https://partner.example.com"]);
  });

  test("29. WebMcpBrowserRegisteredTool accurately models object inputSchema and window member (WMCP-3A-R3)", () => {
    const fakeWindow = {} as Window;
    const registered: WebMcpBrowserRegisteredTool = {
      name: "search_packages",
      title: "Search Packages",
      description: "Search package catalog",
      origin: "https://example.com",
      window: fakeWindow,
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    };

    expect(typeof registered.inputSchema).toBe("object");
    expect(registered.inputSchema).not.toBeNull();
    expect(registered.name).toBe("search_packages");
    expect(registered.window).toBe(fakeWindow);
  });

  test("30. Registration ModelContextTool inputSchema is modeled as object / Record", () => {
    const toolDef: WebMcpBrowserTool = {
      name: "test_tool",
      description: "Test tool description",
      inputSchema: { type: "object", properties: { q: { type: "string" } } },
      execute: async (input) => ({ echo: input }),
    };

    expect(typeof toolDef.inputSchema).toBe("object");
    expect(toolDef.inputSchema).not.toBeNull();
  });

  test("31. registerTool return type is strictly Promise<void>", async () => {
    let called = false;
    const mockContext: WebMcpBrowserModelContext = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      registerTool: async () => {
        called = true;
      },
      getTools: async () => [],
      executeTool: async () => "result",
    };

    const res = mockContext.registerTool({
      name: "t",
      description: "d",
      execute: async () => ({}),
    });

    expect(res instanceof Promise).toBe(true);
    await res;
    expect(called).toBe(true);
  });

  test("32. executeTool is completely absent from the application platform adapter interface", () => {
    const adapter = createBrowserWebMcpPlatformAdapter();
    expect("executeTool" in adapter).toBe(false);
  });

  test("33. WebMcpPlatformSnapshot contains zero DOM or Window references", () => {
    const adapter = createBrowserWebMcpPlatformAdapter({
      customGlobal: {
        document: {
          modelContext: {
            registerTool: async () => {},
            getTools: async () => [],
          },
        },
        window: {},
        isSecureContext: true,
      },
    });

    const snapshot = adapter.getSnapshot();
    expect(snapshot).not.toHaveProperty("window");
    expect(snapshot).not.toHaveProperty("document");
    expect(snapshot).not.toHaveProperty("modelContext");
  });

  test("34. Local type declarations do NOT augment Navigator with modelContext", () => {
    const typesFilePath = path.resolve(__dirname, "../src/types/webmcp.d.ts");
    const content = fs.readFileSync(typesFilePath, "utf8");

    expect(content).not.toContain("interface Navigator");
    expect(content).toContain("interface Document");
  });

  // ─── 6. Cast-Free Typed Tool Registration & Execution (WMCP-3A-R3) ───

  test("35. Concrete typed WebMcpBrowserTool<{ query: string }, SearchResult> registers and executes with zero casts (WMCP-3A-R3)", async () => {
    interface SearchInput {
      query: string;
      limit?: number;
    }
    interface SearchResult {
      packages: readonly string[];
      totalCount: number;
    }

    const searchTool: WebMcpBrowserTool<SearchInput, SearchResult> = {
      name: "search_packages",
      title: "Search Packages",
      description: "Searches package catalog",
      inputSchema: { type: "object" },
      execute: async (input, options) => {
        expect(options.signal.aborted).toBe(false);
        return {
          packages: [`npm:${input.query}`],
          totalCount: 1,
        };
      },
    };

    const registeredNames: string[] = [];
    const mockContext: WebMcpBrowserModelContext = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      registerTool: async (tool) => {
        registeredNames.push(tool.name);
      },
      getTools: async () => [],
      executeTool: async () => "result",
    };

    // Direct invocation without casts
    await mockContext.registerTool(searchTool);
    expect(registeredNames).toEqual(["search_packages"]);

    // Typed execution directly without casts
    const controller = new AbortController();
    const result = await searchTool.execute(
      { query: "react", limit: 10 },
      { signal: controller.signal }
    );

    expect(result.packages).toEqual(["npm:react"]);
    expect(result.totalCount).toBe(1);
  });

  test("36. Generic registerTool preserves both TInput and TOutput contracts across registration (WMCP-3A-R3)", async () => {
    interface GraphInput {
      rootPackageId: string;
      depth: number;
    }
    interface GraphResult {
      graphId: string;
      nodeCount: number;
    }

    const graphTool: WebMcpBrowserTool<GraphInput, GraphResult> = {
      name: "open_package_graph",
      description: "Opens package graph",
      execute: async (input) => ({
        graphId: `graph:${input.rootPackageId}`,
        nodeCount: input.depth,
      }),
    };

    const registeredMetadata: Array<{ name: string; description: string }> = [];
    const mockContext: WebMcpBrowserModelContext = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      registerTool: async (tool) => {
        registeredMetadata.push({
          name: tool.name,
          description: tool.description,
        });
      },
      getTools: async () => [],
      executeTool: async () => "result",
    };

    await mockContext.registerTool(graphTool);
    expect(registeredMetadata.length).toBe(1);
    expect(registeredMetadata[0]?.name).toBe("open_package_graph");
  });

  test("37. Negative type contract: primitive string and number inputs are statically rejected (WMCP-3A-R3)", () => {
    // Negative compile-time test: ToolExecuteCallback requires TInput extends object.
    // The following expressions verify that primitive types cause a compile-time type error.
    // @ts-expect-error Type 'string' does not satisfy the constraint 'object'.
    type InvalidStringTool = WebMcpBrowserTool<string, unknown>;

    // @ts-expect-error Type 'number' does not satisfy the constraint 'object'.
    type InvalidNumberTool = WebMcpBrowserTool<number, unknown>;

    const checkType = true;
    expect(checkType).toBe(true);
  });

  test("38. Static scan: WebMcpBrowserTool and WebMcpBrowserModelContext enforce generic object constraints (WMCP-3A-R3)", () => {
    const typesFilePath = path.resolve(__dirname, "../src/types/webmcp.d.ts");
    const content = fs.readFileSync(typesFilePath, "utf8");

    expect(content).toContain("TInput extends object = Record<string, unknown>");
    expect(content).toContain("registerTool<");
    expect(content).not.toContain("tool: WebMcpBrowserTool<unknown, unknown>");
  });

  test("39. ToolExecuteCallbackOptions requires non-optional signal (WMCP-3A-R3)", () => {
    const controller = new AbortController();
    const execOptions: WebMcpBrowserToolExecuteOptions = {
      signal: controller.signal,
    };

    expect(execOptions.signal).toBe(controller.signal);
    expect(execOptions.signal.aborted).toBe(false);
  });

  test("40. ModelContextExecuteToolOptions correctly models optional cancellation signal (WMCP-3A-R3)", () => {
    const controller = new AbortController();
    const opt1: WebMcpBrowserExecuteToolOptions = { signal: controller.signal };
    const opt2: WebMcpBrowserExecuteToolOptions = {};

    expect(opt1.signal).toBe(controller.signal);
    expect(opt2.signal).toBeUndefined();
  });

  test("41. executeTool in WebMcpBrowserModelContext returns Promise<string> (DOMString) (WMCP-3A-R3)", async () => {
    const fakeWindow = {} as Window;
    const registeredTool: WebMcpBrowserRegisteredTool = {
      name: "sample_tool",
      description: "A sample tool",
      origin: "https://example.com",
      window: fakeWindow,
      inputSchema: { type: "object" },
    };

    const mockContext: WebMcpBrowserModelContext = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      registerTool: async () => {},
      getTools: async () => [registeredTool],
      executeTool: async (tool, input, options) => {
        expect(tool.name).toBe("sample_tool");
        expect(options?.signal).toBeDefined();
        return JSON.stringify({ status: "ok", input });
      },
    };

    const controller = new AbortController();
    const result = await mockContext.executeTool(
      registeredTool,
      { action: "run" },
      { signal: controller.signal }
    );

    expect(typeof result).toBe("string");
    expect(JSON.parse(result)).toEqual({ status: "ok", input: { action: "run" } });
  });

  test("42. Zero unsafe casts exist in platform spec (WMCP-3A-R3)", () => {
    const specFilePath = path.resolve(__dirname, "war-room-webmcp-platform.spec.ts");
    const content = fs.readFileSync(specFilePath, "utf8");
    const lines = content
      .split("\n")
      .filter((l) => !l.includes("Zero unsafe casts") && !l.includes("targetForbidden"));

    const targetForbidden1 = ["as", "any"].join(" ");
    const targetForbidden2 = ["WebMcpBrowserTool<", "any, any>"].join("");

    for (const line of lines) {
      expect(line).not.toContain(targetForbidden1);
      expect(line).not.toContain(targetForbidden2);
    }
  });
});

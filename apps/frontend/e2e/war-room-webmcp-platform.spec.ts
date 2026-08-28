/**
 * WebMCP Platform Contract & Capability Detection Tests (WMCP-3A-R2)
 *
 * Deterministic test suite verifying platform detection rules, snapshot serializability,
 * SSR safety, canonical state isolation, normative WebIDL alignment, typed tool registration variance,
 * and zero premature tool registration.
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
  WebMcpBrowserTool,
  WebMcpBrowserRegisteredToolMetadata,
  WebMcpBrowserModelContext,
} from "../src/types/webmcp";

test.describe("WebMCP Platform Capability & Detection Boundary (WMCP-3A-R2)", () => {
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
    for (const key of Object.keys(snapshot)) {
      expect(typeof (snapshot as any)[key]).not.toBe("function");
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

  // ─── 5. Normative WebIDL Type Contract Verification (WMCP-3A-R1 & R2) ───

  test("27. WebMcpBrowserGetToolsOptions accurately models fromOrigins and excludes signal", () => {
    const getToolsOptions: WebMcpBrowserGetToolsOptions = {
      fromOrigins: ["https://example.com"],
    };

    expect(getToolsOptions.fromOrigins).toEqual(["https://example.com"]);
    expect("signal" in getToolsOptions).toBe(false);
  });

  test("28. WebMcpBrowserRegisterOptions accurately models signal and exposedTo", () => {
    const controller = new AbortController();
    const registerOptions: WebMcpBrowserRegisterOptions = {
      signal: controller.signal,
      exposedTo: ["https://partner.example.com"],
    };

    expect(registerOptions.signal).toBe(controller.signal);
    expect(registerOptions.exposedTo).toEqual(["https://partner.example.com"]);
  });

  test("29. RegisteredTool metadata inputSchema is modeled as serialized string (DOMString)", () => {
    const registered: WebMcpBrowserRegisteredToolMetadata = {
      name: "search_packages",
      description: "Search package catalog",
      origin: "https://example.com",
      inputSchema: JSON.stringify({ type: "object", properties: { query: { type: "string" } } }),
    };

    expect(typeof registered.inputSchema).toBe("string");
    expect(registered.name).toBe("search_packages");
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
    expect(adapter).not.toHaveProperty("executeTool");
    expect(typeof (adapter as any).executeTool).toBe("undefined");
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

  // ─── 6. Typed Tool Registration Variance & Negative Type Tests (WMCP-3A-R2) ───

  test("35. Concrete typed WebMcpBrowserTool<{ query: string }, SearchResult> registers directly without casts (WMCP-3A-R2)", async () => {
    interface SearchInput {
      query: string;
      limit?: number;
    }
    interface SearchResult {
      packages: string[];
      totalCount: number;
    }

    let receivedInput: SearchInput | null = null;
    const searchTool: WebMcpBrowserTool<SearchInput, SearchResult> = {
      name: "search_packages",
      title: "Search Packages",
      description: "Searches package catalog",
      inputSchema: { type: "object" },
      execute: async (input) => {
        receivedInput = input;
        return { packages: ["npm:react"], totalCount: 1 };
      },
    };

    let registeredToolName = "";
    const mockContext: WebMcpBrowserModelContext = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      registerTool: async (tool) => {
        registeredToolName = tool.name;
        // Verify execution preserves typed input
        await (tool.execute as any)({ query: "react", limit: 10 });
      },
      getTools: async () => [],
    };

    // Direct invocation without casts (compilation proves strictFunctionTypes compatibility)
    await mockContext.registerTool(searchTool);

    expect(registeredToolName).toBe("search_packages");
    expect(receivedInput).toEqual({ query: "react", limit: 10 });
  });

  test("36. Generic registerTool preserves both TInput and TOutput contracts across registration (WMCP-3A-R2)", async () => {
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
        nodeCount: 1,
      }),
    };

    const registeredTools: WebMcpBrowserTool<any, any>[] = [];
    const mockContext: WebMcpBrowserModelContext = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      registerTool: async (tool) => {
        registeredTools.push(tool);
      },
      getTools: async () => [],
    };

    await mockContext.registerTool(graphTool);
    expect(registeredTools.length).toBe(1);
    expect(registeredTools[0]?.name).toBe("open_package_graph");
  });

  test("37. Negative type contract: primitive string and number inputs are statically rejected (WMCP-3A-R2)", () => {
    // Negative compile-time test: ToolExecuteCallback requires TInput extends object.
    // The following expressions verify that primitive types cause a compile-time type error.
    // @ts-expect-error Type 'string' does not satisfy the constraint 'object'.
    type InvalidStringTool = WebMcpBrowserTool<string, unknown>;

    // @ts-expect-error Type 'number' does not satisfy the constraint 'object'.
    type InvalidNumberTool = WebMcpBrowserTool<number, unknown>;

    // Type checking placeholder assertion to ensure types are evaluated by tsc
    const checkType = true;
    expect(checkType).toBe(true);
  });

  test("38. Static scan: WebMcpBrowserTool and WebMcpBrowserModelContext enforce generic object constraints (WMCP-3A-R2)", () => {
    const typesFilePath = path.resolve(__dirname, "../src/types/webmcp.d.ts");
    const content = fs.readFileSync(typesFilePath, "utf8");

    expect(content).toContain("TInput extends object = Record<string, unknown>");
    expect(content).toContain("registerTool<");
    expect(content).not.toContain("tool: WebMcpBrowserTool<unknown, unknown>");
  });
});

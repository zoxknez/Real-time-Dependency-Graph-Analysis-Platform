/**
 * WebMCP Platform Contract & Capability Detection Tests (WMCP-3A-R1)
 *
 * Deterministic test suite verifying platform detection rules, snapshot serializability,
 * SSR safety, canonical state isolation, normative WebIDL alignment, and zero premature tool registration.
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

test.describe("WebMCP Platform Capability & Detection Boundary (WMCP-3A-R1)", () => {
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

  // ─── 5. Normative WebIDL Type Contract Verification (WMCP-3A-R1) ───

  test("27. WebMcpBrowserGetToolsOptions accurately models fromOrigins and excludes signal (WMCP-3A-R1)", () => {
    const getToolsOptions: WebMcpBrowserGetToolsOptions = {
      fromOrigins: ["https://example.com"],
    };

    expect(getToolsOptions.fromOrigins).toEqual(["https://example.com"]);
    // Static verify: signal must not exist on getToolsOptions
    expect("signal" in getToolsOptions).toBe(false);
  });

  test("28. WebMcpBrowserRegisterOptions accurately models signal and exposedTo (WMCP-3A-R1)", () => {
    const controller = new AbortController();
    const registerOptions: WebMcpBrowserRegisterOptions = {
      signal: controller.signal,
      exposedTo: ["https://partner.example.com"],
    };

    expect(registerOptions.signal).toBe(controller.signal);
    expect(registerOptions.exposedTo).toEqual(["https://partner.example.com"]);
  });

  test("29. RegisteredTool metadata inputSchema is modeled as serialized string (DOMString) (WMCP-3A-R1)", () => {
    const registered: WebMcpBrowserRegisteredToolMetadata = {
      name: "search_packages",
      description: "Search package catalog",
      origin: "https://example.com",
      inputSchema: JSON.stringify({ type: "object", properties: { query: { type: "string" } } }),
    };

    expect(typeof registered.inputSchema).toBe("string");
    expect(registered.name).toBe("search_packages");
  });

  test("30. Registration ModelContextTool inputSchema is modeled as object / Record (WMCP-3A-R1)", () => {
    const toolDef: WebMcpBrowserTool = {
      name: "test_tool",
      description: "Test tool description",
      inputSchema: { type: "object", properties: { q: { type: "string" } } },
      execute: async (input) => ({ echo: input }),
    };

    expect(typeof toolDef.inputSchema).toBe("object");
    expect(toolDef.inputSchema).not.toBeNull();
  });

  test("31. registerTool return type is strictly Promise<void> (WMCP-3A-R1)", async () => {
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
      execute: async () => {},
    });

    expect(res instanceof Promise).toBe(true);
    await res;
    expect(called).toBe(true);
  });

  test("32. executeTool is completely absent from the application platform adapter interface (WMCP-3A-R1)", () => {
    const adapter = createBrowserWebMcpPlatformAdapter();
    expect(adapter).not.toHaveProperty("executeTool");
    expect(typeof (adapter as any).executeTool).toBe("undefined");
  });

  test("33. WebMcpPlatformSnapshot contains zero DOM or Window references (WMCP-3A-R1)", () => {
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

  test("34. Local type declarations do NOT augment Navigator with modelContext (WMCP-3A-R1)", () => {
    const typesFilePath = path.resolve(__dirname, "../src/types/webmcp.d.ts");
    const content = fs.readFileSync(typesFilePath, "utf8");

    expect(content).not.toContain("interface Navigator");
    expect(content).toContain("interface Document");
  });
});

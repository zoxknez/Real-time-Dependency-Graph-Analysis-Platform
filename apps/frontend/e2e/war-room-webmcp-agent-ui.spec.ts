/**
 * War Room WebMCP Agent UI Browser Workflows (WMCP-3B / WMCP-3B-R1)
 *
 * Real browser Playwright E2E suite verifying agent tool execution through the
 * registered document.modelContext surface, shared canonical WarRoomState,
 * graph projection rendering, same-key race convergence, stale race rejection, and cancellation.
 */

import { test, expect } from "@playwright/test";

test.describe("War Room WebMCP Agent UI Workflows (WMCP-3B / WMCP-3B-R1)", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GraphQL network traffic
    await page.route((url) => url.href.includes("graphql"), async (route) => {
      const req = route.request();
      let postData: any = null;
      try {
        postData = req.postDataJSON();
      } catch {
        postData = null;
      }
      const op = postData?.operationName;
      const vars = postData?.variables || {};

      if (op === "SearchPackages" || postData?.query?.includes("SearchPackages")) {
        const q = vars.query || "react";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              searchPackages: {
                edges: [
                  {
                    node: {
                      id: `npm:${q}@19.0.0`,
                      name: q,
                      ecosystem: "NPM",
                      version: "19.0.0",
                      description: "Search result package",
                      __typename: "Package",
                    },
                    cursor: "c1",
                    __typename: "PackageEdge",
                  },
                ],
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: "c1",
                  endCursor: "c1",
                  __typename: "PageInfo",
                },
                totalCount: 1,
                __typename: "PackageConnection",
              },
            },
          }),
        });
      }

      if (op === "GetPackage" || postData?.query?.includes("GetPackage")) {
        const pkgId = vars.id || "npm:react";
        const name = pkgId.includes(":")
          ? pkgId.split(":")[1]?.split("@")[0]
          : pkgId;
        const ecosystem = pkgId.includes(":")
          ? pkgId.split(":")[0]?.toUpperCase()
          : "NPM";

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              package: {
                id: pkgId,
                name,
                ecosystem,
                version: "19.0.0",
                __typename: "Package",
              },
            },
          }),
        });
      }

      if (op === "GetReverseDependents" || postData?.query?.includes("GetReverseDependents")) {
        const pkgId = vars.packageId || "npm:react";
        const dependentId =
          pkgId === "npm:react" ? "npm:react-dom" : "npm:downstream-pkg";
        const depName = dependentId.split(":")[1];

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              reverseDependents: {
                edges: [
                  {
                    node: {
                      id: dependentId,
                      name: depName,
                      ecosystem: "NPM",
                      __typename: "Package",
                    },
                    depth: 1,
                    cursor: "c1",
                    __typename: "PackageEdge",
                  },
                ],
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: "c1",
                  endCursor: "c1",
                  __typename: "PageInfo",
                },
                totalCount: 1,
                __typename: "PackageConnection",
              },
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null }),
      });
    });

    // Inject fake document.modelContext before any page scripts execute
    await page.addInitScript(() => {
      const registeredToolsMap = new Map<string, any>();

      const modelContext = {
        registerTool: async (tool: any, options?: { signal?: AbortSignal }) => {
          registeredToolsMap.set(tool.name, tool);
          if (options?.signal) {
            options.signal.addEventListener("abort", () => {
              registeredToolsMap.delete(tool.name);
            });
          }
        },
        getTools: async () => Array.from(registeredToolsMap.values()),
        executeTool: async () => "ok",
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      };

      Object.defineProperty(window, "__registeredWebMcpTools", {
        get() {
          return Array.from(registeredToolsMap.values());
        },
        configurable: true,
      });

      Object.defineProperty(Document.prototype, "modelContext", {
        get() {
          return modelContext;
        },
        configurable: true,
      });
    });
  });

  test("1. WebMCP primitive registration occurs on page load once War Room exits BOOTSTRAP", async ({
    page,
  }) => {
    await page.goto("/graph");

    // Wait for registration session to complete
    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return Array.isArray(tools) && tools.length === 2;
      },
      undefined,
      { timeout: 10000 }
    );

    const tools: any = await page.evaluate(() => (window as any).__registeredWebMcpTools);
    expect(tools.length).toBe(2);

    const names = tools.map((t: any) => t.name).sort();
    expect(names).toEqual(["open_package_graph", "search_packages"]);
  });

  test("2. Agent search_packages execution returns structured packages without mutating canonical state or revision", async ({
    page,
  }) => {
    await page.goto("/graph");

    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return Array.isArray(tools) && tools.length === 2;
      },
      undefined,
      { timeout: 10000 }
    );

    const container = page.locator("[data-war-room-phase]");
    await expect(container).toHaveAttribute("data-war-room-phase", "IDLE");
    await expect(container).toHaveAttribute("data-war-room-revision", "1");

    // Execute search_packages tool
    const result: any = await page.evaluate(async () => {
      const tools = (window as any).__registeredWebMcpTools;
      const searchTool = tools.find((t: any) => t.name === "search_packages");
      const controller = new AbortController();
      return await searchTool.execute({ query: "react" }, { signal: controller.signal });
    });

    expect(result.ok).toBe(true);
    expect(result.data.packages.length).toBe(1);
    expect(result.data.packages[0].name).toBe("react");

    // Canonical state and revision must remain unmodified
    await expect(container).toHaveAttribute("data-war-room-phase", "IDLE");
    await expect(container).toHaveAttribute("data-war-room-revision", "1");
  });

  test("3. Agent open_package_graph execution updates canonical state, activates staged projection and reports projectionActivated: true", async ({
    page,
  }) => {
    await page.goto("/graph");

    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return Array.isArray(tools) && tools.length === 2;
      },
      undefined,
      { timeout: 10000 }
    );

    const result = await page.evaluate(async () => {
      const tools = (window as any).__registeredWebMcpTools;
      const openTool = tools.find((t: any) => t.name === "open_package_graph");
      const controller = new AbortController();
      return await openTool.execute(
        { rootPackageId: "npm:react", depth: 2 },
        { signal: controller.signal }
      );
    });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe("open_package_graph");
    expect(result.changed).toBe(true);
    expect(result.data.graphId).toBe("reverse:npm:react:depth:2");
    expect(result.data.packageCount).toBe(2);
    expect(result.data.projectionActivated).toBe(true);
    expect(result.data.compact).toBe(false);

    // Verify canonical state and graph visualization updated
    const container = page.locator("[data-war-room-phase]");
    await expect(container).toHaveAttribute("data-war-room-phase", "GRAPH_READY", {
      timeout: 10000,
    });
    await expect(container).toHaveAttribute("data-war-room-root-package", "npm:react", {
      timeout: 10000,
    });
    await expect(container).toHaveAttribute(
      "data-war-room-projection-root",
      "npm:react",
      { timeout: 10000 }
    );
  });

  test("4. Shared canonical runtime: human actions and agent actions operate on the same state", async ({
    page,
  }) => {
    await page.goto("/graph");

    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return Array.isArray(tools) && tools.length === 2;
      },
      undefined,
      { timeout: 10000 }
    );

    const container = page.locator("[data-war-room-phase]");

    // 1. Agent opens graph A (npm:react)
    await page.evaluate(async () => {
      const tools = (window as any).__registeredWebMcpTools;
      const openTool = tools.find((t: any) => t.name === "open_package_graph");
      const controller = new AbortController();
      await openTool.execute({ rootPackageId: "npm:react" }, { signal: controller.signal });
    });

    await expect(container).toHaveAttribute("data-war-room-root-package", "npm:react", {
      timeout: 10000,
    });

    // 2. Human opens graph B (npm:lodash) via human search form
    const searchInput = page.getByTestId("graph-package-input");
    await searchInput.fill("npm:lodash");
    await page.getByTestId("render-graph-button").click();

    await expect(container).toHaveAttribute("data-war-room-root-package", "npm:lodash", {
      timeout: 10000,
    });

    // 3. Agent opens graph C (npm:express)
    await page.evaluate(async () => {
      const tools = (window as any).__registeredWebMcpTools;
      const openTool = tools.find((t: any) => t.name === "open_package_graph");
      const controller = new AbortController();
      await openTool.execute({ rootPackageId: "npm:express" }, { signal: controller.signal });
    });

    await expect(container).toHaveAttribute("data-war-room-root-package", "npm:express", {
      timeout: 10000,
    });
  });

  test("5. Agent stale race: mid-flight human state mutation causes agent call to reject with STALE_CONTEXT", async ({
    page,
  }) => {
    let delayResolve: (() => void) | null = null;

    await page.route((url) => url.href.includes("graphql"), async (route) => {
      const req = route.request();
      const postData = req.postDataJSON();
      const op = postData?.operationName;
      const vars = postData?.variables || {};

      if (vars.packageId === "npm:slow-pkg") {
        await new Promise<void>((resolve) => {
          delayResolve = resolve;
        });
      }

      if (op === "GetPackage") {
        const pkgId = vars.id || "npm:initial-graph";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              package: {
                id: pkgId,
                name: pkgId.replace("npm:", ""),
                ecosystem: "NPM",
                version: "1.0.0",
                __typename: "Package",
              },
            },
          }),
        });
      }

      if (op === "GetReverseDependents") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              reverseDependents: {
                edges: [],
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: null,
                  endCursor: null,
                  __typename: "PageInfo",
                },
                totalCount: 0,
                __typename: "PackageConnection",
              },
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null }),
      });
    });

    // Start on initial graph
    await page.goto("/graph?pkg=npm:initial-graph");
    const container = page.locator("[data-war-room-phase]");
    await expect(container).toHaveAttribute(
      "data-war-room-root-package",
      "npm:initial-graph",
      { timeout: 10000 }
    );

    // 1. Agent starts opening slow-pkg
    const agentPromise = page.evaluate(async () => {
      const tools = (window as any).__registeredWebMcpTools;
      const openTool = tools.find((t: any) => t.name === "open_package_graph");
      const controller = new AbortController();
      return await openTool.execute(
        { rootPackageId: "npm:slow-pkg" },
        { signal: controller.signal }
      );
    });

    // 2. While agent call is pending, human opens human-pkg
    const searchInput = page.getByTestId("graph-package-input");
    await searchInput.fill("npm:human-pkg");
    await page.getByTestId("render-graph-button").click();

    await expect(container).toHaveAttribute(
      "data-war-room-root-package",
      "npm:human-pkg",
      { timeout: 10000 }
    );

    // 3. Release slow agent network response
    if (delayResolve) {
      (delayResolve as () => void)();
    }

    const agentResult: any = await agentPromise;
    expect(agentResult.ok).toBe(false);
    expect(agentResult.error.code).toBe("STALE_CONTEXT");

    // Human graph state preserved
    await expect(container).toHaveAttribute(
      "data-war-room-root-package",
      "npm:human-pkg"
    );
  });

  test("6. Agent execution cancellation: aborting execution signal returns CANCELLED and discards projection", async ({
    page,
  }) => {
    let delayResolve: (() => void) | null = null;

    await page.route((url) => url.href.includes("graphql"), async (route) => {
      const postData = route.request().postDataJSON();
      if (postData?.variables?.id === "npm:delayed-pkg") {
        await new Promise<void>((resolve) => {
          delayResolve = resolve;
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            package: {
              id: "npm:delayed-pkg",
              name: "delayed-pkg",
              ecosystem: "NPM",
              version: "1.0.0",
              __typename: "Package",
            },
          },
        }),
      });
    });

    await page.goto("/graph");

    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return Array.isArray(tools) && tools.length === 2;
      },
      undefined,
      { timeout: 10000 }
    );

    const result = await page.evaluate(async () => {
      const tools = (window as any).__registeredWebMcpTools;
      const openTool = tools.find((t: any) => t.name === "open_package_graph");
      const controller = new AbortController();

      const execPromise = openTool.execute(
        { rootPackageId: "npm:delayed-pkg" },
        { signal: controller.signal }
      );

      // Abort execution immediately
      controller.abort();

      return await execPromise;
    });

    if (delayResolve) {
      (delayResolve as () => void)();
    }

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("CANCELLED");
  });

  test("7. Real Human / Agent same-key race: concurrent requests for same package converge canonical state and visible projection", async ({
    page,
  }) => {
    let resolveFirstArrival: (() => void) | null = null;
    const firstArrival = new Promise<void>((r) => {
      resolveFirstArrival = r;
    });

    let unblockSharedGate: (() => void) | null = null;
    const sharedNetworkGate = new Promise<void>((r) => {
      unblockSharedGate = r;
    });

    let reverseDependentsArrivalCount = 0;

    await page.route((url) => url.href.includes("graphql"), async (route) => {
      const req = route.request();
      const postData = req.postDataJSON();
      const op = postData?.operationName;
      const vars = postData?.variables || {};

      const isGetPackage =
        (op === "GetPackage" || postData?.query?.includes("GetPackage")) &&
        !postData?.query?.includes("GetReverseDependents");
      const isGetReverseDependents =
        op === "GetReverseDependents" || postData?.query?.includes("GetReverseDependents");

      if (isGetPackage) {
        const pkgId = vars.id || "npm:same-package";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              package: {
                id: pkgId,
                name: pkgId.replace("npm:", ""),
                ecosystem: "NPM",
                version: "1.0.0",
                __typename: "Package",
              },
            },
          }),
        });
      }

      if (isGetReverseDependents) {
        reverseDependentsArrivalCount++;
        if (reverseDependentsArrivalCount === 1) {
          if (resolveFirstArrival) {
            (resolveFirstArrival as () => void)();
          }
        }
        await sharedNetworkGate;

        const pkgId = vars.packageId || "npm:same-package";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              reverseDependents: {
                edges: [
                  {
                    node: {
                      id: "npm:same-package-dep",
                      name: "same-package-dep",
                      ecosystem: "NPM",
                      __typename: "Package",
                    },
                    depth: 1,
                    cursor: "c1",
                    __typename: "PackageEdge",
                  },
                ],
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: false,
                  startCursor: "c1",
                  endCursor: "c1",
                  __typename: "PageInfo",
                },
                totalCount: 1,
                __typename: "PackageConnection",
              },
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null }),
      });
    });

    await page.goto("/graph");

    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return Array.isArray(tools) && tools.length === 2;
      },
      undefined,
      { timeout: 10000 }
    );

    const container = page.locator("[data-war-room-phase]");
    const initialRevision = await container.getAttribute("data-war-room-revision");
    expect(initialRevision).toBe("1");

    // 1. Agent starts opening npm:same-package (reaches shared network barrier)
    await page.evaluate(() => {
      const tools = (window as any).__registeredWebMcpTools;
      const openTool = tools.find((t: any) => t.name === "open_package_graph");
      const controller = new AbortController();
      (window as any).__agentExecPromise = openTool.execute(
        { rootPackageId: "npm:same-package", depth: 2 },
        { signal: controller.signal }
      );
    });

    // Explicitly await Agent request arrival at shared network barrier
    await firstArrival;
    expect(reverseDependentsArrivalCount).toBe(1);

    // 2. Human triggers opening the EXACT SAME package via real UI input while Agent request is blocked
    const searchInput = page.getByTestId("graph-package-input");
    await searchInput.fill("npm:same-package");
    await page.getByTestId("render-graph-button").click();

    // Assert Human UI workflow started and loading spinner is visible before network release
    const loadingSpinner = page.getByTestId("render-graph-button").locator(".animate-spin");
    await expect(loadingSpinner).toBeVisible({ timeout: 5000 });

    // Assert canonical revision is unchanged before release (no commit happens while network data is blocked)
    const revisionBeforeRelease = await container.getAttribute("data-war-room-revision");
    expect(revisionBeforeRelease).toBe(initialRevision);

    // 3. Release shared network barrier
    if (unblockSharedGate) {
      (unblockSharedGate as () => void)();
    }

    // 4. Await Agent tool result and Human workflow settlement
    const agentResult: any = await page.evaluate(() => (window as any).__agentExecPromise);
    await expect(loadingSpinner).not.toBeVisible({ timeout: 10000 });

    // 5. Agent outcome restricted to SUCCESS (with projectionActivated: true) or STALE_CONTEXT
    if (agentResult.ok) {
      expect(agentResult.data.projectionActivated).toBe(true);
    } else {
      expect(agentResult.error.code).toBe("STALE_CONTEXT");
    }

    // 6. Final canonical revision increments exactly once (1 -> 2)
    await expect(container).toHaveAttribute("data-war-room-revision", "2", {
      timeout: 10000,
    });
    await expect(container).toHaveAttribute("data-war-room-phase", "GRAPH_READY", {
      timeout: 10000,
    });

    // 7. Final State Parity Assertions (asserted only after both callers have fully settled)
    await expect(container).toHaveAttribute(
      "data-war-room-root-package",
      "npm:same-package",
      { timeout: 10000 }
    );
    await expect(container).toHaveAttribute(
      "data-war-room-projection-root",
      "npm:same-package",
      { timeout: 10000 }
    );
    const finalCanonicalRoot = await container.getAttribute("data-war-room-root-package");
    const finalProjectionRoot = await container.getAttribute("data-war-room-projection-root");
    expect(finalCanonicalRoot).toBe("npm:same-package");
    expect(finalProjectionRoot).toBe("npm:same-package");
    expect(finalCanonicalRoot).toBe(finalProjectionRoot);

    // 8. Assert production deduplication evidence: Apollo deduplicated simultaneous in-flight queries
    expect(reverseDependentsArrivalCount).toBe(1);
  });

  test("8. Live Browser Model Context: Agent opens graph and physical registration surface dynamically updates to GRAPH_READY", async ({
    page,
  }) => {
    await page.goto("/graph");

    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return Array.isArray(tools) && tools.length === 2;
      },
      undefined,
      { timeout: 10000 }
    );

    // Initial IDLE surface
    const initialTools: any = await page.evaluate(() => (window as any).__registeredWebMcpTools);
    expect(initialTools.map((t: any) => t.name).sort()).toEqual(["open_package_graph", "search_packages"]);

    // Agent executes open_package_graph
    const openRes: any = await page.evaluate(async () => {
      const tools = (window as any).__registeredWebMcpTools;
      const openTool = tools.find((t: any) => t.name === "open_package_graph");
      const controller = new AbortController();
      return await openTool.execute({ rootPackageId: "npm:react", depth: 2 }, { signal: controller.signal });
    });

    expect(openRes.ok).toBe(true);

    // Wait for live registration surface to update
    await page.waitForFunction(
      () => {
        const tools = (window as any).__registeredWebMcpTools;
        return (
          Array.isArray(tools) &&
          tools.length === 3 &&
          tools.some((t: any) => t.name === "summarize_graph")
        );
      },
      undefined,
      { timeout: 10000 }
    );

    const updatedTools: any = await page.evaluate(() => (window as any).__registeredWebMcpTools);
    const updatedNames = updatedTools.map((t: any) => t.name).sort();
    expect(updatedNames).toEqual(["open_package_graph", "summarize_graph", "trace_dependency_path"]);
    expect(updatedNames).not.toContain("search_packages");
  });
});

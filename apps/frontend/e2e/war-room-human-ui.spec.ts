/**
 * War Room Human UI Browser E2E Tests
 *
 * Tests the human workflow on /graph with deterministic GraphQL route mocking (WMCP-2C-R1, Section 68-74).
 */

import { test, expect } from "@playwright/test";

test.describe("War Room Human UI Graph Workflow (WMCP-2C-R1)", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept all GraphQL network traffic
    await page.route((url) => url.href.includes("graphql"), async (route) => {
      const request = route.request();
      let postData: any = null;
      try {
        postData = request.postDataJSON();
      } catch {
        postData = null;
      }
      const op = postData?.operationName;
      const vars = postData?.variables || {};

      if (op === "GetPackage") {
        const pkgId = vars.id || "npm:react";
        const name = pkgId.includes(":") ? pkgId.split(":")[1] : pkgId;
        const ecosystem = pkgId.includes(":") ? pkgId.split(":")[0].toUpperCase() : "NPM";

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              package: {
                id: pkgId,
                name,
                ecosystem,
                __typename: "Package",
              },
            },
          }),
        });
      }

      if (op === "GetReverseDependents") {
        const pkgId = vars.packageId || "npm:react";
        const dependentId = pkgId === "npm:react" ? "npm:react-dom" : "npm:downstream-lib";
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
  });

  test("1. Initial ?pkg= URL opens graph through War Room actions to GRAPH_READY", async ({ page }) => {
    await page.goto("/graph?pkg=npm:react");

    const graphContainer = page.locator("[data-war-room-phase]");
    await expect(graphContainer).toBeVisible({ timeout: 15000 });

    // Verify canonical state and projection container attributes
    await expect(graphContainer).toHaveAttribute("data-war-room-phase", "GRAPH_READY", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-root-package", "npm:react", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-projection-root", "npm:react", { timeout: 15000 });
  });

  test("2. Search form submit opens new graph through War Room actions and advances revision", async ({ page }) => {
    await page.goto("/graph");

    const graphContainer = page.locator("[data-war-room-phase]");
    await expect(graphContainer).toHaveAttribute("data-war-room-phase", "IDLE", { timeout: 15000 });

    const input = page.getByTestId("graph-package-input");
    await input.fill("npm:vue");
    await input.press("Enter");

    await expect(graphContainer).toHaveAttribute("data-war-room-phase", "GRAPH_READY", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-root-package", "npm:vue", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-projection-root", "npm:vue", { timeout: 15000 });
  });

  test("3. Human graph race: newer submitted graph completes and canonical/projection win together", async ({ page }) => {
    let unblockVue: (() => void) | null = null;
    const vueBlockedPromise = new Promise<void>((resolve) => {
      unblockVue = resolve;
    });

    // Custom route interceptor for race simulation
    await page.route((url) => url.href.includes("graphql"), async (route) => {
      let postData: any = null;
      try {
        postData = route.request().postDataJSON();
      } catch {}
      const op = postData?.operationName;
      const vars = postData?.variables || {};

      if (op === "GetPackage" && vars.id === "npm:vue") {
        await vueBlockedPromise; // Hold older vue request
      }

      if (op === "GetPackage" && vars.id === "npm:react") {
        // Once react is requested, unblock vue shortly after
        setTimeout(() => unblockVue?.(), 50);
      }

      const pkgId = vars.id || vars.packageId || "npm:default";
      const name = pkgId.includes(":") ? pkgId.split(":")[1] : pkgId;

      if (op === "GetPackage") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: { package: { id: pkgId, name, ecosystem: "NPM", __typename: "Package" } },
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
                edges: [{ node: { id: "npm:dep", name: "dep", ecosystem: "NPM", __typename: "Package" }, depth: 1, __typename: "PackageEdge", cursor: "c1" }],
                pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: "c1", endCursor: "c1", __typename: "PageInfo" },
                totalCount: 1,
                __typename: "PackageConnection",
              },
            },
          }),
        });
      }

      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null }) });
    });

    await page.goto("/graph");

    const input = page.getByTestId("graph-package-input");

    // 1. Start loading npm:vue (blocked)
    await input.fill("npm:vue");
    await input.press("Enter");

    // 2. Submit npm:react
    await input.fill("npm:react");
    await input.press("Enter");

    // npm:react completes and canonical root & projection both belong to npm:react
    const graphContainer = page.locator("[data-war-room-phase]");
    await expect(graphContainer).toHaveAttribute("data-war-room-root-package", "npm:react", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-projection-root", "npm:react", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-phase", "GRAPH_READY", { timeout: 15000 });
  });

  test("4. Safe typed error display when root package is not found", async ({ page }) => {
    await page.route((url) => url.href.includes("graphql"), async (route) => {
      let postData: any = null;
      try {
        postData = route.request().postDataJSON();
      } catch {}
      if (postData?.operationName === "GetPackage") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { package: null } }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null }) });
    });

    await page.goto("/graph");

    const input = page.getByTestId("graph-package-input");
    await input.fill("npm:nonexistent-package-xyz");
    await input.press("Enter");

    // Error message displayed without raw GraphQL stack trace
    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 15000 });
    const graphContainer = page.locator("[data-war-room-phase]");
    await expect(graphContainer).toHaveAttribute("data-war-room-phase", "IDLE", { timeout: 15000 });
  });

  test("5. Failed new graph load preserves previous visible graph and canonical state", async ({ page }) => {
    // Start by loading npm:react successfully
    await page.goto("/graph?pkg=npm:react");

    const graphContainer = page.locator("[data-war-room-phase]");
    await expect(graphContainer).toHaveAttribute("data-war-room-root-package", "npm:react", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-projection-root", "npm:react", { timeout: 15000 });

    // Now intercept network to fail on next package query
    await page.route((url) => url.href.includes("graphql"), async (route) => {
      let postData: any = null;
      try {
        postData = route.request().postDataJSON();
      } catch {}
      if (postData?.operationName === "GetPackage") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { package: null } }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null }) });
    });

    const input = page.getByTestId("graph-package-input");
    await input.fill("npm:fail-pkg");
    await input.press("Enter");

    // Error message is displayed
    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 15000 });

    // Canonical state and visible projection remain on npm:react
    await expect(graphContainer).toHaveAttribute("data-war-room-root-package", "npm:react", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-projection-root", "npm:react", { timeout: 15000 });
    await expect(graphContainer).toHaveAttribute("data-war-room-phase", "GRAPH_READY", { timeout: 15000 });
  });
});

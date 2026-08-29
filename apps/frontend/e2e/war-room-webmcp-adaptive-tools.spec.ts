import { test, expect } from "@playwright/test";
import {
  WEB_MCP_TOOL_CATALOG,
  getToolCatalogEntry,
  createAdaptiveToolDefinition,
  WebMcpActionName,
  SEARCH_PACKAGES_SCHEMA,
  OPEN_PACKAGE_GRAPH_SCHEMA,
  validateTraceDependencyPathInput,
  validateFocusGraphNodesInput,
  validateEmptyObjectInput,
} from "../src/lib/webmcp";
import { createWarRoomStore, createWarRoomStatePort } from "../src/lib/war-room/state/store";
import { createWarRoomActions } from "../src/lib/war-room/application/actions";
import { createWarRoomProjectionStore } from "../src/lib/war-room/integration/graph-projection";
import {
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
} from "../src/lib/war-room/application/ports";
import * as fs from "fs";
import * as path from "path";

const ALL_CANONICAL_ACTION_NAMES: readonly WebMcpActionName[] = [
  "search_packages",
  "open_package_graph",
  "summarize_graph",
  "calculate_blast_radius",
  "trace_dependency_path",
  "focus_graph_nodes",
  "inspect_selected_package",
  "simulate_api_changes",
  "inspect_scenario",
  "set_scenario_priority",
  "set_scenario_exclusion",
  "recalculate_scenario",
  "generate_migration_plan",
  "inspect_critical_paths",
  "inspect_migration_plan",
  "focus_critical_path",
];

function createMockServicePorts() {
  const securityPort: WarRoomSecurityContextPort = {
    async getSecurityContext() {
      return {
        ok: true,
        data: {
          tenantId: "tenant-mock",
          userId: "user-mock",
          organizationId: "org-mock",
        },
      };
    },
  };

  const authPort: WarRoomAuthorizationPort = {
    async authorize() {
      return { ok: true, data: undefined };
    },
  };

  const catalogPort: WarRoomPackageCatalogPort = {
    async searchPackages(_sec, request) {
      return {
        ok: true,
        data: {
          packages: [
            {
              id: "npm:express",
              name: "express",
              ecosystem: request.ecosystem ?? "NPM",
              version: "4.18.2",
            },
          ].slice(0, request.limit ?? 8),
          totalCount: 1,
        },
      };
    },
    async inspectPackage(_sec, request) {
      return {
        ok: true,
        data: {
          package: {
            id: request.packageId,
            name: request.packageId.split(":")[1] ?? request.packageId,
            ecosystem: "NPM",
            version: "1.0.0",
          },
          directDependencyIds: ["npm:dep-1"],
          directDependentIds: [],
        },
      };
    },
  };

  const graphPort: WarRoomGraphQueryPort = {
    async loadPackageGraph(_sec, request) {
      return {
        ok: true,
        data: {
          id: `graph-${request.rootPackageId}`,
          rootPackage: {
            id: request.rootPackageId,
            name: request.rootPackageId.split(":")[1] ?? request.rootPackageId,
            ecosystem: "NPM",
            version: "1.0.0",
          },
          packageIds: [request.rootPackageId, "npm:dep-1"],
        },
      };
    },
    async traceDependencyPath(_sec, request) {
      return {
        ok: true,
        data: {
          fromPackageId: request.fromPackageId,
          toPackageId: request.toPackageId,
          packageIds: [request.fromPackageId, "npm:intermediate", request.toPackageId],
          hopCount: 2,
        },
      };
    },
  };

  const scenarioPort: WarRoomScenarioAnalysisPort = {
    async recalculateScenario(_sec, input) {
      return {
        ok: true,
        data: {
          id: `analysis-${input.scenario.id}`,
          scenarioId: input.scenario.id,
          sourceContextRevision: input.sourceContextRevision,
          affectedEntityIds: ["npm:dep-1"],
        },
      };
    },
  };

  const planningPort: WarRoomMigrationPlanningPort = {
    async generateMigrationPlan(_sec, input) {
      return {
        ok: true,
        data: {
          id: `plan-${input.scenario.id}`,
          scenarioId: input.scenario.id,
          sourceReviewId: input.review.id,
          sourceContextRevision: input.sourceContextRevision,
        },
      };
    },
  };

  return {
    securityPort,
    authPort,
    catalogPort,
    graphPort,
    scenarioPort,
    planningPort,
  };
}

function setupTestHarness() {
  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);
  const ports = createMockServicePorts();
  const actions = createWarRoomActions({
    statePort,
    securityContextPort: ports.securityPort,
    authorizationPort: ports.authPort,
    packageCatalogPort: ports.catalogPort,
    graphQueryPort: ports.graphPort,
    scenarioAnalysisPort: ports.scenarioPort,
    migrationPlanningPort: ports.planningPort,
  });

  actions.initialize();

  const focusedNodes = new Set<string>();
  const visualFocusPort = {
    focusNodes(nodeIds: readonly string[]) {
      focusedNodes.clear();
      for (const id of nodeIds) {
        focusedNodes.add(id);
      }
    },
    getFocusedNodes() {
      return focusedNodes;
    },
  };

  return {
    statePort,
    actions,
    visualFocusPort,
  };
}

test.describe("WebMCP Adaptive Tool Catalog & Authority Binding (WMCP-4B)", () => {
  test("1. Catalog Completeness: All canonical action names have exactly one catalog entry", () => {
    for (const name of ALL_CANONICAL_ACTION_NAMES) {
      const entry = WEB_MCP_TOOL_CATALOG[name];
      expect(entry).toBeDefined();
      expect(entry.name).toBe(name);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.inputSchema).toBeDefined();
      expect(entry.annotations).toBeDefined();
      expect(typeof entry.annotations.readOnlyHint).toBe("boolean");
      expect(typeof entry.annotations.untrustedContentHint).toBe("boolean");
      expect(entry.authority.length).toBeGreaterThan(0);
    }

    const catalogKeys = Object.keys(WEB_MCP_TOOL_CATALOG);
    expect(catalogKeys.sort()).toEqual([...ALL_CANONICAL_ACTION_NAMES].sort());
  });

  test("2. Schema Strictness: All schemas enforce additionalProperties: false and strict types", () => {
    for (const name of ALL_CANONICAL_ACTION_NAMES) {
      const entry = WEB_MCP_TOOL_CATALOG[name];
      const schema = entry.inputSchema as { type?: string; additionalProperties?: boolean };
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
    }
  });

  test("3. Primitive Schema Preservation: search_packages and open_package_graph match WMCP-3B", () => {
    const searchEntry = getToolCatalogEntry("search_packages");
    expect(searchEntry.inputSchema).toBe(SEARCH_PACKAGES_SCHEMA);

    const openEntry = getToolCatalogEntry("open_package_graph");
    expect(openEntry.inputSchema).toBe(OPEN_PACKAGE_GRAPH_SCHEMA);
  });

  test("4. Authority & Binding Classification Matrix: 10 Executable vs 6 Deferred", () => {
    const executableTools: WebMcpActionName[] = [
      "search_packages",
      "open_package_graph",
      "summarize_graph",
      "trace_dependency_path",
      "focus_graph_nodes",
      "inspect_selected_package",
      "inspect_scenario",
      "recalculate_scenario",
      "generate_migration_plan",
      "inspect_migration_plan",
    ];

    const deferredTools: WebMcpActionName[] = [
      "calculate_blast_radius",
      "simulate_api_changes",
      "set_scenario_priority",
      "set_scenario_exclusion",
      "inspect_critical_paths",
      "focus_critical_path",
    ];

    for (const name of executableTools) {
      const entry = getToolCatalogEntry(name);
      expect(entry.bindingStatus).toBe("EXECUTABLE");
    }

    for (const name of deferredTools) {
      const entry = getToolCatalogEntry(name);
      expect(entry.bindingStatus).toBe("DEFERRED");
      expect(entry.classification).toBe("FUTURE_DETERMINISTIC_CAPABILITY");
      expect(entry.futureDependency).toBeDefined();
      expect(entry.futureDependency!.length).toBeGreaterThan(0);
    }
  });

  test("5. Input Validation: Rejects security parameters, contextRevision, and unknown fields", () => {
    // Empty object validator
    expect(validateEmptyObjectInput(null, "summarize_graph").ok).toBe(true);
    expect(validateEmptyObjectInput({}, "summarize_graph").ok).toBe(true);
    expect(validateEmptyObjectInput({ token: "secret" }, "summarize_graph").ok).toBe(false);
    expect(validateEmptyObjectInput({ unexpected: 123 }, "summarize_graph").ok).toBe(false);

    // Trace dependency path validator
    expect(
      validateTraceDependencyPathInput({
        sourcePackageId: "npm:a",
        targetPackageId: "npm:b",
        maxDepth: 3,
      }).ok
    ).toBe(true);
    expect(
      validateTraceDependencyPathInput({
        sourcePackageId: "npm:a",
        targetPackageId: "npm:b",
        jwt: "bearer-token",
      }).ok
    ).toBe(false);
    expect(validateTraceDependencyPathInput({ sourcePackageId: "npm:a" }).ok).toBe(false);

    // Focus graph nodes validator
    expect(validateFocusGraphNodesInput({ nodeIds: ["npm:a", "npm:b"] }).ok).toBe(true);
    expect(validateFocusGraphNodesInput({ nodeIds: [] }).ok).toBe(false);
    expect(validateFocusGraphNodesInput({ nodeIds: ["npm:a"], tenantId: "t1" }).ok).toBe(false);
  });

  test("6. Executable Tool Factory: summarize_graph read model execution", async () => {
    const harness = setupTestHarness();
    const tool = createAdaptiveToolDefinition("summarize_graph", harness);

    // Initial state: no graph -> INVALID_STATE
    const failRes = await tool.execute({});
    expect(failRes.ok).toBe(false);
    expect((failRes as any).error.code).toBe("INVALID_STATE");

    // Open graph first
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    const successRes = await tool.execute({});
    expect(successRes.ok).toBe(true);
    expect((successRes as any).tool).toBe("summarize_graph");
    expect((successRes as any).data.packageCount).toBe(2);
  });

  test("7. Executable Tool Factory: trace_dependency_path action execution", async () => {
    const harness = setupTestHarness();
    const tool = createAdaptiveToolDefinition("trace_dependency_path", harness);

    const res = await tool.execute({
      sourcePackageId: "npm:root",
      targetPackageId: "npm:leaf",
    });

    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("trace_dependency_path");
    expect((res as any).data.path).toContain("npm:intermediate");
  });

  test("8. Executable Tool Factory: focus_graph_nodes visual projection execution", async () => {
    const harness = setupTestHarness();
    const tool = createAdaptiveToolDefinition("focus_graph_nodes", harness);

    // Open graph first
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );

    const res = await tool.execute({
      nodeIds: ["npm:express", "npm:dep-1"],
    });

    expect(res.ok).toBe(true);
    expect(harness.visualFocusPort.getFocusedNodes()).toEqual(
      new Set(["npm:express", "npm:dep-1"])
    );
  });

  test("9. Executable Tool Factory: inspect_selected_package context-bound action execution", async () => {
    const harness = setupTestHarness();
    const tool = createAdaptiveToolDefinition("inspect_selected_package", harness);

    // No package selected -> INVALID_STATE
    const failRes = await tool.execute({});
    expect(failRes.ok).toBe(false);
    expect((failRes as any).error.code).toBe("INVALID_STATE");

    // Open graph and select package
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:express",
            name: "express",
            ecosystem: "NPM",
            version: "1.0.0",
          },
        },
      }
    );

    const successRes = await tool.execute({});
    expect(successRes.ok).toBe(true);
    expect((successRes as any).tool).toBe("inspect_selected_package");
    expect((successRes as any).data.name).toBe("express");
  });

  test("10. Executable Tool Factory: scenario & migration plan tool executions", async () => {
    const harness = setupTestHarness();

    // 1. inspect_scenario when none active
    const inspectScenarioTool = createAdaptiveToolDefinition("inspect_scenario", harness);
    const failScenario = await inspectScenarioTool.execute({});
    expect(failScenario.ok).toBe(false);
    expect((failScenario as any).error.code).toBe("INVALID_STATE");

    // Open graph, select package, create scenario
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:express" }
    );
    await harness.actions.selectPackage(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        selection: {
          package: {
            id: "npm:express",
            name: "express",
            ecosystem: "NPM",
            version: "1.0.0",
          },
        },
      }
    );
    await harness.actions.createScenario(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        scenario: {
          id: "sc-1",
          targetPackageId: "npm:express",
          proposedVersion: "5.0.0",
          patchOperations: [],
        },
      }
    );

    // inspect_scenario when active
    const okScenario = await inspectScenarioTool.execute({});
    expect(okScenario.ok).toBe(true);
    expect((okScenario as any).data.scenarioId).toBe("sc-1");

    // recalculate_scenario
    const recalcTool = createAdaptiveToolDefinition("recalculate_scenario", harness);
    const recalcRes = await recalcTool.execute({});
    expect(recalcRes.ok).toBe(true);
    expect((recalcRes as any).data.recalculated).toBe(true);

    // attach human review to advance to HUMAN_REVIEW phase
    await harness.actions.attachHumanReview(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      {
        review: {
          id: "rev-1",
          scenarioId: "sc-1",
          bindings: [],
        },
      }
    );

    // generate_migration_plan
    const genPlanTool = createAdaptiveToolDefinition("generate_migration_plan", harness);
    const planRes = await genPlanTool.execute({});
    expect(planRes.ok).toBe(true);
    expect((planRes as any).data.planGenerated).toBe(true);

    // inspect_migration_plan
    const inspectPlanTool = createAdaptiveToolDefinition("inspect_migration_plan", harness);
    const inspectPlanRes = await inspectPlanTool.execute({});
    expect(inspectPlanRes.ok).toBe(true);
    expect((inspectPlanRes as any).data.planId).toBeDefined();
  });

  test("11. Deferred Tool Factory: Fails closed and throws on instantiation", () => {
    const harness = setupTestHarness();
    const deferredTools: WebMcpActionName[] = [
      "calculate_blast_radius",
      "simulate_api_changes",
      "set_scenario_priority",
      "set_scenario_exclusion",
      "inspect_critical_paths",
      "focus_critical_path",
    ];

    for (const name of deferredTools) {
      expect(() => createAdaptiveToolDefinition(name, harness)).toThrowError(
        /is deferred to/
      );
    }
  });

  test("12. Architectural Boundary Guard: WebMCP layer contains zero business algorithms", () => {
    const webmcpDir = path.resolve(__dirname, "../src/lib/webmcp");
    const files = fs.readdirSync(path.join(webmcpDir, "bridge"));

    for (const file of files) {
      if (!file.endsWith(".ts")) continue;
      const content = fs.readFileSync(path.join(webmcpDir, "bridge", file), "utf-8");

      // Guard against AST parsers, custom semver math, direct blast radius calculations in WebMCP
      expect(content).not.toContain("babel");
      expect(content).not.toContain("acorn");
      expect(content).not.toContain("typescript.createSourceFile");
      expect(content).not.toContain("semver.satisfies");
    }
  });
});

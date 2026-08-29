/**
 * WebMCP Adaptive Tool Catalog & Authority Binding Verification (WMCP-4B / WMCP-4B-R2)
 *
 * Deterministic test suite verifying:
 * - 16 canonical tools in catalog
 * - Exact 7 EXECUTABLE vs 9 DEFERRED authority bindings
 * - Exact 13 FROZEN vs 3 PENDING_DOMAIN_CONTRACT schema readiness states
 * - Invariant: EXECUTABLE requires FROZEN schema
 * - Fail-closed deferred and pending tool factory behavior
 * - Strict schema properties and security parameter rejection
 * - Execution parity and non-duplication of domain logic
 * Follows WMCP-INV-001, WMCP-INV-002, WMCP-INV-003, WMCP-INV-004, WMCP-INV-016, WMCP-INV-017, WMCP-INV-021,
 * INV-WMCP4B-SCHEMA-001, INV-WMCP4B-DEF-001, INV-WMCP4B-DEF-002, and INV-WMCP4B-DEF-003.
 */

import { test, expect } from "@playwright/test";
import {
  ALL_CANONICAL_ACTION_NAMES,
  WEB_MCP_TOOL_CATALOG,
  getToolCatalogEntry,
  WebMcpActionName,
  SEARCH_PACKAGES_SCHEMA,
  OPEN_PACKAGE_GRAPH_SCHEMA,
  createAdaptiveToolDefinition,
  validateTraceDependencyPathInput,
  validateEmptyObjectInput,
} from "../src/lib/webmcp";
import { createWarRoomStore, createWarRoomStatePort } from "../src/lib/war-room/state/store";
import { createWarRoomActions } from "../src/lib/war-room/application/actions";
import {
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
} from "../src/lib/war-room/application/ports";

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

  return {
    store,
    statePort,
    actions,
  };
}

test.describe("WebMCP Adaptive Tool Catalog & Authority Binding (WMCP-4B-R2)", () => {
  test("R2-T1. Catalog Completeness: All 16 canonical action names have exactly one catalog entry", () => {
    expect(ALL_CANONICAL_ACTION_NAMES.length).toBe(16);

    for (const name of ALL_CANONICAL_ACTION_NAMES) {
      const entry = WEB_MCP_TOOL_CATALOG[name];
      expect(entry).toBeDefined();
      expect(entry.name).toBe(name);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.annotations).toBeDefined();
      expect(typeof entry.annotations.readOnlyHint).toBe("boolean");
      expect(typeof entry.annotations.untrustedContentHint).toBe("boolean");
      expect(entry.authority.length).toBeGreaterThan(0);
    }

    const catalogKeys = Object.keys(WEB_MCP_TOOL_CATALOG);
    expect(catalogKeys.sort()).toEqual([...ALL_CANONICAL_ACTION_NAMES].sort());
  });

  test("R2-T2 & R2-T3. Authority Matrix: Exactly 7 EXECUTABLE vs 9 DEFERRED tools", () => {
    const expectedExecutable: WebMcpActionName[] = [
      "search_packages",
      "open_package_graph",
      "summarize_graph",
      "trace_dependency_path",
      "inspect_selected_package",
      "inspect_scenario",
      "inspect_migration_plan",
    ];

    const expectedDeferred: WebMcpActionName[] = [
      "calculate_blast_radius",
      "focus_graph_nodes",
      "simulate_api_changes",
      "set_scenario_priority",
      "set_scenario_exclusion",
      "recalculate_scenario",
      "generate_migration_plan",
      "inspect_critical_paths",
      "focus_critical_path",
    ];

    const actualExecutable = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "EXECUTABLE"
    );
    const actualDeferred = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "DEFERRED"
    );

    expect(actualExecutable.sort()).toEqual([...expectedExecutable].sort());
    expect(actualDeferred.sort()).toEqual([...expectedDeferred].sort());
    expect(actualExecutable.length).toBe(7);
    expect(actualDeferred.length).toBe(9);
  });

  test("R2-T7, R2-T8, R2-T9. Schema Readiness: Exactly 13 FROZEN vs 3 PENDING_DOMAIN_CONTRACT", () => {
    const expectedPending: WebMcpActionName[] = [
      "focus_graph_nodes",
      "set_scenario_priority",
      "set_scenario_exclusion",
    ];

    const actualPending = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].schemaStatus === "PENDING_DOMAIN_CONTRACT"
    );
    const actualFrozen = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].schemaStatus === "FROZEN"
    );

    expect(actualPending.sort()).toEqual([...expectedPending].sort());
    expect(actualPending.length).toBe(3);
    expect(actualFrozen.length).toBe(13);

    // Pending tools MUST NOT expose inputSchema
    for (const name of expectedPending) {
      const entry = WEB_MCP_TOOL_CATALOG[name];
      expect(entry.schemaStatus).toBe("PENDING_DOMAIN_CONTRACT");
      expect((entry as any).inputSchema).toBeUndefined();
    }
  });

  test("R2-T11. Invariant: Every EXECUTABLE tool MUST have schemaStatus = FROZEN", () => {
    for (const name of ALL_CANONICAL_ACTION_NAMES) {
      const entry = WEB_MCP_TOOL_CATALOG[name];
      if (entry.bindingStatus === "EXECUTABLE") {
        expect(entry.schemaStatus).toBe("FROZEN");
        expect(entry.inputSchema).toBeDefined();
      }
    }
  });

  test("R2-T12. Strict Schema Validation: All FROZEN schemas enforce additionalProperties: false", () => {
    for (const name of ALL_CANONICAL_ACTION_NAMES) {
      const entry = WEB_MCP_TOOL_CATALOG[name];
      if (entry.schemaStatus === "FROZEN") {
        const schema = entry.inputSchema as { type?: string; additionalProperties?: boolean };
        expect(schema.type).toBe("object");
        expect(schema.additionalProperties).toBe(false);
      }
    }
  });

  test("R2-T13. Primitive Schema Preservation: search_packages and open_package_graph match WMCP-3B", () => {
    const searchEntry = getToolCatalogEntry("search_packages");
    expect(searchEntry.inputSchema).toBe(SEARCH_PACKAGES_SCHEMA);

    const openEntry = getToolCatalogEntry("open_package_graph");
    expect(openEntry.inputSchema).toBe(OPEN_PACKAGE_GRAPH_SCHEMA);
  });

  test("R2-T14. simulate_api_changes metadata includes WMCP-7 as implementation authority", () => {
    const simEntry = getToolCatalogEntry("simulate_api_changes");
    expect(simEntry.futureDependency).toBeDefined();
    expect(simEntry.futureDependency).toContain("WMCP-7");
    expect(simEntry.futureDependency).toContain("WMCP-5 -> WMCP-6 -> WMCP-7");
  });

  test("R2-T4, R2-T5, R2-T6, R2-T10. Deferred & Pending Tool Factory: Fails closed on instantiation", () => {
    const harness = setupTestHarness();

    const deferredTools: WebMcpActionName[] = [
      "calculate_blast_radius",
      "focus_graph_nodes",
      "simulate_api_changes",
      "set_scenario_priority",
      "set_scenario_exclusion",
      "recalculate_scenario",
      "generate_migration_plan",
      "inspect_critical_paths",
      "focus_critical_path",
    ];

    for (const name of deferredTools) {
      expect(() => createAdaptiveToolDefinition(name, harness)).toThrowError(
        /is deferred.*cannot be instantiated as an executable definition/i
      );
    }
  });

  test("R2-T15. Input Validation: Rejects security parameters, contextRevision, and unknown fields", () => {
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
  });

  test("R2-T16. Executable Tool Factory: summarize_graph read model execution", async () => {
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

  test("R2-T16. Executable Tool Factory: trace_dependency_path action execution", async () => {
    const harness = setupTestHarness();

    // Open graph first to transition to GRAPH_READY
    await harness.actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: harness.statePort.getState().contextRevision },
      { rootPackageId: "npm:root" }
    );

    const tool = createAdaptiveToolDefinition("trace_dependency_path", harness);

    const res = await tool.execute({
      sourcePackageId: "npm:root",
      targetPackageId: "npm:leaf",
    });

    expect(res.ok).toBe(true);
    expect((res as any).tool).toBe("trace_dependency_path");
    expect((res as any).data.path).toContain("npm:intermediate");
  });

  test("R2-T16. Executable Tool Factory: inspect_selected_package context-bound action execution", async () => {
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

  test("R2-T16. Executable Tool Factory: inspect_scenario & inspect_migration_plan read model execution", async () => {
    const harness = setupTestHarness();

    // 1. inspect_scenario when none active -> INVALID_STATE
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

    // inspect_scenario when active -> success
    const okScenario = await inspectScenarioTool.execute({});
    expect(okScenario.ok).toBe(true);
    expect((okScenario as any).data.scenarioId).toBe("sc-1");

    // 2. inspect_migration_plan when none active -> INVALID_STATE
    const inspectPlanTool = createAdaptiveToolDefinition("inspect_migration_plan", harness);
    const failPlan = await inspectPlanTool.execute({});
    expect(failPlan.ok).toBe(false);
    expect((failPlan as any).error.code).toBe("INVALID_STATE");

    // Transition state through review and plan creation directly to test inspect_migration_plan read model
    harness.store.getState().commitContextBound(harness.statePort.getState().contextRevision, {
      type: "HUMAN_ANNOTATED",
      payload: {
        review: {
          id: "rev-1",
          scenarioId: "sc-1",
          bindings: [],
        },
      },
    });

    harness.store.getState().commitContextBound(harness.statePort.getState().contextRevision, {
      type: "PLAN_GENERATED",
      payload: {
        plan: {
          id: "plan-1",
          scenarioId: "sc-1",
          sourceReviewId: "rev-1",
          sourceContextRevision: harness.statePort.getState().contextRevision,
        },
      },
    });

    const okPlan = await inspectPlanTool.execute({});
    expect(okPlan.ok).toBe(true);
    expect((okPlan as any).data.planId).toBe("plan-1");
  });

  test("R2-T17. Architectural Boundary Guard: WebMCP layer contains zero business algorithms", () => {
    const fs = require("fs");
    const path = require("path");

    const bridgeDir = path.join(__dirname, "../src/lib/webmcp/bridge");
    const files = fs.readdirSync(bridgeDir).filter((f: string) => f.endsWith(".ts"));

    const forbiddenTerms = [
      "bfs",
      "dfs",
      "shortestPath",
      "dijkstra",
      "astParse",
      "babel",
      "acorn",
      "semver",
      "calculateBlastRadius",
      "synthesizePlan",
      "evaluateConflict",
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(bridgeDir, file), "utf8");
      for (const term of forbiddenTerms) {
        expect(content.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });
});

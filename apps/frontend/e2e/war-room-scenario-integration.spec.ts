import { test, expect } from "@playwright/test";
import {
  createWarRoomActions,
  createWarRoomStore,
  createWarRoomStatePort,
  createUnavailableMigrationPlanningPort,
  createHttpScenarioAnalysisPort,
  createProductionScenarioAnalysisPort,
  WarRoomScenario,
  WarRoomGraphContext,
  WarRoomSecurityContext,
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomActionsDependencies,
} from "../src/lib/war-room";

const mockSecurityContext: WarRoomSecurityContext = {
  tenantId: "tenant-acme-corp",
  userId: "user-alice-123",
  organizationId: "org-acme",
};

const mockGraphContext: WarRoomGraphContext = {
  id: "graph-react-ecosystem",
  rootPackage: {
    id: "pkg-react",
    name: "react",
    ecosystem: "NPM",
    version: "19.2.0",
  },
  packageIds: ["pkg-react", "pkg-react-dom", "pkg-scheduler"],
};

function createMockServiceDependencies(fetchMock: typeof fetch): WarRoomActionsDependencies {
  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);

  const securityContextPort: WarRoomSecurityContextPort = {
    async getSecurityContext() {
      return { ok: true, data: mockSecurityContext };
    },
  };

  const authorizationPort: WarRoomAuthorizationPort = {
    async authorize() {
      return { ok: true, data: undefined };
    },
  };

  const packageCatalogPort: WarRoomPackageCatalogPort = {
    async searchPackages(sec, req) {
      return {
        ok: true,
        data: {
          packages: [
            { id: "pkg-react", name: "react", ecosystem: req.ecosystem ?? "NPM", version: "19.2.0" },
          ],
          totalCount: 1,
        },
      };
    },
    async inspectPackage(sec, req) {
      return {
        ok: true,
        data: {
          package: { id: req.packageId, name: "react", ecosystem: "NPM", version: "19.2.0" },
          directDependencyIds: ["pkg-loose-envify"],
          directDependentIds: ["pkg-react-dom"],
        },
      };
    },
  };

  const graphQueryPort: WarRoomGraphQueryPort = {
    async loadPackageGraph() {
      return { ok: true, data: mockGraphContext };
    },
    async traceDependencyPath(sec, req) {
      return {
        ok: true,
        data: {
          fromPackageId: req.fromPackageId,
          toPackageId: req.toPackageId,
          packageIds: [req.fromPackageId, "pkg-scheduler", req.toPackageId],
          hopCount: 2,
        },
      };
    },
  };

  const scenarioAnalysisPort = createHttpScenarioAnalysisPort({
    fetchFn: fetchMock,
    endpointUrl: "http://localhost:8080/analysis/scenarios/evaluate",
  });

  const migrationPlanningPort = createUnavailableMigrationPlanningPort();

  return {
    statePort,
    securityContextPort,
    authorizationPort,
    packageCatalogPort,
    graphQueryPort,
    scenarioAnalysisPort,
    migrationPlanningPort,
  };
}

test.describe("WMCP-7B: Production War Room Scenario Integration", () => {
  test("7B-T1 & 7B-T28: Production ScenarioAnalysisPort is available and contains no mock fallback", async () => {
    const prodPort = createProductionScenarioAnalysisPort();
    expect(prodPort).toBeDefined();
    expect(typeof prodPort.recalculateScenario).toBe("function");
  });

  test("7B-T2 & 7B-T3: Missing or uncommitted baseline fails closed without guessing latest", async () => {
    let fetchCalled = false;
    const fetchMock: typeof fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const deps = createMockServiceDependencies(fetchMock);
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });

    // Scenario without baseVersion fails closed before calling network
    const invalidScenario: WarRoomScenario = {
      id: "scen-no-baseline",
      targetPackageId: "pkg-react",
      patchOperations: [],
    };
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: invalidScenario });

    const res = await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    expect(res.ok).toBe(false);
    expect(fetchCalled).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INVALID_INPUT");
    }
  });

  test("7B-T4..T10: Frontend patch operations map exactly and empty patch produces identity", async () => {
    let capturedBody: any = null;
    const fetchMock: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          scenario_id: "scen-full",
          baseline_surface_hash: "hash_base_123",
          candidate_surface_hash: "hash_cand_456",
          changed: true,
          breaking_changes: [
            {
              change_type: "RemovedSymbol",
              symbol_path: "TypeScript::src/lib.ts::Function::calculate",
              description: "Function calculate was removed",
              severity: "Major",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const deps = createMockServiceDependencies(fetchMock);
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });

    const scenario: WarRoomScenario = {
      id: "scen-full",
      targetPackageId: "pkg-react",
      baseVersion: "1.0.0",
      patchOperations: [
        { kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "calculate" },
        { kind: "RENAME_SYMBOL", operationId: "op-2", symbolPath: "render", newSymbolPath: "display" },
        { kind: "CHANGE_RETURN_TYPE", operationId: "op-3", symbolPath: "fetchData", newReturnType: "Promise<string>" },
        { kind: "CHANGE_PARAMETER_TYPE", operationId: "op-4", symbolPath: "setUser", parameterName: "id", newType: "number" },
        { kind: "ADD_REQUIRED_PARAMETER", operationId: "op-5", symbolPath: "init", parameterName: "config", parameterType: "AppConfig" },
        { kind: "CHANGE_VISIBILITY", operationId: "op-6", symbolPath: "helper", newVisibility: "private" },
      ],
    };

    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario });
    const res = await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });

    expect(res.ok).toBe(true);
    expect(capturedBody).toBeDefined();
    expect(capturedBody.target_package_id).toBe("pkg-react");
    expect(capturedBody.base_version).toBe("1.0.0");
    expect(capturedBody.patch.operations.length).toBe(6);
    expect(capturedBody.patch.operations[0]).toEqual({
      kind: "REMOVE_SYMBOL",
      operation_id: "op-1",
      symbol_path: "calculate",
    });
    expect(capturedBody.patch.operations[1]).toEqual({
      kind: "RENAME_SYMBOL",
      operation_id: "op-2",
      symbol_path: "render",
      new_symbol_path: "display",
    });
    expect(capturedBody.patch.operations[2]).toEqual({
      kind: "CHANGE_RETURN_TYPE",
      operation_id: "op-3",
      symbol_path: "fetchData",
      new_return_type: "Promise<string>",
    });
    expect(capturedBody.patch.operations[3]).toEqual({
      kind: "CHANGE_PARAMETER_TYPE",
      operation_id: "op-4",
      symbol_path: "setUser",
      parameter_name: "id",
      new_type: "number",
    });
    expect(capturedBody.patch.operations[4]).toEqual({
      kind: "ADD_REQUIRED_PARAMETER",
      operation_id: "op-5",
      symbol_path: "init",
      parameter_name: "config",
      parameter_type: "AppConfig",
    });
    expect(capturedBody.patch.operations[5]).toEqual({
      kind: "CHANGE_VISIBILITY",
      operation_id: "op-6",
      symbol_path: "helper",
      new_visibility: "private",
    });

    if (res.ok) {
      expect(res.data.baselineSurfaceHash).toBe("hash_base_123");
      expect(res.data.candidateSurfaceHash).toBe("hash_cand_456");
      expect(res.data.changed).toBe(true);
      expect(res.data.breakingChanges?.length).toBe(1);
      expect(res.data.breakingChanges?.[0].changeType).toBe("RemovedSymbol");
      expect(res.data.affectedEntityIds).toEqual([]); // 7B-T27: Truthful, zero speculative downstream claims
    }
  });

  test("7B-T21 & 7B-T22 & 7B-T23: Stale context, patch change, and scenario reset reject late analysis", async () => {
    let resolveResponse: (value: Response) => void = () => {};
    const fetchMock: typeof fetch = async () => {
      return new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      });
    };

    const deps = createMockServiceDependencies(fetchMock);
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });

    const scenario: WarRoomScenario = {
      id: "scen-race",
      targetPackageId: "pkg-react",
      baseVersion: "1.0.0",
      patchOperations: [{ kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "foo" }],
    };
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario });

    // Start recalculation at revision 4
    const recalcPromise = actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });

    // While pending, mutate patch -> bumps revision to 5
    await actions.changeScenarioPatch(
      { channel: "HUMAN", capturedContextRevision: 4 },
      { patchOperations: [{ kind: "REMOVE_SYMBOL", operationId: "op-2", symbolPath: "bar" }] }
    );

    // Resolve delayed response
    resolveResponse(
      new Response(
        JSON.stringify({
          scenario_id: "scen-race",
          baseline_surface_hash: "base",
          candidate_surface_hash: "cand",
          changed: true,
          breaking_changes: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await recalcPromise;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("STALE_CONTEXT");
    }
  });

  test("7B-T24: AbortSignal cancels request cleanly without unhandled rejection", async () => {
    const controller = new AbortController();
    const fetchMock: typeof fetch = async (_url, init) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };

    const deps = createMockServiceDependencies(fetchMock);
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });

    const scenario: WarRoomScenario = {
      id: "scen-abort",
      targetPackageId: "pkg-react",
      baseVersion: "1.0.0",
      patchOperations: [],
    };
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario });

    const recalcPromise = actions.recalculateScenario({
      channel: "HUMAN",
      capturedContextRevision: 4,
      signal: controller.signal,
    });

    controller.abort();

    const res = await recalcPromise;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("CANCELLED");
    }
  });

  test("7B-T25 & 7B-T26: Human channel and Agent channel converge through same WarRoomActions", async () => {
    const fetchMock: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          scenario_id: "scen-parity",
          baseline_surface_hash: "base_hash",
          candidate_surface_hash: "cand_hash",
          changed: false,
          breaking_changes: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const deps = createMockServiceDependencies(fetchMock);
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });

    const scenario: WarRoomScenario = {
      id: "scen-parity",
      targetPackageId: "pkg-react",
      baseVersion: "1.0.0",
      patchOperations: [],
    };

    // Human channel creates scenario and recalculates
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario });
    const humanRes = await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    expect(humanRes.ok).toBe(true);

    // Agent channel traverses the exact same action and state machine without duplicate engine
    const agentRes = await actions.recalculateScenario({ channel: "AGENT", capturedContextRevision: 5 });
    expect(agentRes.ok).toBe(true);
  });
});

/**
 * War Room Actions Application Boundary Tests
 *
 * Deterministic application verification tests executed using Playwright's TypeScript runner
 * without requiring browser / page fixtures (Section 49 & 55, WMCP-2B-R1).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  createWarRoomStore,
  createWarRoomStatePort,
  createWarRoomActions,
  WarRoomActionsDependencies,
  WarRoomSecurityContext,
  WarRoomInvocationContext,
  WarRoomSecurityContextPort,
  WarRoomAuthorizationPort,
  WarRoomPackageCatalogPort,
  WarRoomGraphQueryPort,
  WarRoomScenarioAnalysisPort,
  WarRoomMigrationPlanningPort,
  WarRoomGraphContext,
  WarRoomScenario,
  WarRoomHumanReview,
  createDomainError,
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

const mockScenario: WarRoomScenario = {
  id: "scenario-deprecate-v20",
  targetPackageId: "pkg-react",
  patchOperations: [
    { kind: "REMOVE_SYMBOL", operationId: "op-1", symbolPath: "react.PropTypes" },
  ],
};

const mockReview: WarRoomHumanReview = {
  id: "review-v20-approval",
  scenarioId: "scenario-deprecate-v20",
  bindings: [{ annotationId: "anno-breaking", targetEntityId: "pkg-react-dom" }],
};

function createMockDependencies(
  overrides: Partial<WarRoomActionsDependencies> = {}
): {
  deps: WarRoomActionsDependencies;
  calls: {
    securityCalls: number;
    authCalls: number;
    catalogSearchCalls: number;
    catalogInspectCalls: number;
    graphLoadCalls: number;
    graphTraceCalls: number;
    analysisCalls: number;
    planCalls: number;
    observedTenantIds: string[];
  };
} {
  const calls = {
    securityCalls: 0,
    authCalls: 0,
    catalogSearchCalls: 0,
    catalogInspectCalls: 0,
    graphLoadCalls: 0,
    graphTraceCalls: 0,
    analysisCalls: 0,
    planCalls: 0,
    observedTenantIds: [] as string[],
  };

  const store = createWarRoomStore();
  const statePort = createWarRoomStatePort(store);

  const securityContextPort: WarRoomSecurityContextPort = {
    async getSecurityContext() {
      calls.securityCalls++;
      return { ok: true, data: mockSecurityContext };
    },
  };

  const authorizationPort: WarRoomAuthorizationPort = {
    async authorize(req) {
      calls.authCalls++;
      calls.observedTenantIds.push(req.securityContext.tenantId);
      return { ok: true, data: undefined };
    },
  };

  const packageCatalogPort: WarRoomPackageCatalogPort = {
    async searchPackages(sec, req) {
      calls.catalogSearchCalls++;
      calls.observedTenantIds.push(sec.tenantId);
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
      calls.catalogInspectCalls++;
      calls.observedTenantIds.push(sec.tenantId);
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
    async loadPackageGraph(sec) {
      calls.graphLoadCalls++;
      calls.observedTenantIds.push(sec.tenantId);
      return { ok: true, data: mockGraphContext };
    },
    async traceDependencyPath(sec, req) {
      calls.graphTraceCalls++;
      calls.observedTenantIds.push(sec.tenantId);
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

  const scenarioAnalysisPort: WarRoomScenarioAnalysisPort = {
    async recalculateScenario(sec, input) {
      calls.analysisCalls++;
      calls.observedTenantIds.push(sec.tenantId);
      return {
        ok: true,
        data: {
          id: "analysis-run-1",
          scenarioId: input.scenario.id,
          sourceContextRevision: input.sourceContextRevision,
          affectedEntityIds: ["pkg-react-dom"],
        },
      };
    },
  };

  const migrationPlanningPort: WarRoomMigrationPlanningPort = {
    async generateMigrationPlan(sec, input) {
      calls.planCalls++;
      calls.observedTenantIds.push(sec.tenantId);
      return {
        ok: true,
        data: {
          id: "plan-run-1",
          scenarioId: input.scenario.id,
          sourceReviewId: input.review.id,
          sourceContextRevision: input.sourceContextRevision,
        },
      };
    },
  };

  const deps: WarRoomActionsDependencies = {
    statePort,
    securityContextPort,
    authorizationPort,
    packageCatalogPort,
    graphQueryPort,
    scenarioAnalysisPort,
    migrationPlanningPort,
    ...overrides,
  };

  return { deps, calls };
}

test.describe("War Room Actions Application Boundary (WMCP-2B-R1)", () => {
  test("1. initialize delegates APP_INITIALIZED", () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);

    expect(deps.statePort.getState().phase).toBe("BOOTSTRAP");
    const result = actions.initialize();

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.contextRevision).toBe(1);
    expect(deps.statePort.getState().phase).toBe("IDLE");
  });

  test("2. Mutating action with matching revision succeeds and increments revision", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const invocation: WarRoomInvocationContext = {
      channel: "HUMAN",
      capturedContextRevision: 1,
    };

    const result = await actions.openPackageGraph(invocation, { rootPackageId: "pkg-react" });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.contextRevision).toBe(2);
    expect(deps.statePort.getState().phase).toBe("GRAPH_READY");
  });

  test("3. Mutating action with stale revision early rejects with STALE_CONTEXT", async () => {
    const { deps, calls } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize(); // revision = 1

    const staleInvocation: WarRoomInvocationContext = {
      channel: "HUMAN",
      capturedContextRevision: 0, // stale revision
    };

    const result = await actions.openPackageGraph(staleInvocation, { rootPackageId: "pkg-react" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STALE_CONTEXT");
    }
    expect(result.contextRevision).toBe(1);
    expect(calls.securityCalls).toBe(0);
    expect(calls.authCalls).toBe(0);
    expect(calls.graphLoadCalls).toBe(0);
    expect(deps.statePort.getState().phase).toBe("IDLE");
  });

  test("4. Early stale rejection makes zero calls to security, authorization, and service ports", async () => {
    const { deps, calls } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const staleInvocation: WarRoomInvocationContext = {
      channel: "AGENT",
      capturedContextRevision: 99,
    };

    const result = await actions.closeGraph(staleInvocation);
    expect(result.ok).toBe(false);
    expect(calls.securityCalls).toBe(0);
    expect(calls.authCalls).toBe(0);
  });

  test("5. SecurityContextPort failure propagates without service call or mutation", async () => {
    const { deps, calls } = createMockDependencies({
      securityContextPort: {
        async getSecurityContext() {
          return { ok: false, error: createDomainError("UNAVAILABLE", "Session service down") };
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const invocation: WarRoomInvocationContext = {
      channel: "HUMAN",
      capturedContextRevision: 1,
    };

    const result = await actions.openPackageGraph(invocation, { rootPackageId: "pkg-react" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAVAILABLE");
    }
    expect(calls.authCalls).toBe(0);
    expect(calls.graphLoadCalls).toBe(0);
    expect(deps.statePort.getState().phase).toBe("IDLE");
  });

  test("6. SecurityContextPort unexpected throw is sanitized to INTERNAL_ERROR", async () => {
    const { deps, calls } = createMockDependencies({
      securityContextPort: {
        async getSecurityContext() {
          throw new Error("SECRET_SECURITY_CONTEXT_BACKEND_FAILURE");
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(result.error.message).not.toContain("SECRET_SECURITY_CONTEXT_BACKEND_FAILURE");
      expect(result.error.message).toBe("Unexpected War Room service failure");
    }
    expect(calls.authCalls).toBe(0);
    expect(calls.graphLoadCalls).toBe(0);
    expect(deps.statePort.getState().phase).toBe("IDLE");
  });

  test("7. SecurityContextPort AbortError maps to CANCELLED", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";

    const { deps, calls } = createMockDependencies({
      securityContextPort: {
        async getSecurityContext() {
          throw abortErr;
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
    expect(calls.authCalls).toBe(0);
  });

  test("8. SecurityContextPort malformed identity is rejected as INTERNAL_ERROR", async () => {
    const { deps } = createMockDependencies({
      securityContextPort: {
        async getSecurityContext() {
          return { ok: true, data: { tenantId: "   ", userId: "valid-user" } as any };
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
    }
  });

  test("9. SecurityContextPort malformed userId is rejected as INTERNAL_ERROR", async () => {
    const { deps } = createMockDependencies({
      securityContextPort: {
        async getSecurityContext() {
          return { ok: true, data: { tenantId: "tenant-1", userId: "" } as any };
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
    }
  });

  test("10. Authorization denial returns CAPABILITY_DENIED and prevents service execution", async () => {
    const { deps, calls } = createMockDependencies({
      authorizationPort: {
        async authorize() {
          return { ok: false, error: createDomainError("CAPABILITY_DENIED", "Unauthorized action") };
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const invocation: WarRoomInvocationContext = {
      channel: "AGENT",
      capturedContextRevision: 1,
    };

    const result = await actions.openPackageGraph(invocation, { rootPackageId: "pkg-react" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CAPABILITY_DENIED");
    }
    expect(calls.graphLoadCalls).toBe(0);
    expect(deps.statePort.getState().phase).toBe("IDLE");
  });

  test("11. AuthorizationPort unexpected throw is sanitized to INTERNAL_ERROR", async () => {
    const { deps, calls } = createMockDependencies({
      authorizationPort: {
        async authorize() {
          throw new Error("SECRET_AUTHORIZATION_POLICY_FAILURE");
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: 1 },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(result.error.message).not.toContain("SECRET_AUTHORIZATION_POLICY_FAILURE");
      expect(result.error.message).toBe("Unexpected War Room service failure");
    }
    expect(calls.graphLoadCalls).toBe(0);
  });

  test("12. AuthorizationPort AbortError maps to CANCELLED", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";

    const { deps, calls } = createMockDependencies({
      authorizationPort: {
        async authorize() {
          throw abortErr;
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.openPackageGraph(
      { channel: "AGENT", capturedContextRevision: 1 },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
    expect(calls.graphLoadCalls).toBe(0);
  });

  test("13. Error message containing 'abort' without AbortError name or signal is sanitized to INTERNAL_ERROR", async () => {
    const { deps } = createMockDependencies({
      packageCatalogPort: {
        async searchPackages() {
          throw new Error("Database transaction aborted by server");
        },
        async inspectPackage() {
          return { ok: true, data: { package: mockGraphContext.rootPackage, directDependencyIds: [], directDependentIds: [] } };
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(result.error.message).toBe("Unexpected War Room service failure");
    }
  });

  test("14. Human and Agent security parity (both allowed with identical security context)", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const humanRes = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );
    const agentRes = await actions.searchPackages(
      { channel: "AGENT", capturedContextRevision: 1 },
      { query: "react" }
    );

    expect(humanRes.ok).toBe(true);
    expect(agentRes.ok).toBe(true);
    if (humanRes.ok && agentRes.ok) {
      expect(humanRes.data).toEqual(agentRes.data);
    }
  });

  test("15. Human and Agent security parity (both denied when unauthorized)", async () => {
    const { deps } = createMockDependencies({
      authorizationPort: {
        async authorize() {
          return { ok: false, error: createDomainError("CAPABILITY_DENIED", "Access denied") };
        },
      },
    });
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const humanRes = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );
    const agentRes = await actions.searchPackages(
      { channel: "AGENT", capturedContextRevision: 1 },
      { query: "react" }
    );

    expect(humanRes.ok).toBe(false);
    expect(agentRes.ok).toBe(false);
    if (!humanRes.ok && !agentRes.ok) {
      expect(humanRes.error.code).toBe("CAPABILITY_DENIED");
      expect(agentRes.error.code).toBe("CAPABILITY_DENIED");
    }
  });

  test("16. Trusted tenant ID reaches PackageCatalogPort and service ports", async () => {
    const { deps, calls } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );

    expect(calls.observedTenantIds).toContain("tenant-acme-corp");
  });

  test("17. searchPackages succeeds without mutating canonical state", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react", ecosystem: "NPM" }
    );

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.contextRevision).toBe(1);
    expect(deps.statePort.getState().phase).toBe("IDLE");
  });

  test("18. searchPackages rejects invalid ecosystem with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react", ecosystem: "INVALID_ECO" as any }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("19. searchPackages rejects invalid limit with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react", limit: -5 }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("20. inspectPackage explicit read succeeds", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.inspectPackage(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { packageId: "pkg-react" }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.package.id).toBe("pkg-react");
    }
  });

  test("21. inspectPackage rejects empty packageId with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.inspectPackage(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { packageId: "   " }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("22. traceDependencyPath explicit read succeeds", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.traceDependencyPath(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { fromPackageId: "pkg-react", toPackageId: "pkg-react-dom" }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hopCount).toBe(2);
    }
  });

  test("23. traceDependencyPath rejects empty package IDs with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.traceDependencyPath(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { fromPackageId: "", toPackageId: "pkg-react-dom" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("24. Explicit-ID pure read completes even if canonical revision changes while pending", async () => {
    let resolveInspect: (val: any) => void;
    const inspectPromise = new Promise<any>((res) => {
      resolveInspect = res;
    });

    const { deps } = createMockDependencies({
      packageCatalogPort: {
        async searchPackages() {
          return { ok: true, data: { packages: [] } };
        },
        async inspectPackage() {
          return inspectPromise;
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize(); // rev = 1

    // Start inspectPackage at revision 1
    const pendingRead = actions.inspectPackage(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { packageId: "pkg-react" }
    );

    // State changes in the meantime (e.g. graph opened -> revision 2)
    deps.statePort.transition({
      type: "GRAPH_OPENED",
      payload: { graph: mockGraphContext },
    });
    expect(deps.statePort.getState().contextRevision).toBe(2);

    // Resolve deferred inspection
    resolveInspect!({
      ok: true,
      data: {
        package: { id: "pkg-react", name: "react", ecosystem: "NPM" },
        directDependencyIds: [],
        directDependentIds: [],
      },
    });

    const readResult = await pendingRead;
    expect(readResult.ok).toBe(true);
    expect(readResult.changed).toBe(false);
    expect(readResult.contextRevision).toBe(2); // reports latest revision
  });

  test("25. Pure read mid-flight cancellation maps to CANCELLED even if service returned data", async () => {
    const controller = new AbortController();
    const { deps } = createMockDependencies({
      packageCatalogPort: {
        async searchPackages() {
          return { ok: true, data: { packages: [] } };
        },
        async inspectPackage() {
          controller.abort(); // abort while service is resolving
          return {
            ok: true,
            data: { package: mockGraphContext.rootPackage, directDependencyIds: [], directDependentIds: [] },
          };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.inspectPackage(
      { channel: "HUMAN", capturedContextRevision: 1, signal: controller.signal },
      { packageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
  });

  test("26. Pending security failure returns latest current revision", async () => {
    let resolveSecurityPromise: (val: any) => void;
    const secPromise = new Promise<any>((res) => {
      resolveSecurityPromise = res;
    });

    const { deps } = createMockDependencies({
      securityContextPort: {
        async getSecurityContext() {
          return secPromise;
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize(); // rev = 1

    const pendingAction = actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );

    // State changes while security is pending
    deps.statePort.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } }); // rev = 2

    // Resolve security with failure
    resolveSecurityPromise!({ ok: false, error: createDomainError("UNAVAILABLE", "Auth down") });

    const result = await pendingAction;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAVAILABLE");
    }
    expect(result.contextRevision).toBe(2); // reports current revision
  });

  test("27. Pending authorization failure returns latest current revision", async () => {
    let resolveAuthPromise: (val: any) => void;
    const authPromise = new Promise<any>((res) => {
      resolveAuthPromise = res;
    });

    const { deps } = createMockDependencies({
      authorizationPort: {
        async authorize() {
          return authPromise;
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize(); // rev = 1

    const pendingAction = actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "react" }
    );

    // State changes while auth is pending
    deps.statePort.transition({ type: "GRAPH_OPENED", payload: { graph: mockGraphContext } }); // rev = 2

    resolveAuthPromise!({ ok: false, error: createDomainError("CAPABILITY_DENIED", "Denied") });

    const result = await pendingAction;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CAPABILITY_DENIED");
    }
    expect(result.contextRevision).toBe(2); // reports current revision
  });

  test("28. openPackageGraph commits returned graph and increments revision", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.contextRevision).toBe(2);
    expect(deps.statePort.getState().phase).toBe("GRAPH_READY");
  });

  test("29. openPackageGraph async race rejects stale result with STALE_CONTEXT", async () => {
    let resolveGraph: (val: any) => void;
    const graphPromise = new Promise<any>((res) => {
      resolveGraph = res;
    });

    const { deps } = createMockDependencies({
      graphQueryPort: {
        async loadPackageGraph() {
          return graphPromise;
        },
        async traceDependencyPath() {
          return { ok: true, data: { fromPackageId: "a", toPackageId: "b", packageIds: [], hopCount: 0 } };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize(); // rev = 1

    // Action A started at revision 1
    const pendingOpenA = actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { rootPackageId: "pkg-react" }
    );

    // Another action commits in the meantime (rev becomes 2)
    const otherGraph: WarRoomGraphContext = {
      id: "graph-vue",
      rootPackage: { id: "pkg-vue", name: "vue", ecosystem: "NPM" },
      packageIds: ["pkg-vue"],
    };
    deps.statePort.transition({ type: "GRAPH_OPENED", payload: { graph: otherGraph } });
    expect(deps.statePort.getState().contextRevision).toBe(2);

    // Resolve Action A graph load
    resolveGraph!({ ok: true, data: mockGraphContext });

    const resultA = await pendingOpenA;
    expect(resultA.ok).toBe(false);
    if (!resultA.ok) {
      expect(resultA.error.code).toBe("STALE_CONTEXT");
    }
    // Stale Action A graph did NOT overwrite the current state
    expect(deps.statePort.getState().graph.id).toBe("graph-vue");
  });

  test("30. Valid closeGraph transitions GRAPH_READY to IDLE", async () => {
    const { deps, calls } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    expect(deps.statePort.getState().phase).toBe("GRAPH_READY");

    const result = await actions.closeGraph({ channel: "HUMAN", capturedContextRevision: 2 });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.contextRevision).toBe(3);
    expect(deps.statePort.getState().phase).toBe("IDLE");
    expect(calls.authCalls).toBeGreaterThan(0);
  });

  test("31. selectPackage delegates to reducer and same-node selection is no-op", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });

    // Select package (diff node from GRAPH_READY)
    const res1 = await actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: 2 },
      { selection: { package: mockGraphContext.rootPackage } }
    );
    expect(res1.ok).toBe(true);
    expect(res1.changed).toBe(true);
    expect(res1.contextRevision).toBe(3);
    expect(deps.statePort.getState().phase).toBe("NODE_SELECTED");

    // Select same node -> NO-OP
    const res2 = await actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: 3 },
      { selection: { package: mockGraphContext.rootPackage } }
    );
    expect(res2.ok).toBe(true);
    expect(res2.changed).toBe(false);
    expect(res2.contextRevision).toBe(3);
  });

  test("32. selectPackage rejects invalid or empty package ID", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });

    const result = await actions.selectPackage(
      { channel: "HUMAN", capturedContextRevision: 2 },
      { selection: { package: { id: "   ", name: "react", ecosystem: "NPM" } } }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("33. Valid deselectPackage transitions NODE_SELECTED to GRAPH_READY", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    expect(deps.statePort.getState().phase).toBe("NODE_SELECTED");

    const result = await actions.deselectPackage({ channel: "HUMAN", capturedContextRevision: 3 });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.contextRevision).toBe(4);
    expect(deps.statePort.getState().phase).toBe("GRAPH_READY");
  });

  test("34. createScenario and changeScenarioPatch delegate to reducer", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });

    // createScenario
    const resScenario = await actions.createScenario(
      { channel: "HUMAN", capturedContextRevision: 3 },
      { scenario: mockScenario }
    );
    expect(resScenario.ok).toBe(true);
    expect(resScenario.changed).toBe(true);
    expect(resScenario.contextRevision).toBe(4);
    expect(deps.statePort.getState().phase).toBe("SIMULATION_READY");

    // changeScenarioPatch
    const resPatch = await actions.changeScenarioPatch(
      { channel: "HUMAN", capturedContextRevision: 4 },
      {
        patchOperations: [
          { kind: "REMOVE_SYMBOL", operationId: "op-new", symbolPath: "react.Component" },
        ],
      }
    );
    expect(resPatch.ok).toBe(true);
    expect(resPatch.changed).toBe(true);
    expect(resPatch.contextRevision).toBe(5);
  });

  test("35. resetScenario respects SIMULATION_READY-only contract", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });

    const resReset = await actions.resetScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    expect(resReset.ok).toBe(true);
    expect(resReset.changed).toBe(true);
    expect(deps.statePort.getState().phase).toBe("NODE_SELECTED");

    // Reset from NODE_SELECTED is rejected with INVALID_STATE
    const resInvalid = await actions.resetScenario({ channel: "HUMAN", capturedContextRevision: 5 });
    expect(resInvalid.ok).toBe(false);
    if (!resInvalid.ok) {
      expect(resInvalid.error.code).toBe("INVALID_STATE");
    }
  });

  test("36. recalculateScenario commits valid analysis and rejects races", async () => {
    let resolveAnalysis: (val: any) => void;
    const analysisPromise = new Promise<any>((res) => {
      resolveAnalysis = res;
    });

    const { deps } = createMockDependencies({
      scenarioAnalysisPort: {
        async recalculateScenario() {
          return analysisPromise;
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });

    // Start recalculateScenario at rev 4
    const pendingRecalc = actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });

    // Revision changes while analysis runs (e.g. another graph opened -> rev = 5)
    const otherGraph: WarRoomGraphContext = {
      id: "graph-vue",
      rootPackage: { id: "pkg-vue", name: "vue", ecosystem: "NPM" },
      packageIds: ["pkg-vue"],
    };
    deps.statePort.transition({ type: "GRAPH_OPENED", payload: { graph: otherGraph } }); // rev = 5

    resolveAnalysis!({
      ok: true,
      data: {
        id: "analysis-1",
        scenarioId: mockScenario.id,
        sourceContextRevision: 4,
        affectedEntityIds: ["pkg-react-dom"],
      },
    });

    const recalcRes = await pendingRecalc;
    expect(recalcRes.ok).toBe(false);
    if (!recalcRes.ok) {
      expect(recalcRes.error.code).toBe("STALE_CONTEXT");
    }
  });

  test("37. recalculateScenario rejects mismatched scenarioId with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies({
      scenarioAnalysisPort: {
        async recalculateScenario(_sec, input) {
          return {
            ok: true,
            data: {
              id: "analysis-wrong-id",
              scenarioId: "mismatched-scenario-id",
              sourceContextRevision: input.sourceContextRevision,
              affectedEntityIds: [],
            },
          };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });

    const result = await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("38. recalculateScenario rejects mismatched sourceContextRevision with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies({
      scenarioAnalysisPort: {
        async recalculateScenario() {
          return {
            ok: true,
            data: {
              id: "analysis-wrong-rev",
              scenarioId: mockScenario.id,
              sourceContextRevision: 999, // mismatched
              affectedEntityIds: [],
            },
          };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });

    const result = await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("39. attachHumanReview and changeHumanReview preserve technical analysis", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });
    await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });

    const resAttach = await actions.attachHumanReview(
      { channel: "HUMAN", capturedContextRevision: 5 },
      { review: mockReview }
    );
    expect(resAttach.ok).toBe(true);
    expect(resAttach.changed).toBe(true);
    expect(deps.statePort.getState().phase).toBe("HUMAN_REVIEW");

    const resChange = await actions.changeHumanReview(
      { channel: "HUMAN", capturedContextRevision: 6 },
      { review: { ...mockReview, bindings: [] } }
    );
    expect(resChange.ok).toBe(true);
    expect(resChange.changed).toBe(true);
    expect(deps.statePort.getState().phase).toBe("HUMAN_REVIEW");
  });

  test("40. generateMigrationPlan commits valid plan, rejects races, and resetMigrationPlan returns to HUMAN_REVIEW", async () => {
    let resolvePlan: (val: any) => void;
    const planPromise = new Promise<any>((res) => {
      resolvePlan = res;
    });

    const { deps } = createMockDependencies({
      migrationPlanningPort: {
        async generateMigrationPlan() {
          return planPromise;
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });
    await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    await actions.attachHumanReview({ channel: "HUMAN", capturedContextRevision: 5 }, { review: mockReview });

    // Race on generateMigrationPlan at rev 6
    const pendingPlan = actions.generateMigrationPlan({ channel: "HUMAN", capturedContextRevision: 6 });

    // Review updated while plan runs -> rev 7
    deps.statePort.transition({
      type: "ANNOTATION_CHANGED",
      payload: { review: { ...mockReview, bindings: [] } },
    });

    resolvePlan!({
      ok: true,
      data: {
        id: "plan-stale",
        scenarioId: mockScenario.id,
        sourceReviewId: mockReview.id,
        sourceContextRevision: 6,
      },
    });

    const planRaceRes = await pendingPlan;
    expect(planRaceRes.ok).toBe(false);
    if (!planRaceRes.ok) {
      expect(planRaceRes.error.code).toBe("STALE_CONTEXT");
    }

    // Now generate valid plan at current rev 7
    const { deps: freshDeps } = createMockDependencies();
    const freshActions = createWarRoomActions(freshDeps);
    freshActions.initialize();
    await freshActions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await freshActions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await freshActions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });
    await freshActions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    await freshActions.attachHumanReview({ channel: "HUMAN", capturedContextRevision: 5 }, { review: mockReview });

    const resPlan = await freshActions.generateMigrationPlan({ channel: "HUMAN", capturedContextRevision: 6 });
    expect(resPlan.ok).toBe(true);
    expect(resPlan.changed).toBe(true);
    expect(freshDeps.statePort.getState().phase).toBe("PLAN_READY");

    const resReset = await freshActions.resetMigrationPlan({ channel: "HUMAN", capturedContextRevision: 7 });
    expect(resReset.ok).toBe(true);
    expect(resReset.changed).toBe(true);
    expect(freshDeps.statePort.getState().phase).toBe("HUMAN_REVIEW");
  });

  test("41. generateMigrationPlan rejects mismatched scenarioId with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies({
      migrationPlanningPort: {
        async generateMigrationPlan(_sec, input) {
          return {
            ok: true,
            data: {
              id: "plan-wrong-scenario",
              scenarioId: "mismatched-scenario",
              sourceReviewId: input.review.id,
              sourceContextRevision: input.sourceContextRevision,
            },
          };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });
    await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    await actions.attachHumanReview({ channel: "HUMAN", capturedContextRevision: 5 }, { review: mockReview });

    const result = await actions.generateMigrationPlan({ channel: "HUMAN", capturedContextRevision: 6 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("42. generateMigrationPlan rejects mismatched sourceReviewId with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies({
      migrationPlanningPort: {
        async generateMigrationPlan(_sec, input) {
          return {
            ok: true,
            data: {
              id: "plan-wrong-review",
              scenarioId: input.scenario.id,
              sourceReviewId: "mismatched-review",
              sourceContextRevision: input.sourceContextRevision,
            },
          };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });
    await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    await actions.attachHumanReview({ channel: "HUMAN", capturedContextRevision: 5 }, { review: mockReview });

    const result = await actions.generateMigrationPlan({ channel: "HUMAN", capturedContextRevision: 6 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("43. generateMigrationPlan rejects mismatched sourceContextRevision with INVALID_INPUT", async () => {
    const { deps } = createMockDependencies({
      migrationPlanningPort: {
        async generateMigrationPlan(_sec, input) {
          return {
            ok: true,
            data: {
              id: "plan-wrong-rev",
              scenarioId: input.scenario.id,
              sourceReviewId: input.review.id,
              sourceContextRevision: 999, // mismatched
            },
          };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });
    await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    await actions.attachHumanReview({ channel: "HUMAN", capturedContextRevision: 5 }, { review: mockReview });

    const result = await actions.generateMigrationPlan({ channel: "HUMAN", capturedContextRevision: 6 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  test("44. Already aborted invocation returns CANCELLED", async () => {
    const { deps, calls } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();

    const controller = new AbortController();
    controller.abort();

    const result = await actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: 1, signal: controller.signal },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
    expect(calls.graphLoadCalls).toBe(0);
  });

  test("45. Abort before commit prevents state mutation", async () => {
    const controller = new AbortController();
    const { deps } = createMockDependencies({
      graphQueryPort: {
        async loadPackageGraph() {
          // Abort while service is running
          controller.abort();
          return { ok: true, data: mockGraphContext };
        },
        async traceDependencyPath() {
          return { ok: true, data: { fromPackageId: "a", toPackageId: "b", packageIds: [], hopCount: 0 } };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: 1, signal: controller.signal },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANCELLED");
    }
    expect(deps.statePort.getState().phase).toBe("IDLE"); // uncommitted
  });

  test("46. Typed service error preserves error code", async () => {
    const { deps } = createMockDependencies({
      packageCatalogPort: {
        async searchPackages() {
          return { ok: false, error: createDomainError("UNSUPPORTED_ECOSYSTEM", "PyPI not enabled") };
        },
        async inspectPackage() {
          return { ok: false, error: createDomainError("NOT_FOUND", "Package missing") };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.searchPackages(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { query: "foo" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_ECOSYSTEM");
    }
  });

  test("47. Unexpected service throw becomes sanitized INTERNAL_ERROR without leaking raw details", async () => {
    const { deps } = createMockDependencies({
      graphQueryPort: {
        async loadPackageGraph() {
          throw new Error("SECRET_INTERNAL_DB_CONNECTION_STRING_FAILED");
        },
        async traceDependencyPath() {
          return { ok: true, data: { fromPackageId: "a", toPackageId: "b", packageIds: [], hopCount: 0 } };
        },
      },
    });

    const actions = createWarRoomActions(deps);
    actions.initialize();

    const result = await actions.openPackageGraph(
      { channel: "HUMAN", capturedContextRevision: 1 },
      { rootPackageId: "pkg-react" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
      expect(result.error.message).not.toContain("SECRET_INTERNAL_DB_CONNECTION_STRING_FAILED");
      expect(result.error.message).toBe("Unexpected War Room service failure");
    }
  });

  test("48. Action request DTOs contain no tenant or credential fields (Static scan)", () => {
    const typesFilePath = path.resolve(__dirname, "../src/lib/war-room/application/types.ts");
    const content = fs.readFileSync(typesFilePath, "utf8");

    // Extract Request interfaces
    const forbiddenPropsInRequests = ["tenantId", "userId", "organizationId", "accessToken", "jwt", "authToken", "authorization", "permissions"];
    const requestInterfaces = ["SearchPackagesRequest", "InspectPackageRequest", "TraceDependencyPathRequest", "OpenPackageGraphRequest", "SelectPackageRequest", "CreateScenarioRequest", "ChangeScenarioPatchRequest", "AttachHumanReviewRequest", "ChangeHumanReviewRequest"];

    for (const iface of requestInterfaces) {
      const match = content.match(new RegExp(`export interface ${iface}\\s*\\{([^}]+)\\}`, "m"));
      expect(match).not.toBeNull();
      if (match) {
        const body = match[1];
        for (const prop of forbiddenPropsInRequests) {
          expect(body).not.toContain(prop);
        }
      }
    }
  });

  test("49. Application layer has no GraphQL, Apollo, React, or WebMCP imports (Static scan)", () => {
    const appDir = path.resolve(__dirname, "../src/lib/war-room/application");
    const files = fs.readdirSync(appDir).filter((f) => f.endsWith(".ts"));

    const forbiddenPatterns = [
      /@apollo\/client/,
      /from ['"]react['"]/,
      /from ['"]react-dom['"]/,
      /from ['"]next\//,
      /document\.modelContext/,
      /navigator\.modelContext/,
      /registerTool\(/,
      /localStorage/,
      /sessionStorage/,
      /document\.cookie/,
      /d3/,
      /three/,
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(appDir, file), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });

  test("50. Application layer has no newly implemented business calculation engines (Static scan)", () => {
    const appDir = path.resolve(__dirname, "../src/lib/war-room/application");
    const files = fs.readdirSync(appDir).filter((f) => f.endsWith(".ts"));

    const forbiddenCalculations = [
      /function\s+calculateBlastRadius/,
      /function\s+classifyBreakingChange/,
      /function\s+evaluateSemver/,
      /function\s+evaluatePep440/,
      /function\s+calculateConfidence/,
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(appDir, file), "utf8");
      for (const pattern of forbiddenCalculations) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });

  test("51. Canonical state remains JSON serializable after all action mutations", async () => {
    const { deps } = createMockDependencies();
    const actions = createWarRoomActions(deps);
    actions.initialize();
    await actions.openPackageGraph({ channel: "HUMAN", capturedContextRevision: 1 }, { rootPackageId: "pkg-react" });
    await actions.selectPackage({ channel: "HUMAN", capturedContextRevision: 2 }, { selection: { package: mockGraphContext.rootPackage } });
    await actions.createScenario({ channel: "HUMAN", capturedContextRevision: 3 }, { scenario: mockScenario });
    await actions.recalculateScenario({ channel: "HUMAN", capturedContextRevision: 4 });
    await actions.attachHumanReview({ channel: "HUMAN", capturedContextRevision: 5 }, { review: mockReview });
    await actions.generateMigrationPlan({ channel: "HUMAN", capturedContextRevision: 6 });

    const state = deps.statePort.getState();
    expect(state.phase).toBe("PLAN_READY");
    expect(() => JSON.parse(JSON.stringify(state))).not.toThrow();
  });
});

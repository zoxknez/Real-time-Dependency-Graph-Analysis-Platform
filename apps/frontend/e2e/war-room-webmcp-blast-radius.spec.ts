import { test, expect } from "@playwright/test";
import {
  VersionConstraintEngine,
} from "../src/lib/war-room/domain/version-constraint-engine";
import {
  evaluateVersionAwareExposure,
  DirectDependentRecord,
} from "../src/lib/war-room/domain/version-exposure-engine";
import {
  createWarRoomStore,
  createWarRoomStatePort,
} from "../src/lib/war-room/state/store";
import {
  createWarRoomActions,
} from "../src/lib/war-room/application/actions";
import {
  createAdaptiveToolDefinition,
} from "../src/lib/webmcp/bridge/adaptive-tools";
import {
  WEB_MCP_TOOL_CATALOG,
  ALL_CANONICAL_ACTION_NAMES,
  CALCULATE_BLAST_RADIUS_SCHEMA,
} from "../src/lib/webmcp/bridge/adaptive-catalog";
import {
  MAX_TOTAL_OUTPUT_CHARS,
  buildBudgetedBlastRadiusOutput,
} from "../src/lib/webmcp/bridge/output";
import {
  WarRoomPackageRef,
  WarRoomGraphContext,
  WarRoomScenario,
} from "../src/lib/war-room/domain/types";
import {
  WarRoomInvocationContext,
} from "../src/lib/war-room/application/types";

function createMockHarness(initialState?: any) {
  const store = createWarRoomStore(initialState);
  const statePort = createWarRoomStatePort(store);

  const mockDeps = {
    statePort,
    securityContextPort: {
      getSecurityContext: async () => ({
        ok: true as const,
        data: {
          tenantId: "test-tenant",
          userId: "test-user",
          roles: ["admin"],
        },
      }),
    },
    authorizationPort: {
      authorize: async () => ({ ok: true as const, data: undefined }),
    },
    packageCatalogPort: {
      searchPackages: async () => ({ ok: true as const, data: { packages: [] } }),
      inspectPackage: async () => ({
        ok: true as const,
        data: {
          package: { id: "pkg-target", name: "target", ecosystem: "NPM" as const },
          directDependencyIds: [],
          directDependentIds: [],
        },
      }),
    },
    graphQueryPort: {
      loadPackageGraph: async () => ({
        ok: true as const,
        data: {
          id: "graph-1",
          rootPackage: { id: "pkg-target", name: "target", ecosystem: "NPM" as const },
          packageIds: ["pkg-target", "dep-1", "dep-2"],
        },
      }),
      traceDependencyPath: async () => ({
        ok: true as const,
        data: {
          fromPackageId: "a",
          toPackageId: "b",
          packageIds: ["a", "b"],
          hopCount: 1,
        },
      }),
      getDirectDependents: async (_sec: any, req: { packageId: string }) => {
        const records: DirectDependentRecord[] = [
          {
            dependentPackageId: "dep-a",
            name: "dep-a",
            ecosystem: "NPM",
            rawRequirement: "^1.2.0",
            depth: 1,
          },
          {
            dependentPackageId: "dep-b",
            name: "dep-b",
            ecosystem: "NPM",
            rawRequirement: "^2.0.0",
            depth: 1,
          },
          {
            dependentPackageId: "dep-c",
            name: "dep-c",
            ecosystem: "NPM",
            rawRequirement: undefined, // missing requirement
            depth: 1,
          },
        ];
        return { ok: true as const, data: records };
      },
    },
    scenarioAnalysisPort: {
      recalculateScenario: async () => ({
        ok: true as const,
        data: {
          id: "analysis-1",
          scenarioId: "scenario-1",
          sourceContextRevision: 1,
          affectedEntityIds: [],
          totalBreakingChanges: 2,
        },
      }),
    },
    migrationPlanningPort: {
      generateMigrationPlan: async () => ({
        ok: true as const,
        data: {
          id: "plan-1",
          scenarioId: "scenario-1",
          sourceReviewId: "review-1",
          sourceContextRevision: 1,
        },
      }),
    },
  };

  const actions = createWarRoomActions(mockDeps);
  return { store, actions, deps: mockDeps };
}

test.describe("WMCP-8: Version-Aware Dependency Exposure Matrix", () => {
  // ─────────────────────────────────────────────────────────────
  // 1. VERSION CONSTRAINT ENGINE DIALECTS & PARSING (8-T1..8-T11)
  // ─────────────────────────────────────────────────────────────

  test("8-T6 & 8-T7. NPM SemVer dialect satisfies and rejects accurately", () => {
    const sat = VersionConstraintEngine.evaluate("NPM", "^1.2.0", "1.2.3");
    expect(sat.status).toBe("SATISFIES");

    const rej = VersionConstraintEngine.evaluate("NPM", "^1.2.0", "2.0.0");
    expect(rej.status).toBe("DOES_NOT_SATISFY");

    const exactSat = VersionConstraintEngine.evaluate("NPM", "1.2.3", "1.2.3");
    expect(exactSat.status).toBe("SATISFIES");

    const exactRej = VersionConstraintEngine.evaluate("NPM", "1.2.3", "1.2.4");
    expect(exactRej.status).toBe("DOES_NOT_SATISFY");
  });

  test("8-T8 & 8-T9. PEP 440 Python dialect satisfies and rejects accurately", () => {
    const sat = VersionConstraintEngine.evaluate("PY_PI", ">=1.0, <2.0", "1.5.0");
    expect(sat.status).toBe("SATISFIES");

    const rej = VersionConstraintEngine.evaluate("PY_PI", ">=1.0, <2.0", "2.1.0");
    expect(rej.status).toBe("DOES_NOT_SATISFY");

    const compRelSat = VersionConstraintEngine.evaluate("PY_PI", "~=1.4.2", "1.4.9");
    expect(compRelSat.status).toBe("SATISFIES");

    const compRelRej = VersionConstraintEngine.evaluate("PY_PI", "~=1.4.2", "1.5.0");
    expect(compRelRej.status).toBe("DOES_NOT_SATISFY");

    const prefixSat = VersionConstraintEngine.evaluate("PY_PI", "==1.4.*", "1.4.10");
    expect(prefixSat.status).toBe("SATISFIES");

    const exclRej = VersionConstraintEngine.evaluate("PY_PI", "!=1.5", "1.5");
    expect(exclRej.status).toBe("DOES_NOT_SATISFY");
  });

  test("Cargo requirement dialect satisfies bare version as caret requirement", () => {
    // In Cargo, bare 1.2.3 means ^1.2.3
    const cargoSat = VersionConstraintEngine.evaluate("CARGO", "1.2.3", "1.3.0");
    expect(cargoSat.status).toBe("SATISFIES");

    const cargoRej = VersionConstraintEngine.evaluate("CARGO", "1.2.3", "2.0.0");
    expect(cargoRej.status).toBe("DOES_NOT_SATISFY");

    const cargoComma = VersionConstraintEngine.evaluate("CARGO", ">=1.0, <1.5", "1.2.0");
    expect(cargoComma.status).toBe("SATISFIES");
  });

  test("8-T10. Prerelease behavior follows parser specification", () => {
    // Under standard npm semantics, normal ranges DO NOT match prereleases
    const npmPreDefault = VersionConstraintEngine.evaluate("NPM", "^1.2.3", "1.3.0-beta.1");
    expect(npmPreDefault.status).toBe("DOES_NOT_SATISFY");

    const npmPreRange = VersionConstraintEngine.evaluate("NPM", ">=1.2.3 <2.0.0", "1.5.0-beta.1");
    expect(npmPreRange.status).toBe("DOES_NOT_SATISFY");

    // Explicit prerelease in range matches that prerelease line
    const npmPreExplicit = VersionConstraintEngine.evaluate("NPM", ">=1.2.3-alpha.1 <2.0.0", "1.2.3-alpha.2");
    expect(npmPreExplicit.status).toBe("SATISFIES");

    // In PEP 440, 2.0a1 is prior to 2.0
    const pepPre = VersionConstraintEngine.evaluate("PY_PI", "<2.0", "2.0a1");
    expect(pepPre.status).toBe("SATISFIES");

    // Cargo prereleases follow the same exclusion unless requested
    const cargoPre = VersionConstraintEngine.evaluate("CARGO", "^1.2.3", "1.3.0-alpha.1");
    expect(cargoPre.status).toBe("DOES_NOT_SATISFY");
  });

  test("A10. Cargo 0.x and 0.0.x compatibility semantics", () => {
    // 0.x.y: ^0.2.3 matches >=0.2.3 <0.3.0
    expect(VersionConstraintEngine.evaluate("CARGO", "^0.2.3", "0.2.4").status).toBe("SATISFIES");
    expect(VersionConstraintEngine.evaluate("CARGO", "^0.2.3", "0.3.0").status).toBe("DOES_NOT_SATISFY");
    expect(VersionConstraintEngine.evaluate("CARGO", "0.2.3", "0.2.5").status).toBe("SATISFIES");
    expect(VersionConstraintEngine.evaluate("CARGO", "0.2.3", "0.3.0").status).toBe("DOES_NOT_SATISFY");

    // 0.0.x: 0.0.3 matches only >=0.0.3 <0.0.4
    expect(VersionConstraintEngine.evaluate("CARGO", "0.0.3", "0.0.3").status).toBe("SATISFIES");
    expect(VersionConstraintEngine.evaluate("CARGO", "0.0.3", "0.0.4").status).toBe("DOES_NOT_SATISFY");
    expect(VersionConstraintEngine.evaluate("CARGO", "^0.0.3", "0.0.4").status).toBe("DOES_NOT_SATISFY");
  });

  test("A5. Query direction: getDirectDependents returns dependent -> target, never target dependencies", () => {
    // Asymmetric graph: A depends on T, T depends on Z
    const directDeps: DirectDependentRecord[] = [
      { dependentPackageId: "pkg-A", name: "A", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
    ];

    const exposure = evaluateVersionAwareExposure({
      targetPackageId: "pkg-T",
      proposedVersion: "1.1.0",
      breakingCandidate: false,
      directDependents: directDeps,
      topologicalReachabilityCount: 1,
    });

    expect(exposure.directDependentsTotal).toBe(1);
    expect(exposure.dependents[0].dependentPackageId).toBe("pkg-A");
    expect(exposure.dependents.map((d) => d.dependentPackageId)).not.toContain("pkg-Z");
  });

  test("8-T2 & 8-T11. Missing requirement stays UNKNOWN_MISSING_REQUIREMENT (never synthesized)", () => {
    const evalNull = VersionConstraintEngine.evaluate("NPM", null, "1.2.3");
    expect(evalNull.status).toBe("UNKNOWN_MISSING_REQUIREMENT");

    const evalEmpty = VersionConstraintEngine.evaluate("NPM", "   ", "1.2.3");
    expect(evalEmpty.status).toBe("UNKNOWN_MISSING_REQUIREMENT");
  });

  test("8-T3. Unsupported ecosystem stays UNKNOWN_UNSUPPORTED_ECOSYSTEM", () => {
    const evalUnsupported = VersionConstraintEngine.evaluate("MAVEN" as any, "[1.0, 2.0)", "1.5.0");
    expect(evalUnsupported.status).toBe("UNSUPPORTED_ECOSYSTEM");
  });

  test("8-T4. Malformed requirement returns typed INVALID_REQUIREMENT", () => {
    const invalidNpm = VersionConstraintEngine.evaluate("NPM", "invalid^^^range", "1.2.3");
    expect(invalidNpm.status).toBe("INVALID_REQUIREMENT");

    const invalidPep = VersionConstraintEngine.evaluate("PY_PI", "not an operator 1.0", "1.2.3");
    expect(invalidPep.status).toBe("INVALID_REQUIREMENT");
  });

  test("8-T5. Malformed proposed version returns typed INVALID_VERSION", () => {
    const invalidVer = VersionConstraintEngine.evaluate("NPM", "^1.0.0", "not-a-version");
    expect(invalidVer.status).toBe("INVALID_VERSION");

    const invalidPepVer = VersionConstraintEngine.evaluate("PY_PI", ">=1.0", "bad!!version");
    expect(invalidPepVer.status).toBe("INVALID_VERSION");
  });

  // ─────────────────────────────────────────────────────────────
  // 2. DOMAIN EXPOSURE EVALUATION (8-T12..8-T24)
  // ─────────────────────────────────────────────────────────────

  test("8-T12, 8-T13, 8-T14. Direct dependent exposure classification", () => {
    const directDeps: DirectDependentRecord[] = [
      { dependentPackageId: "pkg-exposed", name: "exposed", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
      { dependentPackageId: "pkg-blocked", name: "blocked", ecosystem: "NPM", rawRequirement: "^2.0.0", depth: 1 },
      { dependentPackageId: "pkg-unknown", name: "unknown", ecosystem: "NPM", rawRequirement: undefined, depth: 1 },
      { dependentPackageId: "pkg-unsupported", name: "unsupported", ecosystem: "GO", rawRequirement: "v1.0.0", depth: 1 },
    ];

    const res = evaluateVersionAwareExposure({
      targetPackageId: "pkg-target",
      proposedVersion: "1.5.0",
      breakingCandidate: true,
      directDependents: directDeps,
      topologicalReachabilityCount: 10,
    });

    expect(res.directDependentsTotal).toBe(4);
    expect(res.declaredRangeExposed).toBe(1);
    expect(res.declaredRangeBlocked).toBe(1);
    expect(res.unknownTotal).toBe(2);
    expect(res.exposedDependentIds).toEqual(["pkg-exposed"]);
    expect(res.blockedDependentIds).toEqual(["pkg-blocked"]);
    expect(res.unknownDependentIds).toEqual(["pkg-unknown", "pkg-unsupported"]);
    expect(res.topologicalReachabilityCount).toBe(10);
  });

  test("8-T15 & 8-T16. Breaking candidate composition distinguishes exposure from confirmed breakage", () => {
    const directDeps: DirectDependentRecord[] = [
      { dependentPackageId: "pkg-1", name: "pkg-1", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
      { dependentPackageId: "pkg-2", name: "pkg-2", ecosystem: "NPM", rawRequirement: "^2.0.0", depth: 1 },
    ];

    const res = evaluateVersionAwareExposure({
      targetPackageId: "pkg-target",
      proposedVersion: "1.2.0",
      breakingCandidate: true,
      directDependents: directDeps,
      topologicalReachabilityCount: 2,
    });

    expect(res.breakingCandidate).toBe(true);
    expect(res.declaredRangeExposed).toBe(1);
    expect(res.declaredRangeBlocked).toBe(1);
    // Exposed dependent is declaredRangeExposed to breaking candidate, not confirmed broken
    expect(res.dependents[0].status).toBe("DECLARED_RANGE_EXPOSED");
  });

  test("8-T17. Non-breaking candidate reports range acceptance without manufactured blast radius", () => {
    const directDeps: DirectDependentRecord[] = [
      { dependentPackageId: "pkg-1", name: "pkg-1", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
    ];

    const res = evaluateVersionAwareExposure({
      targetPackageId: "pkg-target",
      proposedVersion: "1.2.0",
      breakingCandidate: false,
      directDependents: directDeps,
      topologicalReachabilityCount: 1,
    });

    expect(res.breakingCandidate).toBe(false);
    expect(res.declaredRangeExposed).toBe(1);
    expect(res.declaredRangeBlocked).toBe(0);
  });

  test("8-T18 & 8-T19. Topological reachability remains strictly separate from direct constraint exposure", () => {
    // 10 reverse reachable, but only 3 direct dependents
    const directDeps: DirectDependentRecord[] = [
      { dependentPackageId: "d1", name: "d1", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
      { dependentPackageId: "d2", name: "d2", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
      { dependentPackageId: "d3", name: "d3", ecosystem: "NPM", rawRequirement: "^2.0.0", depth: 1 },
    ];

    const res = evaluateVersionAwareExposure({
      targetPackageId: "pkg-target",
      proposedVersion: "1.1.0",
      breakingCandidate: true,
      directDependents: directDeps,
      topologicalReachabilityCount: 10,
    });

    expect(res.topologicalReachabilityCount).toBe(10);
    expect(res.directDependentsTotal).toBe(3);
    expect(res.declaredRangeExposed).toBe(2);
    expect(res.declaredRangeBlocked).toBe(1);
  });

  test("8-T20 & 8-T22. Deterministic ordering and identical repeatability", () => {
    const directDeps: DirectDependentRecord[] = [
      { dependentPackageId: "zeta", name: "zeta", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
      { dependentPackageId: "alpha", name: "alpha", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
      { dependentPackageId: "beta", name: "beta", ecosystem: "NPM", rawRequirement: "^1.0.0", depth: 1 },
    ];

    const res1 = evaluateVersionAwareExposure({
      targetPackageId: "target",
      proposedVersion: "1.1.0",
      breakingCandidate: false,
      directDependents: directDeps,
      topologicalReachabilityCount: 3,
    });

    const res2 = evaluateVersionAwareExposure({
      targetPackageId: "target",
      proposedVersion: "1.1.0",
      breakingCandidate: false,
      directDependents: directDeps,
      topologicalReachabilityCount: 3,
    });

    expect(res1.dependents.map((d) => d.dependentPackageId)).toEqual(["alpha", "beta", "zeta"]);
    expect(res1).toEqual(res2);
  });

  test("8-T21. Result bounding metadata truthfully reports truncation", () => {
    const directDeps: DirectDependentRecord[] = Array.from({ length: 60 }, (_, i) => ({
      dependentPackageId: `pkg-${String(i).padStart(2, "0")}`,
      name: `pkg-${i}`,
      ecosystem: "NPM",
      rawRequirement: "^1.0.0",
      depth: 1,
    }));

    const res = evaluateVersionAwareExposure({
      targetPackageId: "target",
      proposedVersion: "1.1.0",
      breakingCandidate: false,
      directDependents: directDeps,
      topologicalReachabilityCount: 60,
      maxReturnedDependents: 50,
    });

    expect(res.directDependentsTotal).toBe(60);
    expect(res.returnedDependentsCount).toBe(50);
    expect(res.dependentsTruncated).toBe(true);
    expect(res.dependents.length).toBe(50);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. APPLICATION LAYER AUTHORITY & EQUIVALENCE (8-T25..8-T28)
  // ─────────────────────────────────────────────────────────────

  test("8-T25. Human and Agent share identical calculateBlastRadius authority", async () => {
    const rootPkg: WarRoomPackageRef = { id: "pkg-target", name: "target", ecosystem: "NPM" };
    const { actions } = createMockHarness({
      phase: "GRAPH_READY",
      contextRevision: 1,
      graph: { id: "g1", rootPackage: rootPkg, packageIds: ["pkg-target", "dep-a", "dep-b", "dep-c"] },
    });

    const humanInvocation: WarRoomInvocationContext = { channel: "HUMAN", capturedContextRevision: 1 };
    const agentInvocation: WarRoomInvocationContext = { channel: "AGENT", capturedContextRevision: 1 };

    const humanRes = await actions.calculateBlastRadius(humanInvocation, { proposedVersion: "1.5.0" });
    const agentRes = await actions.calculateBlastRadius(agentInvocation, { proposedVersion: "1.5.0" });

    expect(humanRes.ok).toBe(true);
    expect(agentRes.ok).toBe(true);
    if (humanRes.ok && agentRes.ok) {
      expect(humanRes.data).toEqual(agentRes.data);
      expect(humanRes.changed).toBe(false);
      expect(agentRes.changed).toBe(false);
      expect(humanRes.contextRevision).toBe(1);
      expect(agentRes.contextRevision).toBe(1);
    }
  });

  test("8-T27. calculateBlastRadius rejects target package override", async () => {
    const rootPkg: WarRoomPackageRef = { id: "pkg-target", name: "target", ecosystem: "NPM" };
    const { actions } = createMockHarness({
      phase: "GRAPH_READY",
      contextRevision: 1,
      graph: { id: "g1", rootPackage: rootPkg, packageIds: ["pkg-target"] },
    });

    const res = await actions.calculateBlastRadius(
      { channel: "AGENT", capturedContextRevision: 1 },
      { targetPackageId: "pkg-attacker-override", proposedVersion: "1.5.0" }
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INVALID_INPUT");
      expect(res.error.message).toContain("does not match authoritative context target");
    }
  });

  test("8-T24 & 8-T31. Missing proposedVersion fails closed without guessing or bumping", async () => {
    const rootPkg: WarRoomPackageRef = { id: "pkg-target", name: "target", ecosystem: "NPM" };
    const { actions } = createMockHarness({
      phase: "GRAPH_READY",
      contextRevision: 1,
      graph: { id: "g1", rootPackage: rootPkg, packageIds: ["pkg-target"] },
    });

    const resMissing = await actions.calculateBlastRadius(
      { channel: "AGENT", capturedContextRevision: 1 },
      {}
    );

    expect(resMissing.ok).toBe(false);
    if (!resMissing.ok) {
      expect(resMissing.error.code).toBe("INVALID_INPUT");
      expect(resMissing.error.message).toContain("Proposed version must be explicitly provided");
    }

    const resEmpty = await actions.calculateBlastRadius(
      { channel: "AGENT", capturedContextRevision: 1 },
      { proposedVersion: "" }
    );

    expect(resEmpty.ok).toBe(false);
    if (!resEmpty.ok) {
      expect(resEmpty.error.code).toBe("INVALID_INPUT");
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 4. WEBMCP TOOL DEFINTION & SCHEMA INTEGRITY (8-T26..8-T35)
  // ─────────────────────────────────────────────────────────────

  test("8-T26 & 8-T28. calculate_blast_radius schema is strict without raw queries or overrides", () => {
    expect(CALCULATE_BLAST_RADIUS_SCHEMA.additionalProperties).toBe(false);
    expect(Object.keys(CALCULATE_BLAST_RADIUS_SCHEMA.properties)).toEqual(["proposedVersion"]);
  });

  test("8-T29 & 8-T30. WebMCP output respects 1500 char budget and avoids confirmed breakage claims", () => {
    const directDeps: DirectDependentRecord[] = Array.from({ length: 30 }, (_, i) => ({
      dependentPackageId: `pkg-long-name-dependent-${i}`,
      name: `dep-${i}`,
      ecosystem: "NPM",
      rawRequirement: "^1.0.0",
      depth: 1,
    }));

    const exposure = evaluateVersionAwareExposure({
      targetPackageId: "pkg-target",
      proposedVersion: "1.2.0",
      breakingCandidate: true,
      directDependents: directDeps,
      topologicalReachabilityCount: 30,
    });

    const envelope = buildBudgetedBlastRadiusOutput("calculate_blast_radius", 1, exposure);
    expect(envelope.ok).toBe(true);
    const json = JSON.stringify(envelope);
    expect(json.length).toBeLessThanOrEqual(MAX_TOTAL_OUTPUT_CHARS);

    // No confirmed breakage terminology
    expect(json).not.toContain("confirmed broken");
    expect(json).not.toContain("definitely broken");

    if (envelope.ok) {
      expect((envelope as any).data.topExposedDependents.length).toBeLessThanOrEqual(5);
    }
  });

  test("8-T33, 8-T34, 8-T35. WebMCP Tool Vocabulary: 16 canonical tools, 14 executable, 2 deferred", () => {
    expect(ALL_CANONICAL_ACTION_NAMES.length).toBe(16);

    const executable = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "EXECUTABLE"
    );
    const deferred = ALL_CANONICAL_ACTION_NAMES.filter(
      (name) => WEB_MCP_TOOL_CATALOG[name].bindingStatus === "DEFERRED"
    );

    expect(executable.length).toBe(14);
    expect(deferred.length).toBe(2);

    expect(executable.sort()).toEqual([
      "calculate_blast_radius",
      "focus_graph_nodes",
      "inspect_critical_paths",
      "inspect_migration_plan",
      "inspect_scenario",
      "inspect_selected_package",
      "open_package_graph",
      "recalculate_scenario",
      "search_packages",
      "set_scenario_exclusion",
      "set_scenario_priority",
      "simulate_api_changes",
      "summarize_graph",
      "trace_dependency_path",
    ]);

    expect(deferred.sort()).toEqual([
      "focus_critical_path",
      "generate_migration_plan",
    ]);
  });

  test("8-T32. Execution abort returns CANCELLED without state mutation", async () => {
    const rootPkg: WarRoomPackageRef = { id: "pkg-target", name: "target", ecosystem: "NPM" };
    const harness = createMockHarness({
      phase: "GRAPH_READY",
      contextRevision: 1,
      graph: { id: "g1", rootPackage: rootPkg, packageIds: ["pkg-target"] },
    });

    const toolDef = createAdaptiveToolDefinition("calculate_blast_radius", {
      statePort: harness.deps.statePort,
      actions: harness.actions,
    });

    const controller = new AbortController();
    controller.abort();

    const output = await toolDef.execute({ proposedVersion: "1.5.0" }, { signal: controller.signal } as any);
    expect(output.ok).toBe(false);
    if (!output.ok) {
      expect((output as any).error.code).toBe("CANCELLED");
    }
  });
});

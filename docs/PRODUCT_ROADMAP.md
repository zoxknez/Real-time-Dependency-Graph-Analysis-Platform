# Product Roadmap: Dependency Impact Intelligence

Last updated: 2026-06-02

## Honest Position

This product should not try to become a broad SCA/SBOM/security dashboard. That space is already crowded by GitHub Dependabot and Dependency Graph, Snyk, Socket, OSV, OpenSSF Scorecard, and deps.dev.

The useful product direction is narrower:

> Real-time dependency blast-radius and breaking-change intelligence for package maintainers, AppSec teams, and platform teams.

The app should answer one hard question better than generic tools:

> If this package or version becomes vulnerable, yanked, malicious, or breaking, who is affected, through which paths, how badly, and what should be done first?

## Product Thesis

Teams do not need another vulnerability list. They need prioritization with evidence.

The first useful version must turn a package event into an evidence-backed impact report:

1. Which package/version changed or is vulnerable.
2. Which packages are directly and transitively affected.
3. Which dependency paths introduce the risk.
4. Which affected versions are actually in range.
5. Whether the new version is likely breaking.
6. What the recommended action is.
7. Why the recommendation is trustworthy.

The AI agent is valuable only as an explanation and orchestration layer over this evidence. It must not be the source of truth.

## Primary Users

### Package Maintainer

Question: "If I release this version, who might I break?"

Needs:
- Reverse dependents by depth.
- Top impacted projects.
- API diff and breaking-change confidence.
- Release-risk summary before publishing.

### AppSec Engineer

Question: "Which vulnerable dependency should I fix first?"

Needs:
- Vulnerability severity plus blast radius.
- Exploit/KEV/EPSS signals when available.
- Dependency paths from owned projects.
- Remediation priority and fixed versions.

### Platform / Developer Experience Team

Question: "Which shared dependencies are high-risk central points?"

Needs:
- Ecosystem-level dependency centrality.
- Hot packages with many downstream dependents.
- Update risk before fleet-wide upgrades.
- Reports that can be used in Slack, GitHub, Jira, or CI.

## Non-Goals For The First Useful Product

These can remain as supporting views, but must not define the product:

- Generic SBOM dashboard.
- Generic OpenSSF Scorecard dashboard.
- Generic SLSA/provenance checklist.
- Voice assistant demo.
- Semantic package search as a headline feature.
- Multi-page enterprise security portal.
- Claims about 100M+ package coverage until the data pipeline proves it.

SBOM, Scorecard, SLSA, and OSV are useful inputs. They are not the differentiator.

## Current State, Verified Locally

The app now runs end-to-end in Docker. API and frontend return 200, and the core services are healthy.

Current graph snapshot from Memgraph:

| Metric | Current value |
| --- | ---: |
| Packages | 1,255 |
| Versions | 40,500 |
| Version-level dependency edges | 286,723 |
| Package-level dependency edges | 1,766 |

Working examples:

- `impactRadius(packageId: "npm:tslib")` returns 17 direct impacted packages and 10,781 impacted versions.
- `reverseDependents(packageId: "npm:tslib")` returns the same 17 direct dependents.

Known gaps:

- `cargo:tokio` is shown in the UI examples, but the live graph currently contains npm data only.
- `impactRadius`, `reverseDependents`, and `dependencyPath` are still mostly direct-hop MVP queries.
- `DEPENDS_ON_PKG` exists and graph-writer creates it, but API queries do not yet fully use it for transitive blast-radius/path analysis.
- The analysis service can parse package tarballs, but `previous_version` is currently not populated from ingestion, so real breaking-change comparisons are not reliable yet.
- Semantic search runs with mock embeddings in Docker, so it is not a real product differentiator right now.
- Several security/SBOM/Scorecard pages are broader than the narrowed product direction and should be repositioned as supporting evidence.

## North Star Workflow

The product should converge on this flow:

1. User enters a package, version, vulnerability, or release candidate.
2. System resolves package identity and affected version range.
3. System calculates direct and transitive blast radius.
4. System shows the shortest and most common dependency paths.
5. System ranks affected packages by depth, centrality, exploitability, and ownership.
6. System compares API snapshots and changelog signals for breaking-change risk.
7. System generates an action report with evidence and remediation steps.
8. Agent explains the report and can answer follow-up questions grounded in the report.

If a feature does not strengthen this workflow, it is secondary.

## Roadmap

### Phase 0: Product Cut and Truthful Demo

Goal: make the existing app honest and focused.

Build:
- Rename product narrative around "Dependency Impact Intelligence".
- Make `/impact` the primary route.
- Keep `/security`, `/sbom`, `/supply-chain`, and `/agent-live` as secondary or hidden until they support the core workflow.
- Remove or hide UI quick examples that do not exist in the current graph, such as Cargo/PyPI examples before those ecosystems are populated.
- Add a deterministic demo dataset with at least 50 packages, 300 versions, and known transitive paths.
- Add a "data freshness and coverage" panel: packages, versions, dependency edges, ecosystems, last ingested event.

Acceptance criteria:
- A first-time user can open the app and immediately run a meaningful impact report.
- No primary UI example returns an empty graph unless it is clearly labeled as missing data.
- The app clearly states current ecosystem coverage.

Priority: immediate.

### Phase 1: Real Blast Radius

Goal: make impact analysis technically true enough to trust.

Build:
- Rewrite `GraphQueries::impact_radius`, `reverse_dependents_transitive`, and `dependency_path` to use `DEPENDS_ON_PKG`.
- Return direct and transitive dependents separately.
- Return depth distribution: depth 1, depth 2, depth 3+.
- Return dependency path samples for top impacted packages.
- Return "introduced by" direct dependencies where possible.
- Add a Memgraph backfill command for `DEPENDS_ON_PKG`.
- Add graph consistency checks to CI/dev verification.
- Add API contract tests with a small known graph fixture.

Acceptance criteria:
- For a known fixture, depth 1/2/3 counts exactly match expected values.
- `dependencyPath(A, C)` returns a transitive path when A -> B -> C exists.
- `/impact` can show direct vs transitive impact without guessing.
- Query latency stays under 1s for the local fixture and under 3s for the live local graph at depth 3.

Priority: P0.

### Phase 2: Version-Aware Vulnerability Impact

Goal: stop counting packages that are not actually affected by the vulnerable range.

Build:
- Normalize package IDs and purl-like identity across npm, PyPI, and Cargo.
- Integrate OSV affected version ranges into impact reports.
- Add semver/ecosystem version matching per dependency edge.
- Distinguish:
  - package depends on vulnerable package,
  - package depends on affected version range,
  - package has unknown version precision.
- Add fixed-version recommendation when OSV provides it.
- Add confidence flags for uncertain ranges.

Acceptance criteria:
- Impact report can say "17 packages depend on X, 9 are confirmed affected, 5 unknown, 3 not affected".
- OSV vulnerabilities are shown only as evidence, not as generic card spam.
- User can filter by confirmed, unknown, and not affected.

Priority: P0/P1.

### Phase 3: Breaking-Change Intelligence

Goal: make release risk a real differentiator.

Build:
- Populate `previous_version` for analysis events.
- Persist API snapshots by package/version in durable storage, not temp-only paths.
- Compare public API snapshots across adjacent versions.
- Combine AST diff, semver delta, changelog signals, and yanked status into a breaking-change confidence score.
- Attach impacted reverse dependents to each breaking-change event.
- Show "breaking risk before upgrade" in `/impact`.

Acceptance criteria:
- For a controlled package fixture, removed public symbols are detected and reported.
- Breaking-change report includes old version, new version, changed symbols, severity, confidence, and affected dependents.
- Agent can explain breaking risk using stored evidence, not free-form guessing.

Priority: P1.

### Phase 4: Evidence-First Agent

Goal: make the agent useful because the underlying report is useful.

Build:
- Restrict agent tools to evidence-backed operations:
  - search package,
  - get impact report,
  - get dependency paths,
  - get vulnerabilities,
  - get breaking-change report,
  - generate remediation summary.
- Make every agent answer cite tool outputs.
- Add a structured `ImpactReport` JSON schema.
- Add deterministic fallback when LLM provider is unavailable.
- Add "copy report" and "export JSON" actions from the same schema.

Acceptance criteria:
- Agent cannot claim impact counts not present in tool output.
- Agent final answer includes impacted counts, paths, evidence sources, and recommended action.
- Same report can be consumed by UI, API, and CLI.

Priority: P1/P2.

### Phase 5: Owned-Project Mode

Goal: move from public ecosystem curiosity to team workflow.

Build:
- Allow user to import a repository lockfile/SBOM.
- Map owned project dependencies into the graph.
- Show whether a public vulnerability affects the user's actual dependency tree.
- Add GitHub Action or CLI:
  - upload lockfile,
  - compute blast radius,
  - fail only on high-confidence policy violations.
- Add project-level saved reports.

Acceptance criteria:
- User can upload or scan one repo and get an impact report for their own dependency tree.
- Report distinguishes "ecosystem-wide impact" from "your project impact".
- CI output is concise enough for a pull request comment.

Priority: P2.

### Phase 6: Ecosystem Scale and Data Quality

Goal: make data coverage credible.

Build:
- Decide whether to build full registry backfill or use deps.dev as a reference/source for resolved dependency graphs.
- Add ingestion coverage metrics by ecosystem.
- Add retry/rate-limit dashboards.
- Add data quality checks:
  - packages without versions,
  - versions without BELONGS_TO,
  - dependencies without package projection,
  - cycles,
  - orphan dependency nodes.
- Add backfill jobs for npm first, then PyPI/Cargo.
- Keep a public "coverage status" page.

Acceptance criteria:
- Coverage numbers are visible and honest.
- No core page implies unsupported ecosystem coverage.
- Backfill can be resumed without corrupting graph state.

Priority: P2/P3.

## First 10 Engineering Tickets

1. Rename product surface to "Dependency Impact Intelligence" and make `/impact` the primary route.
2. Replace UI quick examples with packages present in the current live graph.
3. Implement transitive `impactRadius` using `DEPENDS_ON_PKG*1..N`.
4. Implement transitive `dependencyPath` using `DEPENDS_ON_PKG`.
5. Add `directCount`, `transitiveCount`, and `depthBuckets` to `ImpactRadiusResult`.
6. Add Memgraph fixture tests for impact/path queries.
7. Add graph health endpoint exposing package/version/edge counts and ecosystem coverage.
8. Backfill or verify `DEPENDS_ON_PKG` at service startup or as a one-shot job.
9. Populate `previous_version` for analysis events.
10. Create `ImpactReport` schema used by UI export and agent output.

## Product Shape After The Cut

Primary navigation:

- Impact
- Paths
- Live Events
- Packages
- Reports
- Settings

Secondary/evidence sections:

- Vulnerabilities
- SBOM
- Scorecard
- SLSA
- Agent

The homepage should not be a generic marketing dashboard. It should be the impact workbench.

## Differentiation Statement

Competing tools are strong at telling users that a vulnerability exists.

This product should be strong at telling users:

- how far the problem spreads,
- which paths introduce it,
- which affected packages matter most,
- whether an upgrade is likely to break dependents,
- what to do next.

That is the product.

## Risks

- If graph data is shallow, the product becomes a weak dashboard.
- If version ranges are ignored, impact numbers become misleading.
- If the agent speaks before evidence is solid, trust collapses.
- If the app keeps every broad security feature in first position, users will not understand what it is uniquely good at.
- If ecosystem coverage is overstated, serious users will leave quickly.

## External References

- CISA SBOM minimum elements: https://www.cisa.gov/resources-tools/resources/2025-minimum-elements-software-bill-materials-sbom
- GitHub Dependency Graph: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-the-dependency-graph
- GitHub SBOM export: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/exporting-a-software-bill-of-materials-for-your-repository
- OSV.dev: https://osv.dev/
- deps.dev API: https://docs.deps.dev/api/v3/
- OpenSSF Scorecard: https://openssf.org/scorecard/
- Snyk Open Source: https://docs.snyk.io/scan-with-snyk/snyk-open-source
- Socket features: https://socket.dev/features

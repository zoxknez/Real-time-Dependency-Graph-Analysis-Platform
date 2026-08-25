# WebMCP Challenge - Evidence Boundary & Claim Rules

## 1. Purpose

This document defines the strict classification rules for evidence, empirical truth, and technical claims throughout the WebMCP Challenge development.

It ensures that judge-visible claims, UI badges, agent summaries, and technical documentation maintain verifiable rigor without conflating assumptions with verified facts.

---

## 2. Evidence Categories

All codebase capabilities, data points, and evaluation results belong to exactly one of the following temporal and functional categories:

```
┌─────────────────────────────────────────────────────────────┐
│ A. PRE-CHALLENGE (At or before 864a3d6905826bd0fabab02...)  │
│    - Baseline repository structures, AST parsers, Memgraph  │
│    - Frozen & inventoried under WMCP-0A                     │
├─────────────────────────────────────────────────────────────┤
│ B. CHALLENGE-ADDED (Post-baseline challenge deliverables)   │
│    - War Room domain, WebMCP platform adapter, state machine│
│    - Counterfactual scenario engine, version-aware exposure │
│    - Blast Radius / Confidence models, human review, evals  │
├─────────────────────────────────────────────────────────────┤
│ C. POST-FREEZE (Post-September 2 candidate freeze)          │
│    - Any future extensions developed after challenge freeze │
│    - Must never be attributed to the challenge submission   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Pre-Challenge Evidence

- **Baseline Commit:** `864a3d6905826bd0fabab02cf02785ab0c702842`
- **Verified Capabilities:** Ingestion pipelines (crates.io and PyPI unit-test verified; npm changes feed statically verified), in-memory graph storage (`DEPENDS_ON`, `DEPENDS_ON_PKG`), Tree-sitter multi-language parsers, AST breaking change detector, OSV lookup implementation (statically verified to target live OSV REST API; live network execution not runtime-verified during WMCP-0A), Qdrant vector client, and Next.js frontend production build.
- **Known Baseline Gaps:** Hard-coded Scorecard resolver, unpopulated threat enrichment fields (CVSS, EPSS, KEV, reachability), filesystem-local snapshot storage, package projections without version requirement constraints, and subscription handlers without graph mutation.

---

## 4. Challenge-Added Evidence

Every feature developed for the challenge must be backed by distinct Git commits after `864a3d6905826bd0fabab02cf02785ab0c702842`:
- `WarRoomState` and unified `WarRoomActions` layer.
- `WebMcpPlatformAdapter` and `ModelContextRegistry`.
- Context-aware adaptive tool surface with `contextRevision` race protection.
- Deterministic counterfactual API scenario engine.
- Ecosystem-specific version-aware exposure calculation (npm SemVer, Cargo requirements, PyPI/PEP 440).
- Dual-metric risk evaluation: mathematical Blast Radius (0-100) and evidence Confidence (0-100).
- Human business priority review layer.
- Remediation synthesis and migration planner.
- WebMCP development inspector and telemetry logging.
- Comprehensive evaluation suite (deterministic tests and agent evals).

---

## 5. Post-Freeze Evidence

- Any commits or modifications made after the internal freeze date (September 2, 2026) are classified as post-freeze.
- Post-freeze work must not be cited as part of the official challenge submission candidate.

---

## 6. Exposure Evidence Ladder

The platform strictly distinguishes degrees of downstream dependency exposure. Downstream relationships must never be generalized as guaranteed breakage:

```
┌─────────────────────────────────────────────────────────────┐
│ 4. CONFIRMED                                                │
│    Deterministic proof of downstream breakage via concrete  │
│    source code verification and usage evidence.             │
├─────────────────────────────────────────────────────────────┤
│ 3. USAGE_EVIDENCE                                           │
│    Downstream consumer imports and directly invokes the     │
│    specific modified or removed API symbol.                 │
├─────────────────────────────────────────────────────────────┤
│ 2. RANGE_COMPATIBLE                                         │
│    Downstream dependency constraint admits the simulated    │
│    release version according to ecosystem-specific version  │
│    constraint semantics (npm, Cargo, PyPI/PEP 440).         │
├─────────────────────────────────────────────────────────────┤
│ 1. TOPOLOGY_ONLY                                            │
│    Downstream package is connected via dependency graph     │
│    edges (potential blast radius, unverified usage).        │
└─────────────────────────────────────────────────────────────┘
```

- **Enforcement Rule:** A package with `TOPOLOGY_ONLY` exposure must be displayed as "Potentially exposed", never as "Broken".

---

## 7. Blast Radius vs. Confidence

Technical risk and evidence certainty are independent orthogonal dimensions:

- **Technical Blast Radius (0-100):** Deterministic mathematical measure of potential downstream impact based on API change severity (40%), direct exposure (25%), transitive propagation (20%), and ecosystem breadth (15%).
- **Evidence Confidence (0-100):** Measure of underlying data completeness, based on AST snapshot availability, parse error rates, version constraint coverage, and graph freshness.

**Example Scenario:**
- Blast Radius: `85/100` (High potential impact)
- Confidence: `40/100` (Low data certainty due to partial dependency range data)
- *Interpretation:* The proposed change has high blast potential, but additional usage evidence is required for certainty.

---

## 8. Human Business Context

Human maintainer annotations are a third independent layer:
- **Categories:** `PRODUCTION_CRITICAL`, `HIGH_PRIORITY`, `NORMAL`, `LOW_PRIORITY`, `IGNORE`, `OWNED_INTERNAL`, `DEPRECATED`.
- **Non-Interference Invariant:** Human priority annotations adjust rollout sequence and migration plans; they must never modify the objective mathematical Blast Radius score.

---

## 9. Agent Interpretation Boundary

All data presented in the user interface and generated reports must carry clear provenance taxonomy:

- **`SOURCE_OBSERVED`:** Directly extracted from package manifest or source AST.
- **`RUNTIME_OBSERVED`:** Verified by successful runtime test or execution.
- **`DETERMINISTIC_DERIVED`:** Computed by deterministic algorithms (e.g. `BreakingDetector`, `BlastRadiusEngine`).
- **`EXTERNAL_UNTRUSTED`:** Text or metadata from public registries or advisory databases.
- **`HUMAN_CONTEXT`:** Explicit business annotations provided by the human user.
- **`AGENT_INTERPRETATION`:** Explanations, recommendations, or plans generated by the AI agent.
- **`UNVERIFIED`:** Stated claims lacking sufficient empirical backing.

---

## 10. Provenance Requirements

Every analysis artifact emitted by the platform must record:
- Ecosystem and package identifier.
- Exact version or git commit hash.
- Analysis timestamp.
- AST parser and snapshot schema version.
- Source registry provenance.

Analysis lacking provenance must not be represented as high confidence.

---

## 11. Challenge Claim Rules

The following table defines the mandatory evidence required before any technical claim may be made in documentation, UI, or evaluation reports:

| Claim | Required Evidence Before Claim Is Allowed |
|---|---|
| Package is downstream | Graph relationship or path exists (`DEPENDS_ON_PKG` / `DEPENDS_ON`). |
| Version is range-compatible | Ecosystem-specific version evaluator confirms target version satisfies dependency constraint according to ecosystem semantics (npm, Cargo, PyPI/PEP 440). |
| API change is breaking | `BreakingDetector` AST diff confirms removed symbol, signature change, or visibility reduction. |
| Package uses affected symbol | Concrete usage evidence confirms import/call of affected symbol in downstream code. |
| Package definitely breaks | Strong deterministic evidence combining breaking change, range compatibility, and symbol usage. |
| Blast Radius score | Output of deterministic 4-factor scoring model. |
| Confidence score | Output of evidence-quality and data-completeness model. |
| Migration priority | Combined deterministic evidence, Blast Radius, and human business priority context. |
| Agent recommendation | Clearly labeled `AGENT_INTERPRETATION` explaining rationale and suggested actions. |

---

## 12. Stub / Placeholder Policy

- **No Silent Fabrications:** Any mock, placeholder, or static demo values must be explicitly tagged as such.
- **Transitional Labeling:** Features identified in WMCP-0A as stubs (Scorecard resolver, placeholder threat metrics) will remain labeled as demo/unverified until replaced by genuine live integrations in WMCP-9.
- **Prohibition of Faked Passes:** Test suites and evaluation benchmarks must record `BLOCKED` or `UNVERIFIED` when external infrastructure is absent, never a fabricated `PASS`.

---

## 13. Submission Evidence Matrix

| Challenge Requirement Area | Evidence Artifact in Repository | Verification Method |
|---|---|---|
| Working Live Application | Public deployment with active UI & WebMCP surface | Live browser interaction & video recording |
| Code Repository & History | Clean Git commit trail from baseline to final freeze | Git log inspection and SHA linkage |
| WebMCP Integration Quality | `WebMcpPlatformAdapter`, state machine, inspector telemetry | Deterministic unit tests & inspector logs |
| Human-Agent Experience | Shared `WarRoomActions`, timeline audit log | Rehearsed multi-step War Room scenario |
| Deterministic Verification | Evaluation suite covering tool logic & agent evals | Automated test suite in CI (`WMCP-14`) |

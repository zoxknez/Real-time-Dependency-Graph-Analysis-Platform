# WMCP-0B Challenge Contract & Architectural Governance

## 1. Purpose

This document defines the authoritative architecture contract, system boundaries, and governance model for the WebMCP Challenge development on branch `feature/webmcp-challenge-2026`.

It establishes the technical contract governing all subsequent implementation phases (WMCP-1 through WMCP-15).

---

## 2. Verified Starting Point

- **Repository:** `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Challenge Branch:** `feature/webmcp-challenge-2026`
- **Immutable Pre-Challenge Baseline SHA:** `864a3d6905826bd0fabab02cf02785ab0c702842`
- **WMCP-0A Freeze & Corrections Head:** `bea51b53289bfab8596e8fd660ef22f38a7eb403` (CLOSED)
- **Phase:** `WMCP-0B - Challenge Contract, Architecture Invariants & Evidence Boundary`

---

## 3. Formal Challenge Facts

The following facts reflect external challenge constraints and formal requirements:

- **Challenge Timeline:** Challenge opens August 25, 2026; submission deadline is September 3, 2026, at 5:00 PM PT. [FORMAL CHALLENGE REQUIREMENT]
- **Existing Codebase Eligibility:** Pre-existing repositories are permitted; evaluation focuses on the value and quality of WebMCP integration added during the challenge. [FORMAL CHALLENGE REQUIREMENT]
- **Required Submission Artifacts:** Project description, working live application URL, public code repository, demonstration video, and any additional materials required by official challenge rules. (Exact repository licensing and Devpost submission details will be revalidated in WMCP-15). [FORMAL CHALLENGE REQUIREMENT]
- **Evaluation Criteria:** Usefulness, originality, execution quality, thoughtful use of WebMCP, and quality of human-agent collaboration. [FORMAL CHALLENGE REQUIREMENT]

---

## 4. Internal Challenge Targets

The following operational targets are our team decisions and must not be confused with external submission mandates:

- **Internal Code & Evidence Freeze:** September 2, 2026 (Internal target allowing final rehearsal, validation, and video capture before the official deadline). [INTERNAL DELIVERY TARGET]
- **Target Tool Surface Concurrency:** Approximately 3-6 semantically relevant tools active simultaneously per application phase. [INTERNAL DELIVERY TARGET]
- **Target Output Budget:** Tool responses target an approximate maximum of 1500 characters, returning concise structured summaries while directing detailed inspection to UI surfaces. [INTERNAL DELIVERY TARGET]
- **Internal Evaluation Suite:** Deterministic tool validation and probabilistic agent eval suite (WMCP-14) are internal quality deliverables to guarantee submission excellence. [INTERNAL DELIVERY TARGET]

---

## 5. Product Contract

- **Working Product Concept:** *Dependency Breakage War Room* (Working title; repository and domain names remain unchanged). [OUR ARCHITECTURAL DECISION]
- **Core Value Proposition:** An adaptive WebMCP dependency analysis workspace where software maintainers can simulate future API changes, measure downstream exposure, inspect critical dependency paths, add human business context, and co-plan safer releases with an AI agent operating within the same live application state.
- **Stand-Alone Value Invariant:** The application must remain completely functional and valuable for human engineers when no AI agent is present or when WebMCP is unavailable in the host browser. [OUR ARCHITECTURAL DECISION]

---

## 6. Human-Agent Collaboration Contract

The central differentiator of this architecture is shared state collaboration rather than disconnected chatbot question-answering:

1. **Shared Live State:** Human engineer and AI agent operate on the identical underlying canonical state store (`WarRoomState`).
2. **Synchronized Workspace:** When a human selects a package or adjusts a priority, the agent's available logical tool surface adapts immediately to the new context.
3. **Transparent Actions:** Agent tool invocations and state mutations are rendered in real time on the interactive graph, data panels, and the audit timeline.
4. **Complementary Roles:**
   - **Human:** Supplies business criticality, ownership boundaries, rollout constraints, risk tolerance, and final approval.
   - **Agent:** Decomposes complex graph queries, suggests structured patch candidates, computes exposure chains, and drafts prioritized migration plans.

---

## 7. Deterministic Engine vs. Agent Responsibilities

To maintain scientific integrity and auditability, system responsibilities are strictly partitioned:

```
┌────────────────────────────────────────────────────────┐
│                   AI AGENT SURFACE                     │
│  - Natural language intent translation                 │
│  - Tool selection & multi-step orchestration           │
│  - Scenario candidate formulation                      │
│  - Remediation & migration strategy recommendations    │
└───────────────────────────┬────────────────────────────┘
                            │ (Structured Tool Calls)
                            ▼
┌────────────────────────────────────────────────────────┐
│              DETERMINISTIC DOMAIN ENGINE               │
│  - AST parsing & public API symbol extraction          │
│  - Breaking change classification (BreakingDetector)   │
│  - Ecosystem-specific version-range satisfiability     │
│    (npm SemVer, Cargo requirements, PyPI/PEP 440)      │
│  - Dependency graph pathfinding & topological query    │
│  - Blast Radius & Confidence calculation               │
│  - Tenant authorization & access control enforcement   │
└────────────────────────────────────────────────────────┘
```

- **Strict Non-Delegation Rule:** An LLM must never decide whether an API signature change is breaking, whether a version constraint is satisfied, or what the mathematical Blast Radius score is. All such calculations belong entirely to the deterministic domain engine. [OUR ARCHITECTURAL DECISION]

---

## 8. Shared WarRoomActions Contract

```
                     HUMAN (Web UI)
                           │
                           ▼
                   ┌───────────────┐
                   │WarRoomActions │
                   └───────┬───────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        GraphEngine  AnalysisService  ScenarioEngine
             ▲             ▲             ▲
             │             │             │
             └─────────────┼─────────────┘
                           │
                   ┌───────┴───────┐
                   │ WebMCP Tools  │
                   └───────▲───────┘
                           │
                      AI AGENT
```

- **Single Implementation of Business Logic:** WebMCP tools must never implement separate, duplicated algorithmic logic. Both human UI interactions and agent tool invocations must execute through the unified `WarRoomActions` application boundary. [OUR ARCHITECTURAL DECISION]

---

## 9. WebMCP Progressive Enhancement

- **Platform Architecture Fact:** Chrome documentation and the WebMCP Community Group specifications define WebMCP as suitable for progressive enhancement over standard web applications. [CURRENT WEBMCP PLATFORM FACT]
- **Our Progressive Enhancement Guarantee:** If `document.modelContext` is undefined (e.g. standard browsers without WebMCP experimental flags enabled), the complete human War Room workflow (graph inspection, counterfactual scenario simulation, blast radius calculation, human annotation, and migration planning) remains fully functional. WebMCP availability is an orthogonal enhancement, not an application dependency. [OUR ARCHITECTURAL DECISION]

---

## 10. WebMCP Platform Compatibility & Signal Separation Boundary

- **Target Specification:** Web Machine Learning Community Group Draft Community Group Report (19 August 2026). WebMCP remains experimental and actively evolving. [CURRENT WEBMCP PLATFORM FACT]
- **Primary Namespace:** `document.modelContext` (The legacy `navigator.modelContext` namespace is deprecated and will not be used). [CURRENT WEBMCP PLATFORM FACT]
- **AbortSignal Role Separation:** The architecture strictly separates two distinct lifecycle signals:
  1. `registrationLifetimeSignal`: Passed to `document.modelContext.registerTool(tool, { signal: registrationLifetimeSignal })` to manage the physical registration lifetime in the browser. Aborting this signal unregisters the tool.
  2. `executionSignal`: Passed into the tool invocation callback `execute(input, { signal: executionSignal })` to signal cancellation of an individual in-flight execution.
  - **Invariant:** `registrationLifetimeSignal != executionSignal`. Registration teardown must never be conflated with execution abort. [OUR ARCHITECTURAL DECISION]
- **Browser Compatibility Isolation:** Experimental browser differences (such as unregister lifecycle semantics across Chrome releases) must be fully encapsulated within `WebMcpPlatformAdapter`. Domain services and UI components must never access WebMCP global variables directly. [OUR ARCHITECTURAL DECISION]

---

## 11. Same-Origin Security Policy

- **Challenge Scope Security:** The WebMCP tool surface will operate strictly within a same-origin execution boundary (`Permissions-Policy: tools=(self)` and `Origin-Agent-Cluster: ?1`). Cross-origin `exposedTo` configurations and third-party iframe tool sharing are explicitly out of scope for the challenge submission. [OUR ARCHITECTURAL DECISION]
- **Origin Isolation Context:** WebMCP requires an origin-isolated document context. The `tools` Permissions Policy defaults to `self`; our planned explicit headers represent our deliberate challenge configuration. [CURRENT WEBMCP PLATFORM FACT]
- **Input Sanitization:** WebMCP tools must accept strictly typed canonical parameters (e.g. `packageId`, `scenarioId`, `patchOperation`). Tools must never accept raw SQL, Cypher, GraphQL strings, filesystem paths, arbitrary URLs, or executable scripts. [OUR ARCHITECTURAL DECISION]

---

## 12. Challenge-Visible Stub Policy

- **Truth in Presentation:** No user-facing or judge-facing interface may represent mock, hard-coded, or synthetic values as real live telemetry.
- **Remediation Plan:**
  - Hard-coded OpenSSF Scorecard values identified in WMCP-0A will be replaced with genuine live API queries in WMCP-9.
  - Vulnerability threat metrics (EPSS, KEV, Exploit signals) will be wired to real data feeds or clearly marked as unavailable in WMCP-9.
  - Until fully implemented in their respective phases, any unpopulated fields must be labeled as unverified or hidden from production views. [OUR ARCHITECTURAL DECISION]

---

## 13. Accessibility Contract

- **Multi-Modal Representation:** Visual 3D and 2D WebGL graphs must not be the sole medium for critical analysis. Every graph finding, critical path, and scenario impact result must have an accessible, semantic tabular and list representation navigable via keyboard and screen readers. [OUR ARCHITECTURAL DECISION]

---

## 14. Performance Contract

- **Target Visual Density:** The War Room graph visualization focuses on relevant blast-radius clusters and critical dependency chains, targeting approximately 100 to 300 visible nodes simultaneously for visual clarity and high rendering framerates.
- **On-Demand Expansion:** Deep transitive subgraphs are loaded dynamically on demand rather than overwhelming client memory with unconstrained global ecosystem plots. [OUR ARCHITECTURAL DECISION]

---

## 15. Phase Governance

The challenge implementation follows an evidence-based phased roadmap:

- **WMCP-0A:** Baseline Freeze & Truth Inventory (CLOSED at `bea51b53289bfab8596e8fd660ef22f38a7eb403`)
- **WMCP-0B:** Challenge Contract, Architecture Invariants & Evidence Boundary (Current)
- **WMCP-1:** Platform Modernization & Toolchain Cleansing
- **WMCP-2:** War Room Domain State & Action Layer
- **WMCP-3:** WebMCP Foundation & Platform Adapter
- **WMCP-4:** Adaptive Capability Surface & State Machine
- **WMCP-5:** Public API Extraction & AST Analysis
- **WMCP-6:** Durable Snapshot Persistence
- **WMCP-7:** Counterfactual Scenario Engine & Breaking Detector
- **WMCP-8:** Version-Aware Exposure Engine (SemVer / PEP 440)
- **WMCP-9:** Evidence Aggregation, Live Scorecard & Threat Intelligence
- **WMCP-10:** Human Business Review & Collaboration Layer
- **WMCP-11:** Migration Planning & Remediation Synthesis
- **WMCP-12:** Unified War Room UX & Graph Visualizer
- **WMCP-13:** Product Finalization, Packaging & Branding Cleansing
- **WMCP-14:** Evaluation Suite, Benchmarks & Hardening
- **WMCP-15:** Submission Freeze, Video & Documentation Packaging

**Review Gate Invariant:** Each implementation phase concludes with an independent verification review before being marked CLOSED.

---

## 16. Submission Evidence Contract

All submission claims must be provably backed by:
1. Version-controlled Git commits after immutable baseline `864a3d6905826bd0fabab02cf02785ab0c702842`.
2. Deterministic unit, integration, and scenario benchmark test executions.
3. Live WebMCP inspector telemetry logs demonstrating active tool lifecycle, context updates, and tool invocations.

---

## 17. External Research Baseline

This architecture builds on the following verified technical specifications and documentation as of August 2026:
- *WebMCP Draft Community Group Report* (W3C Web Machine Learning Community Group, 19 August 2026).
- *Chrome WebMCP Imperative API Documentation* (Updated 20 August 2026).
- *Chrome WebMCP Best Practices & Tool Security Guidelines* (August 2026).
- *Chrome WebMCP Evaluation Standards* (August 2026).
- *OpenAI WebMCP Challenge Guidelines & Evaluation Criteria* (August 2026).

---

## 18. Non-Goals

- Building cross-origin or third-party iframe tool federation.
- Replacing standard server-side Model Context Protocol (MCP) servers where backend-to-backend tooling is appropriate.
- Implementing automated autonomous code refactoring or unattended pull-request merging without human review.
- Writing full package managers or package resolver algorithms from scratch.

---

## 19. Locked Decisions

1. `document.modelContext` is the sole browser registration target.
2. WebMCP tools use `WarRoomActions` and never duplicate domain logic.
3. Adaptive tool registration is our architectural strategy to maintain a clean 3-6 tool surface.
4. `contextRevision` guards prevent stale asynchronous responses from mutating active UI state.
5. Technical Blast Radius and evidence Confidence are separate, unmerged values.
6. Human priority enriches migration planning but never alters mathematical Blast Radius.
7. `registrationLifetimeSignal` and `executionSignal` are distinct lifecycle concepts and must never be conflated.

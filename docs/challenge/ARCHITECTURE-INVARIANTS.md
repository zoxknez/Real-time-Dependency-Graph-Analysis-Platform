# WebMCP Challenge - Architecture Invariants

This document defines the normative, immutable engineering invariants governing all challenge development on `feature/webmcp-challenge-2026`.

Every implementation phase must satisfy these invariants.

---

### WMCP-INV-001: Context-Valid Tool Registration
- **Statement:** A WebMCP tool is registered only in application states where its preconditions and input prerequisites are semantically valid.
- **Rationale:** Exposing tools when required state (e.g. selected package, generated scenario) is missing leads to agent confusion and unforced tool call failures.
- **Violation Example:** Registering `simulate_api_changes` in `IDLE` state before any package or graph has been opened.
- **Future Verification Method:** Deterministic state machine tests validating active tool sets per state.
- **First Enforcement Phase:** WMCP-4.

---

### WMCP-INV-002: Stale Context Isolation
- **Statement:** A stale `contextRevision` cannot mutate current application or visual evidence state.
- **Rationale:** Human and agent interactions occur asynchronously; long-running operations must not overwrite state after the user has switched focus.
- **Violation Example:** Agent begins simulating breaking changes for Package A; user selects Package B; when Package A result arrives, it overwrites the UI overlay of Package B.
- **Future Verification Method:** Concurrency unit tests simulating race conditions with mismatched context revisions.
- **First Enforcement Phase:** WMCP-2.

---

### WMCP-INV-003: Dual Human-Agent Accessibility
- **Statement:** Any core capability exposed through WebMCP must also be reachable through the human application architecture.
- **Rationale:** The application must remain a fully capable standalone tool for human maintainers without requiring an AI agent.
- **Violation Example:** Building a critical path tracing algorithm that can only be invoked by an LLM tool call and has no UI counterpart.
- **Future Verification Method:** Code review and UI integration tests verifying action invocation paths.
- **First Enforcement Phase:** WMCP-2.

---

### WMCP-INV-004: Unified Action Layer
- **Statement:** Human UI and AI agent tools use the same `WarRoomActions` application layer.
- **Rationale:** Prevents business logic duplication, divergent behavior, and synchronization bugs.
- **Violation Example:** WebMCP tool computing blast radius with a custom in-memory formula while the UI calls a GraphQL endpoint with a different formula.
- **Future Verification Method:** Static code analysis ensuring WebMCP tool handlers delegate directly to `WarRoomActions`.
- **First Enforcement Phase:** WMCP-2.

---

### WMCP-INV-005: Topology Does Not Equal Confirmed Breakage
- **Statement:** Dependency graph membership alone must never be represented as confirmed downstream breakage.
- **Rationale:** A downstream dependent may not import the changed symbol or may pin an unaffected version range.
- **Violation Example:** Emitting an alert stating "642 packages broken" based solely on a topological reverse dependency count.
- **Future Verification Method:** Evidence classification tests enforcing the exposure ladder.
- **First Enforcement Phase:** WMCP-7.

---

### WMCP-INV-006: Separation of Blast Radius and Confidence
- **Statement:** Technical Blast Radius and evidence Confidence are separate values.
- **Rationale:** High potential architectural impact does not imply high certainty in the underlying data.
- **Violation Example:** Merging risk severity and data completeness into a single composite score of 80/100.
- **Future Verification Method:** Unit tests verifying independent calculation and data models for Blast Radius and Confidence.
- **First Enforcement Phase:** WMCP-9.

---

### WMCP-INV-007: Human Business Context Isolation
- **Statement:** Human business priority must never rewrite the objective technical Blast Radius.
- **Rationale:** Marking a dependency as "LOW_PRIORITY" does not reduce the actual technical severity of a breaking API change.
- **Violation Example:** Reducing a mathematical blast radius score from 85 to 20 because the user marked the downstream consumer internal.
- **Future Verification Method:** State transition tests ensuring technical scores remain invariant under human priority updates.
- **First Enforcement Phase:** WMCP-10.

---

### WMCP-INV-008: Untrusted Content Provenance
- **Statement:** Externally sourced or user-controlled content exposed through WebMCP must carry untrusted-content semantics where applicable.
- **Rationale:** External registry descriptions and advisories must be isolated to prevent prompt injection and data confusion.
- **Violation Example:** Emitting raw npm package README strings in tool output without `untrustedContentHint: true`.
- **Future Verification Method:** Tool schema validation tests verifying `annotations.untrustedContentHint`.
- **First Enforcement Phase:** WMCP-3.

---

### WMCP-INV-009: Constrained Tool Input Surface
- **Statement:** WebMCP inputs must not expose generic SQL, Cypher, GraphQL, arbitrary URL, filesystem, or executable-code primitives.
- **Rationale:** Protects the host application and user data by exposing strictly typed domain parameters.
- **Violation Example:** Creating a WebMCP tool named `run_cypher_query` that takes an arbitrary Cypher query string.
- **Future Verification Method:** Static inspection of tool JSON schemas in CI.
- **First Enforcement Phase:** WMCP-3.

---

### WMCP-INV-010: Deterministic Breaking Change Evaluation
- **Statement:** Breaking-change classification is deterministic domain logic, not free-form LLM judgment.
- **Rationale:** SemVer compliance and API compatibility require exact AST signature comparison.
- **Violation Example:** Prompting the LLM: "Look at this Rust function signature and tell me if it breaks callers."
- **Future Verification Method:** Unit tests ensuring `BreakingDetector` handles all classification deterministically.
- **First Enforcement Phase:** WMCP-7.

---

### WMCP-INV-011: Concise Output Budget
- **Statement:** WebMCP tool results must remain concise and respect the challenge quality output budget (target approx 1500 chars) unless explicitly justified.
- **Rationale:** Prevents context window bloat and forces rich evidence to be presented in the visual UI.
- **Violation Example:** Dumping a 500-node JSON dependency graph into a single tool response string.
- **Future Verification Method:** Automated test assertions on maximum character lengths of tool output payloads.
- **First Enforcement Phase:** WMCP-3.

---

### WMCP-INV-012: Prohibition of Fabricated Production Metrics
- **Statement:** Challenge-visible functionality must not present fabricated production-looking metrics as real evidence.
- **Rationale:** Demonstrations and evaluations must maintain strict empirical honesty.
- **Violation Example:** Returning hard-coded Scorecard checks (e.g. "30 commits in last 90 days") without marking them as mock or unavailable.
- **Future Verification Method:** End-to-end integration audits and UI truth checks.
- **First Enforcement Phase:** WMCP-9.

---

### WMCP-INV-013: WebMCP Adapter Isolation
- **Statement:** Experimental WebMCP browser API differences must be isolated behind the `WebMcpPlatformAdapter`.
- **Rationale:** Browser implementations and unregister semantics evolve rapidly across browser releases.
- **Violation Example:** Referencing `window.document.modelContext` directly inside a React component or GraphQL hook.
- **Future Verification Method:** Lint rules forbidding `document.modelContext` references outside `packages/` or adapter modules.
- **First Enforcement Phase:** WMCP-3.

---

### WMCP-INV-014: Registration Generation Independence
- **Statement:** Tool registration generation N cleanup cannot unregister or corrupt generation N+1.
- **Rationale:** Rapid state transitions must not allow delayed asynchronous teardown to remove an active newer registration.
- **Violation Example:** State transitions from A to B to A; teardown from first state A unregisters the newly created tool in second state A.
- **Future Verification Method:** Registry generation unit tests simulating rapid sequential state flipping.
- **First Enforcement Phase:** WMCP-4.

---

### WMCP-INV-015: In-Flight Execution Drain
- **Statement:** State-driven tool retirement must account for in-flight executions and must not rely on browser-version-specific unregister behavior.
- **Rationale:** Active tool executions must be allowed to complete cleanly or be explicitly aborted via `AbortSignal`.
- **Violation Example:** Unregistering a tool while an execution is running, causing an unhandled promise rejection in the caller.
- **Future Verification Method:** Lifecycle tests tracking `activeExecutions` count through `RETIRING` to `REMOVED`.
- **First Enforcement Phase:** WMCP-4.

---

### WMCP-INV-016: Progressive Enhancement Guarantee
- **Statement:** WebMCP absence must not prevent ordinary human application workflows.
- **Rationale:** Ensures universal browser compatibility and resilience against missing experimental flags.
- **Violation Example:** Throwing an unhandled fatal error on page load if `document.modelContext` is undefined.
- **Future Verification Method:** E2E browser tests executed in standard browser profiles with WebMCP disabled.
- **First Enforcement Phase:** WMCP-3.

---

### WMCP-INV-017: Security Parity Between Human and Agent
- **Statement:** WebMCP actions must enforce the same authorization, tenant scope, validation, and business rules as equivalent human actions.
- **Rationale:** Agent access must never become an unauthenticated or unvalidated backdoor into domain capabilities.
- **Violation Example:** Human UI filtering graph queries by `tenant_id = 'public'` while WebMCP tool executes an unfiltered query.
- **Future Verification Method:** Authorization unit tests executing identical actions via UI and WebMCP entry points.
- **First Enforcement Phase:** WMCP-2.

---

### WMCP-INV-018: Separation of Interpretation and Evidence
- **Statement:** Agent interpretation must never be silently promoted to deterministic evidence.
- **Rationale:** Users must always be able to distinguish empirical facts from AI-generated suggestions.
- **Violation Example:** Displaying an LLM-generated migration order as an immutable topological constraint in the database.
- **Future Verification Method:** UI schema validation verifying distinct data tags (`AGENT_INTERPRETATION` vs `DETERMINISTIC_DERIVED`).
- **First Enforcement Phase:** WMCP-11.

---

### WMCP-INV-019: Deterministic Tool Availability
- **Statement:** Tool availability for the same canonical application state must be deterministic.
- **Rationale:** Predictable tool surfaces enable reliable agent planning and rigorous evaluation benchmarks.
- **Violation Example:** Randomly registering 3 tools out of 6 valid tools across different page loads in the same state.
- **Future Verification Method:** State machine evaluation benchmarks testing tool surface determinism.
- **First Enforcement Phase:** WMCP-4.

---

### WMCP-INV-020: Multi-Modal Evidence Accessibility
- **Statement:** Visual graph state must not be the sole representation of critical analysis evidence.
- **Rationale:** Ensures full accessibility compliance and clear tabular auditing.
- **Violation Example:** Displaying blast radius results solely as colored nodes on a 3D Canvas without an accessible list/table.
- **Future Verification Method:** Accessibility audits (Axe / Playwright accessibility checks).
- **First Enforcement Phase:** WMCP-12.

---

### WMCP-INV-021: Non-Serializable State Isolation
- **Statement:** Non-serializable browser/rendering objects must not become canonical domain/application state.
- **Rationale:** Ensures clean state resets, predictable serialization, and testability.
- **Violation Example:** Storing Three.js `Camera`, `Scene`, or WebMCP `AbortController` instances directly in the primary Zustand store.
- **Future Verification Method:** State store serialization tests.
- **First Enforcement Phase:** WMCP-2.

---

### WMCP-INV-022: Invocation-Time Context Capture
- **Statement:** Context-bound tool execution must capture the `contextRevision` at invocation time.
- **Rationale:** Required to evaluate whether the context has changed before committing any state mutation.
- **Violation Example:** Tool executing an asynchronous GraphQL query without recording what context revision it started with.
- **Future Verification Method:** Unit tests on tool execution wrapper capturing `capturedContextRevision`.
- **First Enforcement Phase:** WMCP-4.

---

### WMCP-INV-023: Stale Context Early Rejection
- **Statement:** A context-bound result whose captured revision differs from current revision must return `STALE_CONTEXT` before state-changing effects.
- **Rationale:** Prevents race conditions from corrupting newer user selections.
- **Violation Example:** An analysis callback checking context revision only after mutating the global selected node.
- **Future Verification Method:** Asynchronous race condition tests.
- **First Enforcement Phase:** WMCP-4.

---

### WMCP-INV-024: Mandatory Runtime Parameter Validation
- **Statement:** Tool schemas do not replace runtime validation.
- **Rationale:** LLMs or callers may pass malformed JSON or illegal enum variants despite declared JSON schemas.
- **Violation Example:** Relying solely on JSON Schema string validation and passing unchecked strings directly into Cypher parameter maps.
- **Future Verification Method:** Negative property-based testing passing fuzz inputs to tool entry points.
- **First Enforcement Phase:** WMCP-3.

---

### WMCP-INV-025: Product-Specific Tool Surface
- **Statement:** The WebMCP capability layer must remain product-specific and must not expose a generic backend execution console.
- **Rationale:** Preserves product identity, minimizes attack surface, and ensures clear evaluation by challenge judges.
- **Violation Example:** Exposing `read_file`, `write_file`, and `run_terminal_command` tools in the War Room.
- **Future Verification Method:** Tool registry inspection tests confirming all registered tools map directly to War Room domain actions.
- **First Enforcement Phase:** WMCP-3.

# Final Claims

| Claim | Status | Authority | Evidence | Limitation |
|---|---|---|---|---|
| AST public API extraction | REAL | analysis services | Rust analysis tests | Supported languages follow parser coverage |
| Persistent API snapshots | REAL | WMCP-6 snapshot ports | snapshot regression tests | Requires configured storage |
| Counterfactual API changes | REAL | scenario analysis action | WMCP-7 scenario tests | Does not prove downstream source compatibility |
| Version-aware direct exposure | REAL | WMCP-8 exposure engine | blast-radius matrix | Transitive version compatibility is not computed |
| Live package advisories | REAL | OSV route/client | evidence-focus matrix | Network/provider can be unavailable |
| Human review | REAL | WarRoomActions review actions | review matrix | Priority is explicit human metadata |
| Critical paths | REAL | graph query trace | review matrix | Only successfully traced paths are included |
| Deterministic migration plan | REAL | migration planning port | planner/action tests | Plan does not edit source code |
| WebMCP adaptive surface | REAL | adaptive catalog/lifecycle | lifecycle and bridge suites | Physical registration remains phase-adaptive |

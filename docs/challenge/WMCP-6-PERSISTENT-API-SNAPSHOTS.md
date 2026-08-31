# WMCP-6 - Persistent API Snapshots & Immutable History Authority

## 1. Purpose & Scope

This document establishes the durable, immutable, and fail-closed persistence authority for authoritative public API observations (**WMCP-6**):
- **Authoritative Snapshot Envelope V1 (`wmcp-api-snapshot-v1`)**: Wraps validated WMCP-5 `PublicApiSurface` observations with explicit schema versioning, deterministic snapshot identity, opaque revision coordinates, and optional lineage.
- **Fail-Closed Admission**: Rejects `AnalysisStatus::Partial` and `AnalysisStatus::Unsupported` at the repository boundary; only `AnalysisStatus::Complete` surfaces enter authoritative history.
- **Surface Hash vs. Snapshot Identity Distinction**: Distinguishes the public API content (`surface_hash`) from the historical observation coordinate (`snapshot_id`), allowing two versions of a package with identical API surface to remain separate historical records.
- **Strict Idempotency & Conflict Safety**: Repeated writes of the exact same observation are idempotent; attempting to overwrite an existing coordinate with a different `surface_hash` returns a typed `SnapshotConflict` (no silent overwrite).
- **Atomic Publication**: Writes via temporary files and atomic filesystem rename (`std::fs::rename`) to ensure readers never observe partial or corrupt snapshots.
- **Full Read Verification**: Deserialization re-validates schema version, `AnalysisStatus::Complete`, canonical surface hash, and deterministic snapshot ID.
- **Deterministic History Sequence**: Exposes history ordered strictly by recording/capture sequence, without performing SemVer or PEP 440 parsing.

### Non-Goals
- **No Breaking Change Detection / Scenario Engine**: Counterfactual simulations and breaking change evaluation belong to **WMCP-7**.
- **No SemVer / PEP 440 Compatibility Engine**: Version constraint resolution, range matching, and version ordering belong to **WMCP-8**.
- **No WebMCP Tool Activation**: `simulate_api_changes` remains `DEFERRED`.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `a8fb93e44261e08be7faa10bd18241034a4bf639`
- **WMCP-5 Closure HEAD**: `a8fb93e44261e08be7faa10bd18241034a4bf639`
- **WMCP-4 Closure HEAD**: `2d208c94612ffe1c920d08a0a74c66653c8ee965`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Pre-Existing Snapshot Inventory & Call Graph

| Component | Path | Responsibility | Production Reachability | Format |
| :--- | :--- | :--- | :--- | :--- |
| `PublicApiSnapshot` | `apps/analysis/src/ast_parser.rs` | Legacy in-memory / cache snapshot with raw AST symbols | Partially Reusable | Legacy JSON (raw symbols, DefaultHasher hash) |
| `save_snapshot` / `load_previous_snapshot` | `apps/analysis/src/main.rs` | Filesystem cache persistence for breaking detector | Production-Reachable | Unversioned JSON by `{package_id}/{version}.json` |
| `SnapshotRepository` | `apps/analysis/src/api_snapshot.rs` | **Authoritative V1 persistence engine** for `ApiSnapshotEnvelope` | **PRODUCTION (Authoritative)** | Versioned V1 Envelope JSON (`wmcp-api-snapshot-v1`) |

### Call Graph
```
Source Code Tarball
        |
        v
WMCP-5 PublicApiExtractor
        |
        v
PublicApiSurface (AnalysisStatus::Complete)
        |
        v
SnapshotRepository::put(subject, revision, surface, parent_id)
        |
   +----+----+
   |         |
Atomic    History
Storage    Index
   |         |
   v         v
get_by_id / list_history
        |
        v
Future WMCP-7 / WMCP-8 Consumers
```

---

## 4. Storage Architecture & Directory Layout

### Storage Root Authority
Configured via `ANALYSIS_SNAPSHOT_DIR` environment variable, defaulting to `temp_dir().join("randomapp-snapshots")`.

### Filesystem Layout
```
<storage_root>/
  ├── snapshots/
  │   └── <snapshot_id>.json                # Immutable ApiSnapshotEnvelope by ID
  ├── coordinates/
  │   └── <safe_subject>/
  │       └── <safe_revision>.json          # Pointer mapping (subject, revision) -> snapshot_id
  ├── history/
  │   └── <safe_subject>.json               # Ordered sequence of historical captures
  └── _tmp/                                 # Isolated staging directory for atomic renames
```

---

## 5. Snapshot Envelope V1 Schema & Deterministic Identity

### Schema Definition
```json
{
  "schema_version": "wmcp-api-snapshot-v1",
  "snapshot_id": "9f8a...",
  "subject": "my-package",
  "revision": "1.0.0",
  "captured_at_epoch_ms": 1725091200000,
  "surface": { ... },
  "parent_snapshot_id": null
}
```

### Deterministic Snapshot ID Preimage (`compute_snapshot_id`)
Encoded via `CanonicalHashWriter`:
1. `SNAPSHOT_ID_DOMAIN` (`wmcp-api-snapshot-v1`, length-prefixed).
2. `subject` (length-prefixed UTF-8 string).
3. `scope` (tag `0` + `module_path` for Module; tag `1` + `package_id` + count + entry points for Package).
4. `revision` (opaque length-prefixed string).
5. `surface.surface_hash` (64-character lowercase hex string).

> [!NOTE]
> Snapshot ID does **not** depend on timestamps, machine hostname, or storage path. Distinct revisions with identical API surfaces produce distinct `snapshot_id` values because `revision` is in the preimage.

---

## 6. Failure & Security Invariants

1. **Complete-Only Admission**: Attempting to persist `AnalysisStatus::Partial` returns `SnapshotError::IncompleteAnalysis`; attempting `AnalysisStatus::Unsupported` returns `SnapshotError::UnsupportedAnalysis`.
2. **Surface Hash Tamper Rejection**: Pre-admission and on-read validation recompute the canonical WMCP-5 surface hash from normalized symbols. Mismatches return `SnapshotError::SurfaceHashMismatch`.
3. **Conflict Detection**: Same coordinate `(subject, revision)` with different surface hash returns `SnapshotError::SnapshotConflict` (fails closed, zero overwrite).
4. **Path Traversal Immunity**: Coordinates and subjects are mapped through `safe_segment` (human-readable sanitized prefix + SHA-256 hash), preventing `../` traversal, separator injection, and Windows reserved filenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
5. **Foreign File Preservation**: Repository index and history operations touch only managed snapshot artifacts; foreign files located in storage roots are preserved.

---

## 7. Test & Verification Evidence

- **Rust Analysis Test Suite**: **47 / 47 PASS** (0 failed).
- **Workspace Cargo Suite**: **149 / 149 PASS** (0 failed).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` $\to$ **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` $\to$ **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 8. Status

**WMCP-6 IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**

# WMCP-6 - Persistent API Snapshots & Immutable History Authority

## 1. Purpose & Scope

This document establishes the durable, immutable, and fail-closed persistence authority for authoritative public API observations (**WMCP-6 / WMCP-6-R1**):
- **Authoritative Snapshot Envelope V1 (`wmcp-api-snapshot-v1`)**: Wraps validated WMCP-5 `PublicApiSurface` observations with explicit schema versioning, deterministic snapshot identity, and scoped coordinates. Speculative `parent_snapshot_id` has been removed from V1.
- **Manifest as Commit Authority**: The history manifest (`history/<safe_subject>.json`) is the sole commit authority. Snapshot files (`snapshots/<snapshot_id>.json`) are immutable content blobs. An uncommitted snapshot blob is treated as an uncommitted orphan and is never exposed through history or coordinate lookups.
- **Cross-Process & Multi-Instance Locking**: Manifest mutations and coordinate conflict checks are serialized via `SubjectFileLock` (cross-process file lock with stale-lock recovery), preventing last-writer-wins and lost history entries across multiple instances or processes.
- **Complete Coordinate Authority**: Coordinates explicitly include `(subject, PublicApiScope, revision)`. Module and Package observations for the same subject/revision coexist without collision.
- **Explicit Storage Root Configuration**: Production requires explicit configuration via `ANALYSIS_SNAPSHOT_DIR` (`SnapshotRepository::open_from_env()`). Missing configuration fails closed rather than silently falling back to ephemeral OS temp storage.
- **Retirement of Legacy Production Writer**: Legacy `save_snapshot` has been retired from the active event consumer in `main.rs`. All authoritative public API persistence flows through `SnapshotRepository`.
- **Fail-Closed Admission**: Rejects `AnalysisStatus::Partial` and `AnalysisStatus::Unsupported` at the repository boundary; only `AnalysisStatus::Complete` surfaces enter authoritative history.
- **Full Read Verification**: Deserialization re-validates schema version, `AnalysisStatus::Complete`, canonical WMCP-5 surface hash, and deterministic snapshot ID.
- **Deterministic History Sequence**: Exposes history ordered strictly by recording/capture sequence, without performing SemVer or PEP 440 parsing.

### Non-Goals
- **No Breaking Change Detection / Scenario Engine**: Counterfactual simulations and breaking change evaluation belong to **WMCP-7**.
- **No SemVer / PEP 440 Compatibility Engine**: Version constraint resolution, range matching, and version ordering belong to **WMCP-8**.
- **No WebMCP Tool Activation**: `simulate_api_changes` remains `DEFERRED`.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `69c86d720d0d93b9200665d861211399261c49e1`
- **Parent HEAD**: `a8fb93e44261e08be7faa10bd18241034a4bf639`
- **WMCP-5 Closure HEAD**: `a8fb93e44261e08be7faa10bd18241034a4bf639`
- **WMCP-4 Closure HEAD**: `2d208c94612ffe1c920d08a0a74c66653c8ee965`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Pre-Existing Snapshot Inventory & Call Graph

| Component | Path | Responsibility | Production Reachability | Format |
| :--- | :--- | :--- | :--- | :--- |
| `PublicApiSnapshot` | `apps/analysis/src/ast_parser.rs` | Legacy in-memory snapshot representation | In-memory only | Legacy struct |
| `save_snapshot` | `apps/analysis/src/main.rs` | **RETIRED & REMOVED** | **REMOVED** | Legacy JSON |
| `load_previous_snapshot` | `apps/analysis/src/main.rs` | Read-only legacy file reader for breaking detector | Production-Reachable (Read-only) | Legacy JSON |
| `SnapshotRepository` | `apps/analysis/src/api_snapshot.rs` | **Sole authoritative persistence engine** | **PRODUCTION (Authoritative)** | Versioned V1 Envelope JSON (`wmcp-api-snapshot-v1`) |

### Authoritative Call Graph
```
Source Code Tarball
        |
        v
WMCP-5 PublicApiExtractor::extract_package / extract_module
        |
        v
PublicApiSurface (AnalysisStatus::Complete)
        |
        v
SnapshotRepository::open_from_env() -> SnapshotRepository::put(subject, scope, revision, surface)
        |
   +----+----+
   |         |
Immutable  Commit Manifest
Content    (history/<subject>.json under SubjectFileLock)
Blob         |
(snapshots/  v
 <id>.json)  get_by_coordinate / list_history
        |
        v
Future WMCP-7 / WMCP-8 Consumers
```

---

## 4. Storage Architecture & Directory Layout

### Storage Root Authority
Configured via `ANALYSIS_SNAPSHOT_DIR` environment variable. In production, missing environment variable causes `SnapshotRepository::open_from_env()` to return `SnapshotError::MissingStorageRootConfig`.

### Filesystem Layout
```
<storage_root>/
  ├── snapshots/
  │   └── <snapshot_id>.json                # Immutable ApiSnapshotEnvelope content blobs
  ├── history/
  │   └── <safe_subject>.json               # Authoritative SubjectHistoryManifest (Commit Authority)
  ├── _locks/
  │   └── <safe_subject>.lock               # Cross-process advisory lock file
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
  "scope": {
    "Package": {
      "package_id": "my-package",
      "entry_points": ["src/lib.rs"]
    }
  },
  "revision": "1.0.0",
  "captured_at_epoch_ms": 1725091200000,
  "surface": { ... }
}
```

### Deterministic Snapshot ID Preimage (`compute_snapshot_id`)
Encoded via `CanonicalHashWriter`:
1. `SNAPSHOT_ID_DOMAIN` (`wmcp-api-snapshot-v1`, length-prefixed).
2. `subject` (length-prefixed UTF-8 string).
3. `scope` (tag `0` + `module_path` for Module; tag `1` + `package_id` + count + entry points for Package).
4. `revision` (opaque length-prefixed string).
5. `surface.surface_hash` (64-character lowercase hex string).

---

## 6. Failure & Security Invariants

1. **Complete-Only Admission**: Attempting to persist `AnalysisStatus::Partial` returns `SnapshotError::IncompleteAnalysis`; attempting `AnalysisStatus::Unsupported` returns `SnapshotError::UnsupportedAnalysis`.
2. **Surface Hash Tamper Rejection**: Pre-admission and on-read validation recompute the canonical WMCP-5 surface hash from normalized symbols. Mismatches return `SnapshotError::SurfaceHashMismatch`.
3. **Conflict Detection**: Same coordinate `(subject, scope, revision)` with different surface hash returns `SnapshotError::SnapshotConflict` (fails closed, zero overwrite).
4. **Path Traversal Immunity**: Coordinates and subjects are mapped through `safe_segment` (human-readable sanitized prefix + SHA-256 hash), preventing `../` traversal, separator injection, and Windows reserved filenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
5. **Foreign File Preservation**: Repository operations touch only managed snapshot artifacts; foreign files located in storage roots are preserved.

---

## 7. Test & Verification Evidence

- **Rust Analysis Test Suite**: **47 / 47 PASS** (0 failed).
- **Workspace Cargo Suite**: **149 / 149 PASS** (0 failed).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` -> **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` -> **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 8. Status

**WMCP-6-R1 IMPLEMENTED - PENDING INDEPENDENT RE-VERIFICATION**

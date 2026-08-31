# WMCP-6 - Persistent API Snapshots & Immutable History Authority

## 1. Purpose & Scope

This document establishes the durable, immutable, and fail-closed persistence authority for authoritative public API observations (**WMCP-6 / WMCP-6-R2**):
- **Real OS Advisory File Locking (`fs2`)**: Lock acquisition holds an exclusive kernel-level OS file lock on `locks/<safe_subject>.lock`. No custom leases, no 15-second age thresholds, no age-based lock stealing, and no file deletion on release.
- **Manifest as Commit Authority**: The history manifest (`history/<safe_subject>.json`) is the sole commit authority. Snapshot files (`snapshots/<snapshot_id>.json`) are immutable content blobs. Both `get_by_coordinate` and `get_by_id` enforce manifest commitment, rejecting uncommitted orphan blobs.
- **Breaking Detector Baseline Progression (`surface_to_snapshot`)**: A lossless compatibility adapter converts authoritative V1 `PublicApiSurface` into `PublicApiSnapshot` for breaking change baseline resolution. The pipeline resolves baselines V1-first with legacy read-only fallback (`L -> A -> B -> C`), keeping the detector baseline active without writing legacy data.
- **Authoritative Package Entry-Point Resolution (`resolve_package_entry_points`)**: Enforces WMCP-5 caller-designated package entry points from package metadata (`package.json`, `Cargo.toml`, `__init__.py`) or standard root conventions, preventing blind injection of internal modules as package public API.
- **Complete Coordinate Authority**: Coordinates explicitly include `(subject, PublicApiScope, revision)`. Module and Package observations for the same subject/revision coexist without collision.
- **Explicit Storage Root Configuration**: Production requires explicit configuration via `ANALYSIS_SNAPSHOT_DIR` (`SnapshotRepository::open_from_env()`). Missing configuration fails closed rather than silently falling back to ephemeral OS temp storage.
- **Retirement of Legacy Production Writer**: Legacy `save_snapshot` has been completely removed from `apps/analysis/src/main.rs`. All authoritative public API persistence flows through `SnapshotRepository`.
- **Fail-Closed Admission**: Rejects `AnalysisStatus::Partial` and `AnalysisStatus::Unsupported` at the repository boundary; only `AnalysisStatus::Complete` surfaces enter authoritative history.

### Non-Goals
- **No Breaking Change Detection / Scenario Engine**: Counterfactual simulations and breaking change evaluation belong to **WMCP-7**.
- **No SemVer / PEP 440 Compatibility Engine**: Version constraint resolution, range matching, and version ordering belong to **WMCP-8**.
- **No WebMCP Tool Activation**: `simulate_api_changes` remains `DEFERRED`.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `69b1fc5cbb812482715c67753400bbad833557d5`
- **Parent HEAD**: `69c86d720d0d93b9200665d861211399261c49e1`
- **WMCP-5 Closure HEAD**: `a8fb93e44261e08be7faa10bd18241034a4bf639`
- **WMCP-4 Closure HEAD**: `2d208c94612ffe1c920d08a0a74c66653c8ee965`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Pre-Existing Snapshot Inventory & Call Graph

| Component | Path | Responsibility | Production Reachability | Format |
| :--- | :--- | :--- | :--- | :--- |
| `PublicApiSnapshot` | `apps/analysis/src/ast_parser.rs` | In-memory snapshot representation | In-memory only | Struct |
| `save_snapshot` | `apps/analysis/src/main.rs` | **RETIRED & REMOVED** | **REMOVED** | Legacy JSON |
| `load_previous_snapshot` | `apps/analysis/src/main.rs` | Read-only legacy fallback reader | Production-Reachable (Fallback) | Legacy JSON |
| `SnapshotRepository` | `apps/analysis/src/api_snapshot.rs` | **Sole authoritative persistence engine** | **PRODUCTION (Authoritative)** | Versioned V1 Envelope JSON (`wmcp-api-snapshot-v1`) |

### Authoritative Call Graph
```
Source Code Tarball
        |
        v
resolve_package_entry_points (package metadata / conventions)
        |
        v
WMCP-5 PublicApiExtractor::extract_package
        |
        v
PublicApiSurface (AnalysisStatus::Complete)
        |
   +----+----+
   |         |
   |         v
   |    SnapshotRepository::get_by_coordinate(prev_ver) -> surface_to_snapshot
   |         |
   |         v
   |    breaking_detector.detect_breaking_changes
   |
   v
SnapshotRepository::put(subject, scope, revision, surface)
   |
   +--> snapshots/<snapshot_id>.json (immutable blob)
   |
   +--> history/<subject>.json (commit manifest under fs2 OS file lock)
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
  │   └── <safe_subject>.lock               # Persistent OS file lock target (fs2)
  └── _tmp/                                 # Isolated staging directory for atomic renames
```

---

## 5. Breaking Detector Losslessness Matrix

| Detector Field | Required by Detector | Available in V1 Surface | Lossless Mapping |
| :--- | :--- | :--- | :--- |
| `name` | YES | `PublicApiSymbol.exported_name` | **YES** |
| `qualified_path` | YES | `PublicApiSymbol.qualified_name` | **YES** |
| `kind` | YES | `PublicApiSymbol.kind` | **YES** |
| `visibility` | YES | `Visibility::Public` | **YES** |
| `signature` | YES | `sig.normalized_signature` | **YES** |
| `raw_signature` | YES | `sig.raw_signature` | **YES** |
| `start_line` / `end_line` | Optional diagnostic | `sym.provenance` | **YES** |
| `parameters` | YES | `sig.parameters` (1:1 with `ParameterInfo`) | **YES** |
| `return_type` | YES | `sig.return_type` | **YES** |
| `generics` | YES | `sig.generics` | **YES** |
| `annotations` | YES | `sig.annotations` | **YES** |
| `is_exported` | YES | `true` | **YES** |
| `is_overload_signature`| YES | boolean flag | **YES** |

---

## 6. Test & Verification Evidence

- **Rust Analysis Test Suite**: **46 / 46 PASS** (0 failed).
- **Workspace Cargo Suite**: **148 / 148 PASS** (0 failed).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` -> **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` -> **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 7. Status

**WMCP-6-R2 IMPLEMENTED - PENDING FINAL INDEPENDENT RE-VERIFICATION**

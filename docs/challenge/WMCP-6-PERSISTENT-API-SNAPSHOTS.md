# WMCP-6 - Persistent API Snapshots & Immutable History Authority

## 1. Purpose & Scope

This document establishes the durable, immutable, and fail-closed persistence authority for authoritative public API observations (**WMCP-6 / WMCP-6-R4**):
- **Archive Extraction & Metadata Isolation (`ExtractedPackageFiles`)**: Archive extraction separates extracted files into `source_files` (files with programming language extensions recognized by `Language::from_extension`) and `metadata_files` (strictly `package.json` and `Cargo.toml`).
  - AST `ParserPool::parse` receives **ONLY** `source_files`, ensuring complete parser isolation and preventing non-source files from polluting AST parsing.
  - Non-authority metadata files (e.g. `tsconfig.json`, `package-lock.json`, `config.toml`, `rustfmt.toml`) are ignored during extraction.
- **Manifest Root Binding & Exact Target Resolution (`resolve_package_entry_points`)**: Package entry targets are resolved relative to the directory containing the unique package manifest (`manifest_dir.join(normalized_target)`), with exact archive-relative path matching against `source_files`.
  - Suffix matching across the archive is eliminated; a manifest at `packages/a/package.json` cannot resolve to `packages/b/src/index.js`.
  - Common archive prefixes (e.g. `package/package.json` -> `package/src/index.js`, `crate-1.0.0/Cargo.toml` -> `crate-1.0.0/src/lib.rs`) resolve naturally.
- **Strict Authority Gating**:
  - **TypeScript / JavaScript**: Requires a unique valid `package.json` with supported string `main`, `types`, or `typings` resolving to a single matching source file within the manifest subtree. If `package.json` is missing, malformed, contains `"exports"`, has conflicting roots, has path traversal, or has missing targets, the integration returns `None` and skips Package snapshot creation.
  - **Rust**: Requires a unique `Cargo.toml` without custom `[lib]` overrides and standard `src/lib.rs` within the manifest subtree. Binary-only crates and non-Cargo sources return `None`.
  - **Python / Java / Go**: Production Package snapshot integration is strictly `UNSUPPORTED` in WMCP-6 (returns `None`), preventing the persistence of false Complete package surfaces. Parser support for these languages in WMCP-5 remains fully active.
- **Real OS Advisory File Locking (`fs2`)**: Lock acquisition holds an exclusive kernel-level OS file lock on `locks/<safe_subject>.lock`. Non-blocking `try_lock_exclusive` retries in a 15ms loop until acquired or until the configured 10-second acquisition timeout expires (`SnapshotError::LockTimeout`). No custom leases, no age-based lock stealing, and no file deletion on release.
- **Manifest as Commit Authority**: The history manifest (`history/<safe_subject>.json`) is the sole commit authority. Snapshot files (`snapshots/<snapshot_id>.json`) are immutable content blobs. Both `get_by_coordinate` and `get_by_id` enforce manifest commitment, rejecting uncommitted orphan blobs.
- **Breaking Detector Baseline Progression (`surface_to_snapshot`)**: A lossless compatibility adapter converts authoritative V1 `PublicApiSurface` into `PublicApiSnapshot` for breaking change baseline resolution. The pipeline resolves baselines V1-first with legacy read-only fallback (`L -> A -> B -> C`), keeping the detector baseline active without writing legacy data.
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
- **Starting HEAD**: `2f04d005731c3decfa35bd7f4a7549a923dbad8d`
- **Parent HEAD**: `78d650d2b4deb8cfe625aebda456b7a2fd4b1f87`
- **WMCP-5 Closure HEAD**: `a8fb93e44261e08be7faa10bd18241034a4bf639`
- **WMCP-4 Closure HEAD**: `2d208c94612ffe1c920d08a0a74c66653c8ee965`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Production Support Matrix

| Language | WMCP-5 Parser Support | Production Package Snapshot Support | Authority Requirements |
| :--- | :--- | :--- | :--- |
| **TypeScript / JavaScript** | **YES** | **SUPPORTED (Strict Subset)** | Unique `package.json` with matching single `main`/`types`/`typings` target; no `"exports"`. |
| **Rust** | **YES** | **SUPPORTED (Strict Subset)** | Unique `Cargo.toml` with standard `src/lib.rs`; no custom `[lib]` override. |
| **Python** | **YES** | **UNSUPPORTED** | Returns `None` (skips Package snapshot creation). |
| **Java** | **YES** | **UNSUPPORTED** | Returns `None` (skips Package snapshot creation). |
| **Go** | **YES** | **UNSUPPORTED** | Returns `None` (skips Package snapshot creation). |

---

## 4. Test & Verification Evidence

- **Rust Analysis Test Suite**: **47 / 47 PASS** (0 failed).
- **Workspace Cargo Suite**: **149 / 149 PASS** (0 failed).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` -> **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` -> **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 5. Status

**WMCP-6-R4 IMPLEMENTED - PENDING FINAL CLOSURE RE-VERIFICATION**

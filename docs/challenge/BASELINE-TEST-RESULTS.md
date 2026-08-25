# WMCP-0A Baseline Test Results

This document records the exact baseline verification command executions performed on the immutable pre-challenge commit `864a3d6905826bd0fabab02cf02785ab0c702842`.

Per the WMCP-0A specification, each required command was attempted at most once. No retry loops, auto-fixes, or repeated polling were executed.

---

## Summary Table

| Category | Command | Directory | Exit Code | Status | Duration / Details |
|---|---|---|---|---|---|
| Rust Formatting | `cargo fmt --all -- --check` | Root | 0 | PASS | Clean formatting |
| Rust Workspace Check | `cargo check --workspace --all-targets` | Root | 0 | PASS | Finished dev target in 0.79s |
| Rust Clippy | `cargo clippy --workspace --all-targets --all-features -- -D warnings -D clippy::all` | Root | 1 | BLOCKED | Missing `cargo-clippy` toolchain component |
| Rust Unit & Bin Tests | `cargo test --workspace --lib --bins` | Root | 0 | PASS | 114 tests passed across 8 crates |
| Frontend Install | `npm ci` | `apps/frontend` | 0 | PASS | 590 packages installed in 26s |
| Frontend Type Check | `npx tsc --noEmit` | `apps/frontend` | 0 | PASS | Zero TypeScript errors |
| Frontend Lint | `npm run lint` | `apps/frontend` | 0 | PASS | ESLint passed with 0 errors |
| Frontend Production Build | `npm run build` | `apps/frontend` | 0 | PASS | Next.js 16.2.7 compiled 15 routes |
| Frontend E2E (Playwright) | `npx playwright test` | `apps/frontend` | N/A | BLOCKED | Live backend services unavailable |

---

## Detailed Command Execution Records

### 1. `cargo fmt --all -- --check`
- **Command:** `cargo fmt --all -- --check`
- **Working directory:** `.` (Repository root)
- **Exit code:** `0`
- **Status:** `PASS`
- **Result summary:** All Rust source files adhere to the workspace `rustfmt.toml` rules without changes required.
- **Failure reason:** None
- **Environment limitations:** None

### 2. `cargo check --workspace --all-targets`
- **Command:** `cargo check --workspace --all-targets`
- **Working directory:** `.` (Repository root)
- **Exit code:** `0`
- **Status:** `PASS`
- **Result summary:** All crates, library targets, binary targets, and benchmarks compiled cleanly in unoptimized dev profile.
- **Failure reason:** None
- **Environment limitations:** None

### 3. `cargo clippy --workspace --all-targets --all-features -- -D warnings -D clippy::all`
- **Command:** `cargo clippy --workspace --all-targets --all-features -- -D warnings -D clippy::all`
- **Working directory:** `.` (Repository root)
- **Exit code:** `1`
- **Status:** `BLOCKED`
- **Result summary:** Toolchain component `cargo-clippy.exe` is not installed on the active host toolchain (`stable-x86_64-pc-windows-msvc`).
- **Failure reason:** Missing local toolchain component. Per strict single-attempt execution policy, no environment modification was performed.
- **Environment limitations:** Rustup clippy component absent on execution host (observed process exit code: 1).

### 4. `cargo test --workspace --lib --bins`
- **Command:** `cargo test --workspace --lib --bins`
- **Working directory:** `.` (Repository root)
- **Exit code:** `0`
- **Status:** `PASS`
- **Result summary:**
  - `apps/analysis`: 11 passed; 0 failed
  - `apps/ingestion`: 30 passed; 0 failed
  - `packages/metrics`: 1 passed; 0 failed
  - `packages/models`: 42 passed; 0 failed
  - `packages/storage`: 22 passed; 0 failed
  - `apps/syncer`: 1 passed; 0 failed
  - `packages/tracing`: 3 passed; 0 failed
  - `apps/vector-writer`: 4 passed; 0 failed
  - Total: 114 tests passed, 0 failed, 0 ignored.
- **Failure reason:** None
- **Environment limitations:** Integration tests requiring live container instances (Memgraph, Postgres, Qdrant, RisingWave) were not executed in this unit run.

### 5. `npm ci`
- **Command:** `npm ci`
- **Working directory:** `apps/frontend`
- **Exit code:** `0`
- **Status:** `PASS`
- **Result summary:** Clean installation of 590 node packages from `package-lock.json` in 26s.
- **Failure reason:** None
- **Environment limitations:** None

### 6. `npx tsc --noEmit`
- **Command:** `npx tsc --noEmit`
- **Working directory:** `apps/frontend`
- **Exit code:** `0`
- **Status:** `PASS`
- **Result summary:** TypeScript 5.8.0 type check passed with zero diagnostics across the entire frontend application.
- **Failure reason:** None
- **Environment limitations:** None

### 7. `npm run lint`
- **Command:** `npm run lint` (`eslint . --ext .ts,.tsx`)
- **Working directory:** `apps/frontend`
- **Exit code:** `0`
- **Status:** `PASS`
- **Result summary:** ESLint finished with zero warnings and zero errors.
- **Failure reason:** None
- **Environment limitations:** None

### 8. `npm run build`
- **Command:** `npm run build` (`next build --webpack`)
- **Working directory:** `apps/frontend`
- **Exit code:** `0`
- **Status:** `PASS`
- **Environment variables:**
  - `NEXT_PUBLIC_GRAPHQL_ENDPOINT=http://localhost:8000/graphql`
  - `NEXT_PUBLIC_WS_ENDPOINT=ws://localhost:8000/graphql/ws`
- **Result summary:** Compiled Next.js 16.2.7 production bundle in 26.7s; successfully generated 15 static and dynamic routes.
- **Failure reason:** None
- **Environment limitations:** None

### 9. `npx playwright test`
- **Command:** `npx playwright test`
- **Working directory:** `apps/frontend`
- **Exit code:** N/A
- **Status:** `BLOCKED`
- **Result summary:** End-to-end browser testing requires live services (GraphQL API gateway, Memgraph graph database, PostgreSQL, Qdrant vector database) listening on configured ports.
- **Failure reason:** Infrastructure dependency not running. Per WMCP-0A Playwright policy, recorded as BLOCKED rather than spinning up mock environments.
- **Environment limitations:** Live backend infrastructure unavailable.

---

## Supplemental Out-of-Scope Execution

A previous WMCP-0A attempt reported that a release-mode test execution occurred. The exact command output and independently verifiable exit result were not retained in the final evidence set. It is therefore recorded as UNVERIFIED supplemental execution history and is not used by any WMCP-0A acceptance gate.

- **Status:** `UNVERIFIED`

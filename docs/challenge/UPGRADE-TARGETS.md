# WebMCP Challenge - Upgrade Targets & Modernization Roadmap

## 1. Authoritative Upgrade Decision Table

This document defines the binding target versions, decision classifications, and implementation phases for the platform modernization track on `feature/webmcp-challenge-2026`.

| Component | Current Repository Baseline | Target Version | Decision | Reason / Evidence | Target Phase |
|---|---|---|---|---|---|
| **Next.js** | `16.2.7` | `16.3.3` | **LOCKED** | Emergency security release (25 Aug 2026) resolving Critical RCEs GHSA-2xp9-vwfh-vxw4 and CVE-2026-75604. | WMCP-1B |
| **@next/eslint-plugin-next** | `16.2.7` | `16.3.3` | **LOCKED** | Mandatory version alignment with Next.js core framework. | WMCP-1B |
| **PostCSS** | `8.5.15` (declared override) | `8.5.26` | **LOCKED** | Resolves GHSA-r28c-9q8g-f849 (patched >=8.5.18) and GHSA-fxqj-rqcc-2cmp (patched >=8.5.23). | WMCP-1B |
| **Sharp** | `0.34.5` (resolved in lockfile) | `0.35.3` | **LOCKED** | Resolves GHSA-f88m-g3jw-g9cj (affected <0.35.0, patched >=0.35.0). Exact resolution mechanism decided in 1B. | WMCP-1B |
| **React** | `19.2.7` (resolved) / `^19.2.5` | `19.2.8` | **CANDIDATE** | Current stable patch release; low-risk alignment candidate for evaluation during WMCP-1B. | WMCP-1B |
| **React DOM** | `19.2.7` (resolved) / `^19.2.5` | `19.2.8` | **CANDIDATE** | Current stable patch release; low-risk alignment candidate for evaluation during WMCP-1B. | WMCP-1B |
| **Clippy Configuration** | `vec-init-len-threshold = 10` | Modernized `.clippy.toml` | **LOCKED** | Removes removed/deprecated lint key blocking modern Clippy execution. | WMCP-1C |
| **Node.js (CI)** | `node-version: '22'` (floating) | `24.19.0` | **CANDIDATE** | Normalizes CI to modern Active LTS runtime environment. | WMCP-1C |
| **Node.js (Docker)** | `node:22-alpine` (floating) | `24.19.0-alpine` | **CANDIDATE** | Normalizes Docker deployment to modern Active LTS runtime. | WMCP-1C |
| **Rust Toolchain (CI)** | `dtolnay/rust-toolchain@stable` | `1.98.0` (pinned) | **CANDIDATE** | Introduces `rust-toolchain.toml` to prevent compiler version drift. | WMCP-1C |
| **TypeScript** | `5.9.3` (resolved) / `^5.8.0` | `6.0.3` | **CANDIDATE** | Major language modernization; requires isolated type-check verification. | WMCP-1D |
| **typescript-eslint** | `8.51.0` (resolved) / `^8.18.2` | `8.54.0` | **CANDIDATE** | Minor tooling update compatible with ESLint 9 flat config. | WMCP-1D |
| **@playwright/test** | `1.60.0` (resolved) / `^1.59.1` | `1.62.1` | **CANDIDATE** | Test runner modernization; isolated from production runtime. | WMCP-1D |
| **ESLint** | `9.39.2` (resolved) / `^9.17.0` | `10.9.0` | **DEFERRED** | Major v10 ecosystem migration risks flat config breakage during challenge. | Post-WMCP-1 |
| **Node.js 26.x** | N/A | N/A | **REJECTED** | Current non-LTS branch; inappropriate for challenge critical path. | N/A |
| **Next.js Canary / Pre-release** | N/A | N/A | **REJECTED** | Unstable pre-release; violates production challenge stability requirements. | N/A |
| **React 19.3 Canary** | N/A | N/A | **REJECTED** | Unstable experimental build; rejected for challenge critical path. | N/A |

---

## 2. Decision Categories

- **LOCKED:** Sufficient technical and security evidence exists that subsequent implementation phases MUST target this exact version.
- **CANDIDATE:** Recommended modernization target; verified in dedicated isolated subphases with specific fallback paths.
- **DEFERRED:** Valid upstream version, but migration risk outweighs challenge benefits; retained at current stable baseline.
- **REJECTED:** Incompatible, experimental, or unstable release prohibited on the challenge branch.

---

## 3. Staged Implementation Order

### Subphase WMCP-1B: Security-Critical Frontend Baseline
- **Scope:** Update `next` (`16.3.3`), `@next/eslint-plugin-next` (`16.3.3`), `postcss` (`8.5.26`), and remediate `sharp` (`>= 0.35.0`, preferred `0.35.3`). Evaluate `react` / `react-dom` (`19.2.8`) patch alignment.
- **Isolation Principle:** No TypeScript major upgrades, no Node major runtime changes, no ESLint major migrations, and no broad dependency sweeps.

### Subphase WMCP-1C: Runtime & Rust Toolchain Normalization
- **Scope:** Pin Rust toolchain to `1.98.0` via `rust-toolchain.toml`, remove deprecated `vec-init-len-threshold = 10` from `.clippy.toml`, and evaluate Node `24.19.0` LTS alignment in CI and Docker.

### Subphase WMCP-1D: Frontend Tooling Modernization
- **Scope:** Evaluate TypeScript `6.0.3` and Playwright `1.62.1` with full regression checks.

### Subphase WMCP-1R: Platform Modernization Closure
- **Scope:** End-to-end multi-crate and frontend verification across the modernized platform baseline.

---

## 4. Future Test Gates for WMCP-1B (Security Upgrade)

Execution of WMCP-1B must pass the following deterministic verification gates:
1. `npm ci` finishes cleanly with zero lockfile conflicts.
2. `npm ls next` confirms exact resolution of `16.3.3`.
3. `npm ls @next/eslint-plugin-next` confirms exact resolution of `16.3.3`.
4. `npm ls postcss` confirms resolution of `8.5.26` for root override and no affected versions remain active.
5. `npm ls sharp` confirms resolution of `>= 0.35.0` (preferred `0.35.3`).
6. `npx tsc --noEmit` completes with zero type errors.
7. `npm run lint` completes with zero ESLint errors against flat config.
8. `npm run build` succeeds under `--webpack` mode.
9. Verification of `.next/standalone` generation for Docker containerization.
10. Verification that custom `@/` path aliases resolve properly.
11. Verification that security response headers remain configured.

---

## 5. Contingency and Regression Policy

If Next.js 16.3.3 encounters an irreconcilable webpack or SSR regression in WMCP-1B:
1. Do NOT return to vulnerable `16.2.7`.
2. Mark WMCP-1B as **HOLD**.
3. Diagnose and isolate the regression cause.
4. Prefer a newer patched stable `16.3.x` release if available upstream.
5. Apply minimal, verified compatibility adjustments.
6. Consider Next.js `15.5.24` (Maintenance LTS) only as a separately evaluated contingency requiring its own full downgrade compatibility audit. Next 15.5.24 is NOT an automatic drop-in rollback.

---

## 6. WMCP-1R Final Disposition

This section records the final disposition of all candidate, locked, deferred, and rejected targets across the closed WMCP-1 track (WMCP-1A through WMCP-1D-R2). This disposition reflects actual implementation outcomes and does not retroactively rewrite the historical WMCP-1A research freeze.

| Component | Historical 1A Decision | Final 1R Resolution | Final Status | Evidence / Notes |
|---|---|---|---|---|
| **Next.js** | LOCKED (16.3.3) | `16.3.3` | **ACHIEVED** | Verified in WMCP-1B; webpack build clean; 15/15 routes compiled. |
| **@next/eslint-plugin-next** | LOCKED (16.3.3) | `16.3.3` | **ACHIEVED** | Aligned with core Next.js 16.3.3. |
| **PostCSS** | LOCKED (8.5.26) | `8.5.26` | **ACHIEVED** | All active PostCSS tree instances resolved to 8.5.26 via override. |
| **Sharp** | LOCKED (0.35.3) | `0.35.3` | **ACHIEVED** | Transitive resolution under Next 16.3.3 satisfies GHSA-f88m. |
| **React** | CANDIDATE (19.2.8) | `19.2.7` | **NOT ADOPTED** | Kept on stable 19.2.7; non-security patch candidate. |
| **React DOM** | CANDIDATE (19.2.8) | `19.2.7` | **NOT ADOPTED** | Kept on stable 19.2.7; non-security patch candidate. |
| **Clippy Configuration** | LOCKED (Modernized) | Modernized | **ACHIEVED** | Removed removed `vec-init-len-threshold` key; preserved MSRV 1.85. |
| **Node.js (CI)** | CANDIDATE (24.19.0) | `24.19.0` | **ACHIEVED** | Normalization to Node 24.19.0 LTS in CI workflow. |
| **Node.js (Docker)** | CANDIDATE (24.19.0-alpine) | `24.19.0-alpine` | **ACHIEVED** | Pinned all three frontend stages to `node:24.19.0-alpine`. |
| **Rust Toolchain (CI)** | CANDIDATE (1.98.0) | `1.98.0` | **ACHIEVED** | Pinned via `rust-toolchain.toml`, CI workflow, and deploy Dockerfiles. |
| **TypeScript** | CANDIDATE (6.0.3) | `5.9.3` | **NOT ADOPTED** | TS 6/7 deferred to preserve stable `typescript-eslint` compatibility. |
| **typescript-eslint** | CANDIDATE (8.54.0) | `8.67.0` | **ACHIEVED** | Modernized to compatible 8.67.0 target supporting TS 5.9.3. |
| **@playwright/test** | CANDIDATE (1.62.1) | `1.62.1` | **ACHIEVED** | Upgraded to 1.62.1; 114 tests discovered, 8/8 smoke passed. |
| **@types/node** | Unspecified | `24.13.3` | **ACHIEVED** | Aligned with Node 24 runtime; zero TypeScript errors. |
| **ESLint** | DEFERRED (10.9.0) | `9.39.5` | **DEFERRED** | Retained on compatible v9 maintenance line (9.39.5). |
| **Node.js 26.x** | REJECTED | N/A | **REJECTED** | Non-LTS branch; excluded from challenge baseline. |
| **Next.js Canary / Pre-release** | REJECTED | N/A | **REJECTED** | Unstable pre-release; excluded from challenge baseline. |
| **React 19.3 Canary** | REJECTED | N/A | **REJECTED** | Unstable build; excluded from challenge baseline. |

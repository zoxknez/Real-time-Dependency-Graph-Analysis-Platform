# WebMCP Challenge - Upgrade Targets & Modernization Roadmap

## 1. Authoritative Upgrade Decision Table

This document defines the binding target versions, decision classifications, and implementation phases for the platform modernization track on `feature/webmcp-challenge-2026`.

| Component | Current Repository Baseline | Target Version | Decision | Reason / Evidence | Target Phase |
|---|---|---|---|---|---|
| **Next.js** | `16.2.7` | `16.3.3` | **LOCKED** | Emergency security release (25 Aug 2026) resolving Critical RCEs GHSA-2xp9-vwfh-vxw4 and CVE-2026-75604. | WMCP-1B |
| **@next/eslint-plugin-next** | `16.2.7` | `16.3.3` | **LOCKED** | Mandatory version alignment with Next.js core framework. | WMCP-1B |
| **React** | `19.2.7` (resolved) / `^19.2.5` | `19.2.8` | **LOCKED** | Stable patch alignment with Next 16.3.3 peer dependency requirements. | WMCP-1B |
| **React DOM** | `19.2.7` (resolved) / `^19.2.5` | `19.2.8` | **LOCKED** | Stable patch alignment with Next 16.3.3 peer dependency requirements. | WMCP-1B |
| **PostCSS** | `8.5.15` (declared override) | `8.5.22` | **LOCKED** | Resolves High-severity advisory GHSA-r28c-9q8g-f849 in build pipeline. | WMCP-1B |
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
- **Scope:** Update `next` (`16.3.3`), `@next/eslint-plugin-next` (`16.3.3`), `react` (`19.2.8`), `react-dom` (`19.2.8`), and `postcss` (`8.5.22`).
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
2. `npx tsc --noEmit` completes with zero type errors.
3. `npm run lint` completes with zero ESLint errors against flat config.
4. `npm run build` succeeds under `--webpack` mode.
5. Verification of `.next/standalone` generation for Docker containerization.
6. Verification that custom `@/` path aliases resolve properly.
7. Verification that security response headers remain configured.
8. Verification that Next.js runtime reports exact version `16.3.3`.

---

## 5. Rollback Boundaries

If Next.js 16.3.3 encounters an irreconcilable webpack or SSR regression in WMCP-1B:
- **Rollback Target:** Next.js `15.5.24` (Maintenance LTS security patched release).
- **Rollback Condition:** Next.js 16.2.7 is strictly prohibited from remaining as a final submission artifact due to active Critical security advisories.

# WMCP-1A Platform Version & Security Truth Freeze

## 1. Purpose

This document establishes the authoritative pre-modernization platform and security baseline for the WebMCP Challenge development on branch `feature/webmcp-challenge-2026`.

It establishes the empirical evidence, security advisory status, and upgrade decision matrix governing subsequent implementation subphases (WMCP-1B, WMCP-1C, WMCP-1D, and WMCP-1R).

---

## 2. Starting Git State

- **Repository:** `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Challenge Branch:** `feature/webmcp-challenge-2026`
- **Immutable Baseline SHA:** `864a3d6905826bd0fabab02cf02785ab0c702842`
- **WMCP-0A Freeze Head:** `bea51b53289bfab8596e8fd660ef22f38a7eb403` (CLOSED)
- **WMCP-0B Contract Head:** `da6fb242c11a2dd70c54ed2072f9558a36875906` (CLOSED)
- **Starting HEAD for WMCP-1A:** `da6fb242c11a2dd70c54ed2072f9558a36875906`

---

## 3. Research Freeze Timestamp

- **Research Freeze Date:** 2026-08-26
- **Timezone:** Europe/Belgrade (UTC+2)

---

## 4. Repository Platform Baseline

| Layer | Declared Configuration | Lockfile Resolved |
|---|---|---|
| Frontend Framework | `next: 16.2.7` | `16.2.7` |
| UI Library | `react: ^19.2.5`, `react-dom: ^19.2.5` | `19.2.7` |
| Language (Frontend) | `typescript: ^5.8.0` | `5.9.3` |
| Linter | `eslint: ^9.17.0` | `9.39.2` |
| Next.js ESLint Plugin | `@next/eslint-plugin-next: 16.2.7` | `16.2.7` |
| E2E Testing | `@playwright/test: ^1.59.1` | `1.60.0` |
| State Management | `zustand: ^5.0.12` | `5.0.14` |
| 3D Visualization | `three: ^0.182.0` | `0.182.0` |
| Rust Edition | `edition = "2024"` | N/A |
| Cargo Resolver | `resolver = "2"` | N/A |

---

## 5. Frontend Runtime Baseline

Statically inspected from [apps/frontend/next.config.js](file:///d:/ProjektiApp/randomapp/apps/frontend/next.config.js):
- **Build Output:** `output: 'standalone'` (packaged for Docker deployment via `.next/standalone`).
- **Bundler Mode:** Explicit Webpack invocation (`next dev --webpack`, `next build --webpack`).
- **Image Optimization:** `images.remotePatterns: []`; `images.unoptimized: process.env.NODE_ENV === 'development'`.
- **Security Headers:** OWASP-aligned response headers configured for `/:path*` (HSTS, X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy).
- **Server Actions:** `experimental.serverActions.bodySizeLimit: '2mb'`.
- **Cache Components:** Not enabled in baseline configuration.

---

## 6. Rust Toolchain Baseline

- **Workspace Configuration:** [Cargo.toml](file:///d:/ProjektiApp/randomapp/Cargo.toml) declares `edition = "2024"` and `resolver = "2"`.
- **Rust Version Pin:** No `rust-version` field in `Cargo.toml` and no `rust-toolchain.toml` file exists in the repository.
- **Clippy Configuration:** [.clippy.toml](file:///d:/ProjektiApp/randomapp/.clippy.toml) specifies `msrv = "1.85"` and contains `vec-init-len-threshold = 10` (deprecated/removed in modern Clippy).

---

## 7. CI Platform Baseline

Statically inspected from [.github/workflows/ci.yml](file:///d:/ProjektiApp/randomapp/.github/workflows/ci.yml):
- **Node.js Toolchain:** `node-version: '22'` (floating major release).
- **Rust Toolchain:** `dtolnay/rust-toolchain@stable` (floating stable compiler).
- **Protobuf Compiler:** `PROTOC_VERSION: "29.3"`.
- **Backing Services in CI:**
  - Memgraph: `memgraph/memgraph:3.9.0`
  - Redis: `redis:8.6.0-alpine`
  - Qdrant: `qdrant/qdrant:v1.17.0`

---

## 8. Docker Platform Baseline

Statically inspected from [deploy/docker/Dockerfile.frontend](file:///d:/ProjektiApp/randomapp/deploy/docker/Dockerfile.frontend):
- **Base Image:** `node:22-alpine` across `deps`, `builder`, and `runner` stages (floating major version).
- **Runtime User:** Non-root user `nextjs:nodejs` (UID 1001).
- **Server Entrypoint:** `node server.js` running standalone Next.js server.

---

## 9. Floating Version Risks

1. **Floating Node 22 in CI & Docker:** Declaring `node-version: '22'` and `node:22-alpine` causes builds to resolve changing minor/patch releases over time, risking non-deterministic behavior.
2. **Floating Rust Toolchain in CI:** Using `dtolnay/rust-toolchain@stable` without a pinned `rust-toolchain.toml` exposes CI to compiler version drifts when new Rust versions are published upstream.

---

## 10. Current Upstream Support State (as of 2026-08-26)

- **Next.js:** 16.x is Active LTS; 15.x is Maintenance LTS. Current patched Active LTS is **16.3.3** (shipped 25 August 2026).
- **React:** Current stable release is **19.2.8**. React 19.3 packages in npm are canary/experimental.
- **Node.js:** Current releases are Node 26.7.0 (Current), Node 24.19.0 (Active LTS), Node 22.23.2 (Maintenance LTS).
- **TypeScript:** Current stable release is **6.0.3**.
- **ESLint:** Current latest stable release is **10.9.0**; ESLint 9.x remains supported in maintenance.
- **Playwright:** Current stable release is **1.62.1**.
- **Rust:** Current stable release is **Rust 1.98.0** (released 20 August 2026).

---

## 11. Security-Critical Findings

### Emergency August 2026 Next.js Security Release
On **25 August 2026**, Vercel published an emergency security release for Next.js:
- **Patched Active LTS Version:** `Next.js 16.3.3`
- **Patched Maintenance LTS Version:** `Next.js 15.5.24`

### Critical Vulnerabilities Addressed:
1. **GHSA-2xp9-vwfh-vxw4:** Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are processed.
   - *Affected Versions:* `< 16.3.3`
   - *Severity:* CRITICAL
2. **CVE-2026-75604 / GHSA-p293-qw3h-jr36:** Windows-hosted unauthenticated Remote Code Execution in Next.js internals.
   - *Affected Versions:* `< 16.3.3`
   - *Severity:* CRITICAL

### Repository Vulnerability Status:
- The repository declares and resolves `next: 16.2.7`.
- **Package Version Affected:** **YES** (16.2.7 is strictly below 16.3.3).
- **Application Exploitability:** **UNVERIFIED** (Static inspection shows `images.remotePatterns` is empty and production image processing is not exposed to untrusted external domains, but full reachability cannot be ruled out).
- **Security Action:** **SECURITY_MANDATORY**. The challenge branch must not reach final submission on Next.js 16.2.7. Upgrading to `16.3.3` is mandatory.

---

## 12. Compatibility Risk Findings

- **TypeScript 6.0.3:** Major version upgrade relative to declared `^5.8.0` / resolved `5.9.3`. Must be evaluated in an isolated tooling phase (WMCP-1D) with full type-check verification (`npx tsc --noEmit`).
- **ESLint 10.9.0:** Major tooling migration relative to `eslint.config.mjs` and `@next/eslint-plugin-next`. Should be deferred or isolated to prevent breaking flat config rules during security remediation.
- **Node 24.19.0 LTS:** Moving from Node 22 to Node 24 is a platform modernization. It must not be combined with the emergency Next.js security patch in WMCP-1B.

---

## 13. Upstream Regression Watchlist (Next.js 16.3.x)

The following upstream issue reports are tracked as part of the 16.3.x upgrade watch:
1. **`MaxListenersExceededWarning` on Webpack Builds:** [UPSTREAM REPORT / NOT REPRODUCED IN THIS REPOSITORY]
2. **Prerender Memory Retention with Cache Components:** [UPSTREAM REPORT / NOT REPRODUCED IN THIS REPOSITORY - Cache Components not enabled in repo]
3. **Webpack Flag Maintenance:** The repository explicitly specifies `--webpack` in dev and build scripts; Next 16.3 compatibility with custom webpack aliases (`@/`) must be verified in WMCP-1B.

---

## 14. Reproducibility Findings

1. Rust toolchain in CI relies on floating `dtolnay/rust-toolchain@stable`. Candidate remediation: introduce `rust-toolchain.toml` pinned to `1.98.0` in WMCP-1C.
2. `.clippy.toml` contains deprecated key `vec-init-len-threshold = 10`. Candidate remediation: remove deprecated key and modernize Clippy rules in WMCP-1C.

---

## 15. Staged Modernization Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ WMCP-1B: Security-Critical Frontend Baseline               │
│ - Upgrade next: 16.2.7 -> 16.3.3 (LOCKED)                   │
│ - Upgrade @next/eslint-plugin-next: 16.2.7 -> 16.3.3 (LOCKED)│
│ - Align react & react-dom: 19.2.7 -> 19.2.8 (LOCKED)        │
│ - Verify build, type-check, lint, and standalone output     │
├─────────────────────────────────────────────────────────────┤
│ WMCP-1C: Runtime & Rust Toolchain Normalization             │
│ - Target Node 24.19.0 LTS for CI and Docker (CANDIDATE)     │
│ - Pin Rust toolchain to 1.98.0 via rust-toolchain.toml      │
│ - Modernize .clippy.toml (remove vec-init-len-threshold)    │
├─────────────────────────────────────────────────────────────┤
│ WMCP-1D: Frontend Tooling Modernization                     │
│ - Evaluate TypeScript 6.0.3 (CANDIDATE)                     │
│ - Evaluate Playwright 1.62.1 (CANDIDATE)                    │
│ - Defer ESLint 10.x major migration (DEFERRED)              │
├─────────────────────────────────────────────────────────────┤
│ WMCP-1R: Platform Modernization Closure                     │
│ - Full regression verification & closure audit              │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. Non-Goals

- Running blanket `npm update` or `npx npm-check-updates -u`.
- Adopting experimental/canary releases (Next.js 16.4-canary, React 19.3-canary, Node 26 Current).
- Modifying WMCP-0B architecture invariants or state machine contracts.
- Rewriting working build or deployment scripts outside specified modernization scopes.

---

## 17. Locked Truths

1. Next.js 16.3.3 was released 25 August 2026 as an emergency security release addressing two Critical CVEs.
2. Next.js 16.2.7 is affected by official security advisories and cannot be retained for final challenge submission.
3. Next.js target is **LOCKED** at `16.3.3`.
4. `@next/eslint-plugin-next` target is **LOCKED** at `16.3.3`.
5. React / React DOM targets are **LOCKED** at `19.2.8` for alignment with Next 16.3.3.
6. Node 26 is **REJECTED** for challenge critical path.

---

## 18. Unknown / Unverified Items

- **Live Exploitability of Next.js CVEs in This Repository:** Classified as `UNVERIFIED` under WMCP-0B evidence rules (package version is affected; live reachability is unverified).
- **ESLint 10 Flat Config Compatibility:** Classified as `UNVERIFIED` until tested in WMCP-1D.

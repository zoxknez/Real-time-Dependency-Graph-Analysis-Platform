# WebMCP Challenge - Platform Version Matrix

This document provides the exhaustive platform version matrix for repository components, runtime environments, and CI services as of 2026-08-26.

---

| Area | Component | Repository Declaration / Config | Lockfile Resolved | CI / Runtime Value | Current Upstream Stable / LTS | Support State | Upgrade Classification | Proposed Target | Target Status | Implementation Phase | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Frontend Framework | Next.js | `16.2.7` | `16.2.7` | N/A | `16.3.3` | Active LTS (Patched) | `SECURITY_MANDATORY` | `16.3.3` | `LOCKED` | WMCP-1B | GHSA-2xp9-vwfh-vxw4, CVE-2026-75604 |
| UI Library | React | `^19.2.5` | `19.2.7` | N/A | `19.2.8` | Current Stable | `RECOMMENDED_PATCH` | `19.2.8` | `CANDIDATE` | WMCP-1B | npm registry, low-risk patch |
| UI Library | React DOM | `^19.2.5` | `19.2.7` | N/A | `19.2.8` | Current Stable | `RECOMMENDED_PATCH` | `19.2.8` | `CANDIDATE` | WMCP-1B | npm registry, low-risk patch |
| Frontend Linter | @next/eslint-plugin-next | `16.2.7` | `16.2.7` | N/A | `16.3.3` | Current Stable | `VERSION_ALIGNMENT_REQUIRED` | `16.3.3` | `LOCKED` | WMCP-1B | Next.js version alignment |
| CSS Processing | PostCSS | `8.5.15` (overrides) | `8.5.15` | N/A | `8.5.26` | Current Stable | `SECURITY_MANDATORY` | `8.5.26` | `LOCKED` | WMCP-1B | GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp |
| Image Processing | Sharp | Transitive dependency | `0.34.5` | N/A | `0.35.3` | Current Stable | `SECURITY_MANDATORY` | `0.35.3` | `LOCKED` | WMCP-1B | GHSA-f88m-g3jw-g9cj |
| Runtime Environment | Node.js (CI) | `node-version: '22'` | N/A | `22.x` | `24.19.0` (LTS) / `22.23.2` (LTS) | Active LTS | `PLATFORM_MODERNIZATION` | `24.19.0` | `CANDIDATE` | WMCP-1C | Node.js official release schedule |
| Runtime Environment | Node.js (Docker) | `node:22-alpine` | N/A | `22-alpine` | `node:24.19.0-alpine` | Active LTS | `PLATFORM_MODERNIZATION` | `24.19.0-alpine` | `CANDIDATE` | WMCP-1C | DockerHub official node images |
| Language (Frontend) | TypeScript | `^5.8.0` | `5.9.3` | N/A | `6.0.3` | Current Stable | `TOOLING_MODERNIZATION` | `6.0.3` | `CANDIDATE` | WMCP-1D | TypeScript release notes |
| Frontend Linter | ESLint | `^9.17.0` | `9.39.2` | N/A | `10.9.0` | Latest Stable / 9.x LTS | `DEFER_DUE_TO_RISK` | `9.39.2` | `DEFERRED` | Post-WMCP-1 | ESLint ecosystem compatibility |
| Frontend Linter | typescript-eslint | `^8.18.2` | `8.51.0` | N/A | `8.54.0` | Current Stable | `TOOLING_MODERNIZATION` | `8.54.0` | `CANDIDATE` | WMCP-1D | ESLint 9 plugin compatibility |
| Frontend Linter | eslint-plugin-react | `^7.37.2` | `7.37.4` | N/A | `7.37.4` | Current Stable | `KEEP_CURRENT` | `7.37.4` | `LOCKED` | N/A | Lockfile inspection |
| Frontend Linter | eslint-plugin-react-hooks | `^5.1.0` | `5.1.0` | N/A | `5.1.0` | Current Stable | `KEEP_CURRENT` | `5.1.0` | `LOCKED` | N/A | Lockfile inspection |
| Testing | @playwright/test | `^1.59.1` | `1.60.0` | N/A | `1.62.1` | Current Stable | `TOOLING_MODERNIZATION` | `1.62.1` | `CANDIDATE` | WMCP-1D | Playwright release notes |
| GraphQL Client | @apollo/client | `^4.1.7` | `4.2.0` | N/A | `4.2.0` | Current Stable | `KEEP_CURRENT` | `4.2.0` | `LOCKED` | N/A | Lockfile inspection |
| GraphQL Core | graphql | `^16.10.0` | `16.12.0` | N/A | `16.12.0` | Current Stable | `KEEP_CURRENT` | `16.12.0` | `LOCKED` | N/A | Lockfile inspection |
| State Store | Zustand | `^5.0.12` | `5.0.14` | N/A | `5.0.14` | Current Stable | `KEEP_CURRENT` | `5.0.14` | `LOCKED` | N/A | Lockfile inspection |
| Visualization | Three.js | `^0.182.0` | `0.182.0` | N/A | `0.182.0` | Current Stable | `KEEP_CURRENT` | `0.182.0` | `LOCKED` | N/A | Lockfile inspection |
| Visualization | react-force-graph-2d | `^1.26.1` | `1.26.1` | N/A | `1.26.1` | Current Stable | `KEEP_CURRENT` | `1.26.1` | `LOCKED` | N/A | Lockfile inspection |
| Visualization | react-force-graph-3d | `^1.29.0` | `1.29.0` | N/A | `1.29.0` | Current Stable | `KEEP_CURRENT` | `1.29.0` | `LOCKED` | N/A | Lockfile inspection |
| CSS Framework | Tailwind CSS | `^3.4.17` | `3.4.19` | N/A | `3.4.19` | Current v3 Stable | `KEEP_CURRENT` | `3.4.19` | `LOCKED` | N/A | Lockfile inspection |
| Rust Toolchain | Rust Compiler | unpinned | N/A | `stable` (1.98.0) | `1.98.0` | Current Stable (2026-08-20) | `PLATFORM_MODERNIZATION` | `1.98.0` | `CANDIDATE` | WMCP-1C | Rust release announcement |
| Rust Workspace | Rust Edition | `edition = "2024"` | N/A | `2024` | `2024` | Current Edition | `KEEP_CURRENT` | `2024` | `LOCKED` | N/A | Cargo.toml inspection |
| Cargo Resolver | Workspace Resolver | `resolver = "2"` | N/A | `2` | `2` / `3` | Supported | `KEEP_CURRENT` | `2` | `LOCKED` | N/A | Cargo.toml inspection |
| Rust Linter | Clippy Config | `vec-init-len-threshold = 10` | N/A | `.clippy.toml` | N/A (removed key) | Incompatible Key | `PLATFORM_MODERNIZATION` | Modernized config | `LOCKED` | WMCP-1C | Baseline diagnostic evidence |
| Protobuf | protoc | `PROTOC_VERSION: "29.3"` | N/A | `29.3` | `29.3` | Supported | `KEEP_CURRENT` | `29.3` | `LOCKED` | N/A | CI workflow inspection |
| CI Service | Memgraph | `memgraph/memgraph:3.9.0` | N/A | `3.9.0` | `3.9.0` | Supported | `KEEP_CURRENT` | `3.9.0` | `LOCKED` | N/A | CI workflow inspection |
| CI Service | Redis | `redis:8.6.0-alpine` | N/A | `8.6.0-alpine` | `8.6.0-alpine` | Supported | `KEEP_CURRENT` | `8.6.0-alpine` | `LOCKED` | N/A | CI workflow inspection |
| CI Service | Qdrant | `qdrant/qdrant:v1.17.0` | N/A | `v1.17.0` | `v1.17.0` | Supported | `KEEP_CURRENT` | `v1.17.0` | `LOCKED` | N/A | CI workflow inspection |

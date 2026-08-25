# WebMCP Challenge - Security Advisory Matrix

This document records the active security advisories evaluated against repository dependencies during the research freeze on 2026-08-26.

---

## 1. Primary Next.js Security Advisories (August 2026 Release)

On 25 August 2026, Next.js published an emergency security release (`16.3.3` Active LTS / `15.5.24` Maintenance LTS) addressing two Critical severity vulnerabilities:

| Advisory Identifier | Component | Severity | Affected Version Range | Patched Version | Repository Declared Version | Package Affected by Version? | Application Exploitability Proven? | Deployment-Specific Conditions & Reachability Evidence | Required Action | Target Phase | Source Reference |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **GHSA-2xp9-vwfh-vxw4** | `next` | CRITICAL | `< 16.3.3` / `< 15.5.24` | `16.3.3` / `15.5.24` | `16.2.7` | **YES** | **UNVERIFIED** | Image Optimization API handles AVIF format. In `next.config.js`, `remotePatterns` is empty and `unoptimized` is enabled only in development. Remote untrusted image processing is not configured, but image endpoint is active. | Upgrade Next.js to 16.3.3 | WMCP-1B | Next.js Security Release, GitHub Advisory Database |
| **CVE-2026-75604 / GHSA-p293-qw3h-jr36** | `next` | CRITICAL | `< 16.3.3` / `< 15.5.24` | `16.3.3` / `15.5.24` | `16.2.7` | **YES** | **UNVERIFIED** | Windows-hosted Next.js runtime paths vulnerability. Development and local execution runs on Windows host; production Docker container runs on Alpine Linux. | Upgrade Next.js to 16.3.3 | WMCP-1B | CVE Record, Next.js Security Advisory |

---

## 2. Pre-Existing Next.js Intermediate Advisories (July 2026 Release)

The repository's baseline version (`16.2.7`) also fell within the affected range for earlier vulnerabilities resolved in `16.2.11` (and incorporated into `16.3.3`):

| Advisory Identifier | Component | Severity | Affected Version Range | Patched Version | Repository Declared Version | Package Affected by Version? | Application Exploitability Proven? | Deployment-Specific Conditions & Reachability Evidence | Required Action | Target Phase | Source Reference |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **GHSA-89xv-2m56-2m9x** | `next` | HIGH | `>= 16.0.0, < 16.2.11` | `16.2.11` / `16.3.x` | `16.2.7` | **YES** | **UNVERIFIED** | SSRF in Server Actions on custom servers. Baseline config enables experimental server actions (`bodySizeLimit: '2mb'`). | Resolved via 16.3.3 upgrade | WMCP-1B | GitHub Advisory Database |
| **GHSA-p9j2-gv94-2wf4** | `next` | HIGH | `>= 16.0.0, < 16.2.11` | `16.2.11` / `16.3.x` | `16.2.7` | **YES** | **UNVERIFIED** | SSRF in URL rewrites via attacker-controlled destination hostname. Baseline config does not declare dynamic rewrite destinations. | Resolved via 16.3.3 upgrade | WMCP-1B | GitHub Advisory Database |
| **GHSA-68g3-v927-f742** | `next` | MODERATE | `>= 16.0.0, < 16.2.11` | `16.2.11` / `16.3.x` | `16.2.7` | **YES** | **UNVERIFIED** | Cache confusion of response bodies for requests with bodies. Cache components not enabled. | Resolved via 16.3.3 upgrade | WMCP-1B | GitHub Advisory Database |
| **GHSA-4633-3j49-mh5q** | `next` | MODERATE | `>= 16.0.0, < 16.2.11` | `16.2.11` / `16.3.x` | `16.2.7` | **YES** | **UNVERIFIED** | Cache confusion with invalid UTF-8 byte sequences. | Resolved via 16.3.3 upgrade | WMCP-1B | GitHub Advisory Database |
| **GHSA-4c39-4ccg-62r3** | `next` | MODERATE | `>= 16.0.0, < 16.2.11` | `16.2.11` / `16.3.x` | `16.2.7` | **YES** | **UNVERIFIED** | Unbounded Server Action payload in Edge runtime. Repository uses Node.js standalone runtime, not Edge runtime. | Resolved via 16.3.3 upgrade | WMCP-1B | GitHub Advisory Database |
| **GHSA-q8wf-6r8g-63ch** | `next` | MODERATE | `>= 16.0.0, < 16.2.11` | `16.2.11` / `16.3.x` | `16.2.7` | **YES** | **UNVERIFIED** | Denial of Service in Image Optimization API using SVGs. | Resolved via 16.3.3 upgrade | WMCP-1B | GitHub Advisory Database |
| **GHSA-955p-x3mx-jcvp** | `next` | MODERATE | `>= 16.0.0, < 16.2.11` | `16.2.11` / `16.3.x` | `16.2.7` | **YES** | **UNVERIFIED** | Unauthenticated disclosure of internal Server Function endpoints. | Resolved via 16.3.3 upgrade | WMCP-1B | GitHub Advisory Database |

---

## 3. Frontend Tooling & Subdependency Advisories

| Advisory Identifier | Component | Severity | Affected Version Range | Patched Version | Repository Declared / Resolved Version | Package Affected by Version? | Application Exploitability Proven? | Deployment-Specific Conditions & Reachability Evidence | Required Action | Target Phase | Source Reference |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **GHSA-r28c-9q8g-f849** | `postcss` | HIGH | `<= 8.5.17` | `>= 8.5.18` | `8.5.15` (overrides) | **YES** | **UNVERIFIED** | Path Traversal in source map auto-loading when `from` is unset during CSS build processing. | Update `postcss` override to 8.5.26 | WMCP-1B | GitHub Advisory Database |
| **GHSA-fxqj-rqcc-2cmp** | `postcss` | MODERATE | `<= 8.5.22` | `>= 8.5.23` | `8.5.15` (overrides) | **YES** | **UNVERIFIED** | Incomplete fix for arbitrary source map file reading during build. Note: PostCSS 8.5.22 remains affected. | Update `postcss` override to 8.5.26 | WMCP-1B | GitHub Advisory Database |
| **GHSA-f88m-g3jw-g9cj** | `sharp` | HIGH | `< 0.35.0` | `>= 0.35.0` | `0.34.5` (resolved) | **YES** | **UNVERIFIED** | Subdependency inherited vulnerability in libvips. Lockfile resolves 0.34.5. | Remediate to sharp 0.35.3 in WMCP-1B (inspect dependency tree and apply override if needed) | WMCP-1B | GitHub Advisory Database |

---

## 4. Empirical Evidence Rule Compliance

In strict compliance with WMCP-0B Evidence Boundary (WMCP-INV-018):
- The presence of a package version in an advisory range is recorded as **PACKAGE AFFECTED: YES**.
- Exploitability in this specific application deployment is recorded as **EXPLOITABILITY: UNVERIFIED** unless concrete proof of reachability is demonstrated.
- Regardless of reachability, all security-affected components are assigned to mandatory remediation phases.

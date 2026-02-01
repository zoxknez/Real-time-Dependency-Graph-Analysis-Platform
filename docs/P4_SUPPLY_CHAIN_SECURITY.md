# P4: Supply Chain Security Implementation

## Overview

This document describes the enterprise-grade supply chain security features implemented following official industry standards and specifications.

## Standards Implemented

### 1. OpenSSF Scorecard (v5.4.0)
**Source:** [scorecard.dev](https://scorecard.dev)

Automated security checks for open source projects. Implements all 18 official checks:

#### Holistic Security (9 checks)
| Check | Risk | Description |
|-------|------|-------------|
| CI-Tests | Low | Tests run in CI before code merged |
| Vulnerabilities | High | No unfixed vulnerabilities in OSV database |
| Fuzzing | Medium | Project uses fuzzing (OSS-Fuzz/ClusterFuzzLite) |
| SAST | Medium | Static analysis tools configured |
| Security-Policy | Medium | SECURITY.md with disclosure process |
| Maintained | High | Active development in past 90 days |
| License | Low | License file present (OSI-approved preferred) |
| CII-Best-Practices | Low | CII Best Practices badge level |
| Dependency-Update-Tool | High | Automated dependency updates (Dependabot/Renovate) |

#### Source Risk (6 checks)
| Check | Risk | Description |
|-------|------|-------------|
| Binary-Artifacts | High | No binary artifacts in repository |
| Branch-Protection | High | Default branch protection enabled |
| Code-Review | High | All changes require code review |
| Contributors | Low | Multiple organizations contributing |
| Dangerous-Workflow | Critical | No dangerous workflow patterns |
| Webhooks | High | Webhooks secured with tokens |

#### Build Risk (4 checks)
| Check | Risk | Description |
|-------|------|-------------|
| Pinned-Dependencies | Medium | Dependencies pinned to hashes |
| Token-Permissions | High | Minimal token permissions |
| Packaging | Medium | Packages built/published from CI |
| Signed-Releases | High | Releases cryptographically signed |

**Component:** `OpenSSFScorecardPanel`
**File:** [openssf-scorecard.tsx](../apps/frontend/src/components/security/openssf-scorecard.tsx)

---

### 2. OSV Schema (v1.7.5)
**Source:** [ossf.github.io/osv-schema](https://ossf.github.io/osv-schema/)

Open Source Vulnerability format for cross-ecosystem vulnerability tracking.

#### Supported Features
- **ID Prefixes:** CVE, GHSA, PYSEC, RUSTSEC, GO, DSA, DLA
- **Severity Types:** CVSS_V2, CVSS_V3, CVSS_V4
- **Range Types:** SEMVER, ECOSYSTEM, GIT
- **Reference Types:** ADVISORY, FIX, REPORT, ARTICLE, WEB, PACKAGE, EVIDENCE, DETECTION, INTRODUCED

#### Schema Structure
```typescript
interface OSVVulnerability {
  schema_version: string;        // "1.7.5"
  id: string;                    // "GHSA-xxxx-yyyy-zzzz"
  modified: string;              // ISO 8601 timestamp
  published?: string;
  withdrawn?: string;
  aliases?: string[];            // ["CVE-2024-1234"]
  related?: string[];
  summary?: string;
  details?: string;
  severity?: OSVSeverity[];
  affected: OSVAffected[];
  references?: OSVReference[];
  credits?: OSVCredit[];
}
```

**Component:** `OSVVulnerabilityList`
**File:** [osv-vulnerability.tsx](../apps/frontend/src/components/security/osv-vulnerability.tsx)

---

### 3. SLSA v1.0
**Source:** [slsa.dev/spec/v1.0](https://slsa.dev/spec/v1.0/requirements)

Supply-chain Levels for Software Artifacts - build integrity framework.

#### Build Levels

| Level | Name | Description |
|-------|------|-------------|
| L0 | No Guarantees | No SLSA requirements met |
| L1 | Provenance Exists | Documentation of build process |
| L2 | Hosted Build | Build runs on hosted platform |
| L3 | Hardened Builds | Prevents unauthorized modification |

#### Requirements by Level

**L1 Requirements:**
- `provenance-exists`: Build outputs provenance

**L2 Requirements (includes L1):**
- `hosted-build`: Builds run on hosted platform
- `provenance-authentic`: Consumers can verify authenticity
- `provenance-signed`: Provenance cryptographically signed

**L3 Requirements (includes L2):**
- `build-service`: Build runs as service, not user-triggered
- `isolated-builds`: Build environment isolated
- `unforgeable-provenance`: Provenance cannot be forged
- `hermetic-builds`: No network access during build
- `reproducible-builds`: Builds are reproducible

#### Requirement Categories
1. **Producer** - Requirements for software producers
2. **Build Platform** - Requirements for build systems
3. **Provenance** - Requirements for build provenance

**Component:** `SlsaAssessmentPanel`
**File:** [slsa-enhanced.tsx](../apps/frontend/src/components/security/slsa-enhanced.tsx)

---

### 4. CycloneDX 1.5
**Source:** [cyclonedx.org](https://cyclonedx.org)

SBOM (Software Bill of Materials) format.

#### Key Features
- Component inventory with PURL identifiers
- Dependency tree tracking
- License information
- VEX (Vulnerability Exploitability Exchange) support
- Digital signatures

**Integration:** See [sbom/page.tsx](../apps/frontend/src/app/sbom/page.tsx)

---

## Architecture

### Component Hierarchy

```
SupplyChainSecurityPage
├── OverviewDashboard
│   ├── SecurityMetricCard (4x)
│   ├── ScorecardWidget
│   ├── OSVSummaryWidget
│   ├── SlsaWidget
│   └── ComplianceCard (4x)
├── ScorecardView
│   └── OpenSSFScorecardPanel
│       ├── ScorecardBadge
│       ├── CategorySummary (3x)
│       └── ScorecardCheckCard (18x)
├── VulnerabilitiesView
│   └── OSVVulnerabilityList
│       └── OSVVulnerabilityCard (n)
├── SlsaView
│   └── SlsaAssessmentPanel
│       ├── SlsaLevelTracker
│       └── RequirementsChecklist
│           └── RequirementCard (11x)
└── SbomView
    └── Link to /sbom
```

### Import Path

```typescript
// Import from barrel export
import {
  OpenSSFScorecardPanel,
  OSVVulnerabilityList,
  SlsaAssessmentPanel,
  type ScorecardResult,
  type OSVVulnerability,
  type SlsaAssessment,
} from "@/components/security";
```

---

## API Integration

### Scorecard API
```bash
# Run scorecard check
scorecard --repo=github.com/owner/repo --format=json
```

Expected response format matches `ScorecardResult` type.

### OSV API
```bash
# Query OSV database
curl -X POST https://api.osv.dev/v1/query \
  -d '{"package": {"ecosystem": "npm", "name": "lodash"}}'
```

### SLSA Verification
```bash
# Verify SLSA provenance
slsa-verifier verify-artifact \
  --provenance-path provenance.json \
  --source-uri github.com/owner/repo \
  artifact.tar.gz
```

---

## Testing

### Unit Tests
```typescript
describe("OpenSSFScorecard", () => {
  it("calculates weighted score correctly", () => {
    // Critical checks weighted 10x
    // High checks weighted 7.5x
    // Medium checks weighted 5x
    // Low checks weighted 2.5x
  });
});
```

### E2E Tests
```typescript
test("supply chain security page loads", async ({ page }) => {
  await page.goto("/supply-chain");
  await expect(page.getByText("OpenSSF Score")).toBeVisible();
  await expect(page.getByText("SLSA Level")).toBeVisible();
});
```

---

## Roadmap

### Phase 1 (Complete)
- [x] OpenSSF Scorecard integration
- [x] OSV vulnerability display
- [x] SLSA requirements tracking
- [x] Unified dashboard

### Phase 2 (Planned)
- [ ] Real-time scorecard updates via webhook
- [ ] Automated SLSA provenance verification
- [ ] SBOM diff comparison
- [ ] VEX automation

### Phase 3 (Future)
- [ ] Sigstore integration
- [ ] In-toto attestation
- [ ] GUAC integration
- [ ] Policy-as-code (OPA)

---

## References

1. [OpenSSF Scorecard Documentation](https://scorecard.dev)
2. [OSV Schema Specification](https://ossf.github.io/osv-schema/)
3. [SLSA v1.0 Specification](https://slsa.dev/spec/v1.0/)
4. [CycloneDX Specification](https://cyclonedx.org/specification/)
5. [Sigstore](https://sigstore.dev)
6. [In-toto](https://in-toto.io)
7. [GUAC](https://guac.sh)

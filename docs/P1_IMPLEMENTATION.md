# P1 Feature Implementation

This document covers the P1 enterprise features implemented for the dependency graph platform.

## Overview

P1 features focus on compliance, security visibility, and visualization:

| Feature | Status | Description |
|---------|--------|-------------|
| SBOM Generation | ✅ Complete | SPDX 2.3 & CycloneDX 1.5 |
| OpenSSF Scorecard | ✅ Complete | 19 security checks |
| License Compliance | ✅ Complete | SPDX expression parsing |
| Graph Visualization | ✅ Complete | D3.js force-directed |

---

## 1. SBOM Generation

### Standards Compliance

We support two industry-standard SBOM formats:

- **SPDX 2.3** (ISO/IEC 5962:2021) - International standard for software package data exchange
- **CycloneDX 1.5** (OWASP) - Lightweight SBOM standard focused on security

### API Usage

```graphql
query GenerateSbom($packageId: ID!, $options: SbomGenerationOptions!) {
  generateSbom(packageId: $packageId, options: $options) {
    format            # SPDX | CYCLONE_DX
    encoding          # JSON | XML
    content           # Full SBOM content
    componentCount    # Number of components
    vulnerabilityCount
    generatedAt
    downloadUrl
  }
}

input SbomGenerationOptions {
  format: SbomFormat!
  encoding: SbomEncoding
  includeVulnerabilities: Boolean
  includeTransitive: Boolean
  specVersion: String
}
```

### React Hook

```typescript
import { useGenerateSbom, useSbom } from "@/lib/hooks";

// On-demand generation
const { sbom, generate, download, loading } = useGenerateSbom(packageId);

// Generate SPDX
await generate({ format: "SPDX", encoding: "JSON" });

// Generate CycloneDX
await generate({ format: "CYCLONE_DX", encoding: "XML" });

// Download the generated SBOM
download();
```

### Component

```tsx
import { SbomExportButton } from "@/components/ui";

<SbomExportButton
  packageId="pkg123"
  onExport={(sbom) => console.log(sbom)}
/>
```

---

## 2. OpenSSF Scorecard

### Security Checks

We implement all 19 OpenSSF Scorecard checks:

| Check | Category | Weight | Description |
|-------|----------|--------|-------------|
| Vulnerabilities | Holistic | 10.0 | Known vulnerabilities |
| Dangerous-Workflow | Build | 10.0 | Dangerous CI patterns |
| Binary-Artifacts | Build | 10.0 | Binary files in source |
| Branch-Protection | Source | 7.5 | Branch protection rules |
| Code-Review | Source | 7.5 | PR review requirements |
| Token-Permissions | Build | 7.5 | Least-privilege tokens |
| Pinned-Dependencies | Build | 7.5 | Pinned dependency versions |
| Maintained | Source | 7.5 | Active maintenance |
| SAST | Build | 5.0 | Static analysis tools |
| Security-Policy | Holistic | 5.0 | SECURITY.md file |
| Signed-Releases | Build | 5.0 | Cryptographic signatures |
| Dependency-Update-Tool | Build | 5.0 | Dependabot/Renovate |
| CI-Tests | Build | 5.0 | CI test configuration |
| License | Holistic | 5.0 | Valid OSS license |
| Fuzzing | Build | 2.5 | Fuzz testing |
| CII-Best-Practices | Holistic | 2.5 | CII badge |
| Contributors | Source | 2.5 | Diverse contributors |
| Packaging | Build | 2.5 | Published packages |
| Webhooks | Build | 2.5 | Webhook configuration |

### Risk Categories

Checks are grouped by risk category:
- **Holistic Security** - Overall project security posture
- **Source Risk** - Source code and development practices
- **Build Risk** - CI/CD and build process security

### API Usage

```graphql
query GetScorecard($target: String!) {
  scorecard(target: $target) {
    target
    aggregateScore      # Weighted 0-10 score
    checks {
      check             # VULNERABILITIES, MAINTAINED, etc.
      name              # Human-readable name
      score             # 0-10
      reason
      details
      riskCategory      # HOLISTIC_SECURITY | SOURCE_RISK | BUILD_RISK
      riskLevel         # CRITICAL | HIGH | MEDIUM | LOW
    }
    holisticSecurity { ... }
    sourceRisk { ... }
    buildRisk { ... }
    failedChecks { ... }
    criticalFindingsCount
    scorecardVersion
    generatedAt
  }
}

# Quick summary for lists
query GetScorecardSummary($target: String!) {
  scorecardSummary(target: $target) {
    target
    aggregateScore
    riskLevel
    passedChecks
    failedChecks
    criticalIssues
  }
}
```

### React Hook

```typescript
import { useScorecard, useScorecardSummary, getGradeInfo } from "@/lib/hooks";

// Full scorecard
const { 
  scorecard, 
  loading, 
  passingChecks, 
  failingChecks, 
  gradeLabel,    // "A+", "B", etc.
  gradeColor 
} = useScorecard("github.com/owner/repo");

// Summary for lists
const { summary } = useScorecardSummary("github.com/owner/repo");
```

### Components

```tsx
import { 
  ScorecardBadge, 
  ScorecardDisplay, 
  ScorecardWidget 
} from "@/components/ui";

// Compact badge
<ScorecardBadge score={8.5} riskLevel="LOW" />

// Full display with all categories
<ScorecardDisplay scorecard={scorecard} />

// Dashboard widget
<ScorecardWidget target="github.com/owner/repo" />
```

---

## 3. License Compliance

### SPDX Expression Parsing

We support full SPDX license expression syntax:

```
MIT                          # Simple license
Apache-2.0 OR MIT            # Dual-licensed (choice)
GPL-2.0-only WITH Classpath  # License with exception
(MIT AND Apache-2.0)         # Both licenses apply
```

### License Categories

| Category | Copyleft | Examples |
|----------|----------|----------|
| Permissive | None | MIT, Apache-2.0, BSD-3-Clause |
| Weak Copyleft | Weak | LGPL-3.0, MPL-2.0 |
| Strong Copyleft | Strong | GPL-2.0, GPL-3.0 |
| Network Copyleft | Network | AGPL-3.0 |
| Public Domain | None | Unlicense, 0BSD |

### Policy Presets

| Preset | Description |
|--------|-------------|
| `DEFAULT` | OSI-approved licenses, warn on copyleft |
| `PERMISSIVE_ONLY` | Only MIT, Apache-2.0, BSD, ISC, etc. |
| `ENTERPRISE` | No AGPL, no GPL-3.0+, no viral licenses |

### API Usage

```graphql
# Get license info
query GetLicenseInfo($licenseId: String!) {
  licenseInfo(licenseId: $licenseId) {
    id
    name
    osiApproved
    fsfLibre
    copyleft         # NONE | WEAK | STRONG | NETWORK
    category         # PERMISSIVE | COPYLEFT | PROPRIETARY | PUBLIC_DOMAIN | UNKNOWN
    referenceUrl
    deprecated
  }
}

# Validate expression against policy
query ValidateLicense(
  $licenseExpression: String!
  $policy: LicensePolicyPreset
) {
  validateLicense(licenseExpression: $licenseExpression, policy: $policy) {
    compliant
    policyName
    detectedLicense
    violations {
      violationType
      licenseId
      reason
      severity
    }
    warnings
  }
}

# Scan all dependencies
query ScanLicenses($packageId: ID!, $policy: LicensePolicyPreset) {
  scanLicenses(packageId: $packageId, policy: $policy) {
    totalPackages
    licensesDetected
    copyleftCount
    permissiveCount
    unknownCount
    complianceStatus
    violations { ... }
  }
}
```

### React Hooks

```typescript
import { 
  useLicenseInfo, 
  useValidateLicense, 
  useLicenseScan,
  useLicensePolicy 
} from "@/lib/hooks";

// Get license info
const { license } = useLicenseInfo("MIT");

// Validate expression
const { validate, result, isCompliant } = useValidateLicense();
await validate("GPL-3.0-only", "ENTERPRISE");

// Scan dependencies
const { scan, summary, hasCopyleft, hasUnknown } = useLicenseScan();
await scan(packageId, "PERMISSIVE_ONLY");

// Manage policy state
const { policy, setPolicy, allowedLicenses, deniedLicenses } = useLicensePolicy();
```

### Components

```tsx
import { 
  LicenseBadge, 
  LicenseExpression, 
  ComplianceStatus, 
  ViolationList,
  LicenseScanSummary,
  PolicySelector 
} from "@/components/ui";

// License badge with copyleft indicator
<LicenseBadge 
  licenseId="MIT" 
  category="PERMISSIVE" 
  copyleft="NONE" 
  osiApproved 
/>

// Rendered license expression
<LicenseExpression expression="Apache-2.0 OR MIT" />

// Compliance status indicator
<ComplianceStatus 
  compliant={true} 
  policyName="enterprise" 
  violationCount={0} 
/>

// List of policy violations
<ViolationList violations={violations} />

// Complete scan summary
<LicenseScanSummary summary={summary} />

// Policy selector dropdown
<PolicySelector 
  value={policy} 
  onChange={setPolicy} 
/>
```

---

## 4. Graph Visualization

### D3.js Force-Directed Graph

Interactive visualization with:
- Force-directed layout
- Zoom and pan (mouse wheel + drag)
- Node dragging
- Click and hover events
- Color by ecosystem or vulnerability
- Highlighted dependency paths
- Responsive sizing

### Component Usage

```tsx
import { 
  DependencyGraph, 
  GraphControls, 
  GraphLegend 
} from "@/components/graph/dependency-graph";

const graphData = {
  nodes: [
    { id: "1", name: "lodash", ecosystem: "NPM", depth: 0, isRoot: true },
    { id: "2", name: "express", ecosystem: "NPM", depth: 1, hasVulnerabilities: true, vulnerabilityCount: 2, riskLevel: "HIGH" },
    // ...
  ],
  links: [
    { source: "1", target: "2", type: "direct" },
    { source: "2", target: "3", type: "transitive" },
    // ...
  ]
};

<div className="h-[600px]">
  <GraphControls 
    showLabels={showLabels}
    onShowLabelsChange={setShowLabels}
    showVulnerabilities={showVulns}
    onShowVulnerabilitiesChange={setShowVulns}
    colorByEcosystem={colorByEco}
    onColorByEcosystemChange={setColorByEco}
  />
  
  <DependencyGraph
    data={graphData}
    onNodeClick={(node) => navigateToPackage(node.id)}
    onNodeHover={(node) => setTooltip(node)}
    selectedNodeId={selectedId}
    highlightPath={pathNodes}
    showLabels={showLabels}
    showVulnerabilities={showVulns}
    colorByEcosystem={colorByEco}
  />
  
  <GraphLegend />
</div>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `GraphData` | required | Nodes and links |
| `width` | `number` | 800 | SVG width |
| `height` | `number` | 600 | SVG height |
| `onNodeClick` | `(node) => void` | - | Click handler |
| `onNodeHover` | `(node) => void` | - | Hover handler |
| `selectedNodeId` | `string` | - | Highlight node |
| `highlightPath` | `string[]` | - | Path to highlight |
| `showLabels` | `boolean` | true | Show node labels |
| `showVulnerabilities` | `boolean` | true | Color by vuln risk |
| `colorByEcosystem` | `boolean` | true | Color by ecosystem |
| `enableZoom` | `boolean` | true | Enable zoom/pan |
| `enableDrag` | `boolean` | true | Enable node drag |

---

## File Structure

```
packages/models/src/
├── sbom.rs           # SPDX 2.3 + CycloneDX 1.5 types and generator
├── scorecard.rs      # OpenSSF Scorecard 19 checks
├── license.rs        # SPDX expression parser + policy engine
└── lib.rs            # Module exports

apps/api/src/gql/
├── types.rs          # GraphQL types for all P1 features
└── query.rs          # Resolvers: generateSbom, scorecard, validateLicense, etc.

apps/frontend/src/
├── lib/graphql/
│   ├── queries.ts    # GENERATE_SBOM, GET_SCORECARD, VALIDATE_LICENSE, etc.
│   └── types.ts      # TypeScript types for P1
├── lib/hooks/
│   ├── use-sbom.ts       # useGenerateSbom, useSbom
│   ├── use-scorecard.ts  # useScorecard, useScorecardSummary
│   └── use-license.ts    # useLicenseInfo, useValidateLicense, useLicenseScan
└── components/
    ├── ui/
    │   ├── sbom-export.tsx        # SBOM export button
    │   ├── scorecard.tsx          # Scorecard display components
    │   └── license-compliance.tsx # License compliance components
    └── graph/
        └── dependency-graph.tsx   # D3.js visualization
```

---

## Testing

### Backend Tests

```bash
cargo test -p models -- sbom
cargo test -p models -- scorecard
cargo test -p models -- license
```

### Frontend Tests

```bash
cd apps/frontend
npm test -- --grep "sbom|scorecard|license"
```

### E2E Tests

```bash
cd apps/frontend
npx playwright test e2e/p1-features.spec.ts
```

---

## Configuration

### Environment Variables

```bash
# SBOM settings
SBOM_INCLUDE_TRANSITIVE=true
SBOM_DEFAULT_FORMAT=spdx

# Scorecard API
OSSF_SCORECARD_API_URL=https://api.securityscorecards.dev

# License database
SPDX_LICENSE_LIST_VERSION=3.22
```

### Policy Configuration

Create `license-policy.json`:

```json
{
  "name": "my-enterprise-policy",
  "allowed": ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"],
  "denied": ["AGPL-3.0-only", "GPL-3.0-only"],
  "allowCopyleft": false,
  "allowNetworkCopyleft": false,
  "requireOsiApproved": true
}
```

---

## Future Improvements

### P2 Roadmap

- [ ] SBOM diffing between versions
- [ ] Scorecard trending over time
- [ ] License compatibility matrix
- [ ] Graph clustering for large dependencies
- [ ] VEX (Vulnerability Exploitability eXchange) integration
- [ ] SLSA provenance verification

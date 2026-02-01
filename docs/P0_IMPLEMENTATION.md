# P0 Implementation: Transitive Paths, Reachability & Risk Scoring

## Overview

This document describes the P0 hackathon features implemented based on industry best practices from:
- **Semgrep Supply Chain** - Reachability analysis
- **GitHub Dependency Graph** - Transitive path visualization
- **VulnCheck NVD2** - Exploit signals (EPSS, KEV, public exploits)
- **OX Security** - Context-aware risk prioritization
- **Jit.io Context Engine** - Multi-factor scoring

## Features Implemented

### 1. Transitive Dependency Tracking (GitHub-style)

#### Backend Components
- **Rust Models**: `packages/models/src/vulnerability.rs`
  - `DependencyRelationship` enum (DIRECT | TRANSITIVE)
  - Full transitive path tracking

- **GraphQL Types**: `apps/api/src/gql/types.rs`
  - `DependencyRelationship` enum
  - `DependencyEdgeExtended` with `introduced_by` field
  - `TransitivePath` for path visualization

- **Cypher Queries**: `apps/api/src/graph/queries.rs`
  - `transitive_paths()` - Find shortest paths between packages
  - `introduced_by()` - Which direct deps bring in a transitive
  - `dependencies_extended()` - Dependencies with relationship type

- **GraphQL Resolvers**: `apps/api/src/gql/query.rs`
  - `transitivePaths` - Get all paths to a target package
  - `reverseDependentsExtended` - Dependents with DIRECT/TRANSITIVE badge

#### Frontend Components
- **UI Components**: `apps/frontend/src/components/ui/`
  - `DependencyBadge` - Blue (Direct) / Purple (Transitive) badges
  - `IntroducedBy` - "via package1, package2" indicator
  - `TransitivePath` - Visual path from root to target
  - `TransitivePathsList` - Multiple paths view
  - `DependencySummary` - Overview card with counts

- **GraphQL Queries**: `apps/frontend/src/lib/graphql/queries.ts`
  - `GET_TRANSITIVE_PATHS`
  - `GET_REVERSE_DEPENDENTS_EXTENDED`

- **Hooks**: `apps/frontend/src/lib/hooks/use-vulnerabilities.ts`
  - `useTransitivePaths()`
  - `useReverseDependentsExtended()`
  - `useLazyTransitivePaths()`

---

### 2. Reachability Analysis (Semgrep-style)

#### Backend Components
- **Rust Models**: `packages/models/src/vulnerability.rs`
  - `ReachabilityStatus` enum (REACHABLE | UNREACHABLE | CONDITIONALLY_REACHABLE | NO_RULE)
  - `ReachabilityEvidence` with confidence, rule_id, call_path
  - `CallSite` for source code location

- **GraphQL Types**: `apps/api/src/gql/types.rs`
  - `ReachabilityStatus` enum
  - `ReachabilityEvidence` with full call path
  - `CallSite` with file, line, function, snippet

- **Memgraph Schema**: `infra/memgraph/schema_vulnerability.cypher`
  - `ReachabilityEvidence` node type
  - Indexes for status and confidence filtering

#### Frontend Components
- **UI Components**: `apps/frontend/src/components/ui/`
  - `ReachabilityBadge` - Status badge with tooltip
    - Red: REACHABLE
    - Green: UNREACHABLE  
    - Yellow: CONDITIONALLY_REACHABLE
    - Gray: NO_RULE
  - `ReachabilityDot` - Compact indicator for tables
  - Evidence tooltip with:
    - Confidence percentage
    - Rule ID
    - Call path visualization
    - Conditions for conditional reachability

---

### 3. Risk Scoring (OX Security + Jit.io style)

#### Score Formula
```
Total = (Reachability × 0.40) + (ExploitSignal × 0.25) + (Environment × 0.20) + (CVSS × 0.15)
```

#### Components
| Component | Weight | Description |
|-----------|--------|-------------|
| Reachability | 40% | Is vulnerable code actually called? |
| Exploit Signal | 25% | EPSS + KEV + public exploit availability |
| Environment | 20% | Production exposure, network access |
| CVSS Base | 15% | Normalized CVSS score |

#### Backend Components
- **Rust Models**: `packages/models/src/vulnerability.rs`
  - `RiskScore` struct with breakdown
  - `ScoreBreakdown` with all 4 components
  - `RiskScore::calculate()` method

- **GraphQL Types**: `apps/api/src/gql/types.rs`
  - `RiskScore` with total and breakdown
  - `ScoreBreakdown` with component scores

#### Frontend Components
- **UI Components**: `apps/frontend/src/components/ui/`
  - `RiskScoreGauge` - Circular gauge with breakdown tooltip
  - `RiskScoreCompact` - Inline score badge
  - `SeverityBadge` - Color-coded severity label
  - Score coloring: Red (90+), Orange (70+), Yellow (40+), Green (<40)

---

### 4. Severity Filters (Semgrep/GitHub style)

#### Backend Components
- **GraphQL Types**: `apps/api/src/gql/types.rs`
  - `Severity` enum (CRITICAL | HIGH | MEDIUM | LOW)
  - `SeverityCounts` for filter badges
  - `VulnerabilityFilter` input type

- **GraphQL Resolvers**: `apps/api/src/gql/query.rs`
  - `vulnerabilityCounts` - Get counts by severity

#### Frontend Components
- **UI Components**: `apps/frontend/src/components/ui/`
  - `VulnerabilityFilters` - Full filter bar
    - Severity chips with counts
    - Reachability dropdown
    - Clear button
  - `SeverityFilterCompact` - Mobile-friendly dropdown

- **Hooks**: `apps/frontend/src/lib/hooks/use-vulnerabilities.ts`
  - `useVulnerabilityCounts()`
  - `useVulnerabilities()` with filter support

---

### 5. Complete Vulnerability List

#### Frontend Components
- **VulnerabilityList**: Complete list component combining all features
  - Filters (severity + reachability)
  - Sorting (risk score, severity, date)
  - Expandable cards with full details
  - Risk score breakdown
  - Reachability evidence
  - External links (NVD, GitHub Advisory)

- **VulnerabilityRow**: Compact table row for list views

- **Hooks**: 
  - `useVulnerabilityDashboard()` - Combined counts + vulnerabilities

---

## File Structure

```
packages/models/src/
└── vulnerability.rs          # Core domain models

apps/api/src/
├── gql/
│   ├── types.rs              # GraphQL type definitions
│   └── query.rs              # GraphQL resolvers
└── graph/
    └── queries.rs            # Cypher query builders

apps/frontend/src/
├── components/ui/
│   ├── dependency-badge.tsx  # Direct/Transitive badges
│   ├── reachability-badge.tsx # Reachability status
│   ├── risk-score-gauge.tsx  # Score visualization
│   ├── vulnerability-filters.tsx # Filter UI
│   ├── transitive-path.tsx   # Path visualization
│   ├── vulnerability-list.tsx # Complete list
│   └── index.ts              # Exports
└── lib/
    ├── graphql/
    │   ├── types.ts          # TypeScript types
    │   └── queries.ts        # GraphQL queries
    └── hooks/
        ├── use-vulnerabilities.ts # Data hooks
        └── index.ts

infra/memgraph/
└── schema_vulnerability.cypher # Graph schema
```

## Usage Example

```tsx
import { 
  VulnerabilityList, 
  useVulnerabilityDashboard 
} from "@/components/ui";

function PackageVulnerabilities({ packageId }: { packageId: string }) {
  const { 
    counts, 
    vulnerabilities, 
    loading, 
    error 
  } = useVulnerabilityDashboard(packageId);

  if (loading) return <Skeleton />;
  if (error) return <Error message={error.message} />;

  return (
    <VulnerabilityList
      vulnerabilities={vulnerabilities}
      counts={counts}
      onVulnerabilityClick={(vuln) => {
        // Navigate to detail view
      }}
    />
  );
}
```

## Next Steps (P1/P2)

1. **SBOM Generation** - Export SPDX/CycloneDX format
2. **Malicious Package Detection** - ML-based scoring
3. **License Compliance** - Policy-based validation
4. **Real-time Alerts** - WebSocket-based notifications
5. **Graph Visualization** - D3.js force-directed graph

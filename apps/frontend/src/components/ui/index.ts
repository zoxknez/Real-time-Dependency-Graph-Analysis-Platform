// ═══════════════════════════════════════════════════════════════
// P0 Feature Components Index
// ═══════════════════════════════════════════════════════════════
// 
// Vulnerability & Reachability UI Components
// Based on: Semgrep, GitHub, OX Security, VulnCheck best practices
//
// ═══════════════════════════════════════════════════════════════

// Dependency Relationship Badges
export { 
  DependencyBadge, 
  IntroducedBy 
} from './dependency-badge';

// Reachability Status Badges
export { 
  ReachabilityBadge, 
  ReachabilityDot 
} from './reachability-badge';
export type { ReachabilityStatus } from './reachability-badge';

// Risk Score Visualization
export { 
  RiskScoreGauge, 
  RiskScoreCompact, 
  SeverityBadge 
} from './risk-score-gauge';

// Vulnerability Filters
export { 
  VulnerabilityFilters, 
  SeverityFilterCompact 
} from './vulnerability-filters';
export type { 
  Severity, 
  ReachabilityFilter 
} from './vulnerability-filters';

// Transitive Path Visualization
export { 
  TransitivePath, 
  TransitivePathsList, 
  IntroducedByIndicator, 
  DependencySummary 
} from './transitive-path';

// Complete Vulnerability List
export { 
  VulnerabilityList, 
  VulnerabilityRow 
} from './vulnerability-list';

// ═══════════════════════════════════════════════════════════════
// P1 Feature Components
// SBOM, Scorecard, License Compliance
// ═══════════════════════════════════════════════════════════════

// SBOM Export
export {
  SbomExportButton,
  SbomExportIcon,
} from './sbom-export';

// OpenSSF Scorecard
export {
  ScorecardBadge,
  ScorecardCheckItem,
  ScorecardCategory,
  ScorecardDisplay,
  ScorecardWidget,
} from './scorecard';

// License Compliance
export {
  LicenseBadge,
  LicenseExpression,
  ComplianceStatus,
  ViolationList,
  LicenseScanSummary,
  PolicySelector,
  PackageLicenseList,
} from './license-compliance';

// ═══════════════════════════════════════════════════════════════
// P2 Feature Components
// VEX, SLSA, Policy Engine, Audit Trail, Update Recommendations
// ═══════════════════════════════════════════════════════════════

// VEX (Vulnerability Exploitability eXchange)
export {
  VexStatusBadge,
  VexJustificationBadge,
  VexExploitabilityCard,
  VexStatisticsPanel,
  VexStatusDistribution,
} from './vex-status';

// SLSA Provenance
export {
  SlsaLevelBadge,
  SlsaVerificationBadge,
  SlsaAssessmentCard,
  SlsaLevelProgress,
  ProvenanceVerificationPanel,
} from './slsa-provenance';

// Policy Compliance
export {
  PolicyResultBadge,
  PolicyCategoryBadge,
  PolicySeverityIndicator,
  PolicyEvaluationCard,
  PolicyRuleResult,
  PolicySetsList,
  ComplianceScoreGauge,
} from './policy-compliance';

// Audit Trail
export {
  AuditEventCard,
  AuditSeverityBadge,
  AuditOutcomeBadge,
  AuditEventsList,
  AuditTimeline,
  ComplianceReportCard,
  AuditFilterPanel,
} from './audit-trail';

// Update Recommendations
export {
  UpdateUrgencyBadge,
  UpdateReasonTag,
  UpdateRecommendationCard,
  UpdateRecommendationsList,
  UpdateSummaryBar,
  UpdateCommandPanel,
  BreakingChangesWarning,
  UpdateFiltersPanel,
} from './update-recommendations';

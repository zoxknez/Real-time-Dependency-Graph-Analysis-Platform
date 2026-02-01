/**
 * Security Components Barrel Export
 * 
 * Enterprise-grade security components following industry standards:
 * - OpenSSF Scorecard (scorecard.dev)
 * - OSV Vulnerability Schema (osv.dev)
 * - SLSA Provenance (slsa.dev)
 * - CycloneDX SBOM (cyclonedx.org)
 */

// OpenSSF Scorecard - 18 security checks across 3 categories
export {
  ScorecardBadge,
  RiskBadge,
  CheckScore,
  ScorecardCheckCard,
  CategorySummary,
  OpenSSFScorecardPanel,
  ScorecardWidget,
  type ScorecardCheck,
  type ScorecardResult,
  type CheckCategory,
  type ScorecardRisk,
} from "./openssf-scorecard";

// OSV Vulnerability - Schema v1.7.5 compliant
export {
  SeverityBadge,
  VulnIdBadge,
  AffectedPackage,
  ReferencesList,
  OSVVulnerabilityCard,
  OSVVulnerabilityList,
  OSVSummaryWidget,
  type OSVVulnerability,
  type OSVAffected,
  type OSVPackage,
  type OSVReference,
  type OSVSeverity,
  type OSVCredit,
} from "./osv-vulnerability";

// SLSA Enhanced - v1.0 requirements tracking
export {
  SlsaLevelBadgeEnhanced,
  RequirementCard,
  SlsaLevelTracker,
  RequirementsChecklist,
  SlsaAssessmentPanel,
  SlsaWidget,
  createSlsaRequirement,
  slsaRequirements,
  type SlsaBuildLevel,
  type RequirementCategory,
  type RequirementStatus,
  type SlsaRequirement,
  type SlsaAssessment,
} from "./slsa-enhanced";

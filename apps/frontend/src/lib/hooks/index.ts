// Export all custom hooks
export {
  useLivePackageActivity,
  useBreakingChanges,
  useLiveStats,
  useDependencyImpact,
  useWatchPackages,
  useDependencyGraphUpdates,
  useConnectionStatus,
} from "./use-subscriptions";

export type { ConnectionStatus } from "./use-subscriptions";

// P0 Features: Vulnerability & Reachability Hooks
export {
  useTransitivePaths,
  useReverseDependentsExtended,
  useVulnerabilityCounts,
  useVulnerabilities,
  useLazyTransitivePaths,
  useVulnerabilityDashboard,
} from "./use-vulnerabilities";

// P1 Features: SBOM Generation
export {
  useGenerateSbom,
  useSbom,
  getSbomFileExtension,
  getSbomMimeType,
  formatSbomContent,
} from "./use-sbom";

// P1 Features: OpenSSF Scorecard
export {
  useScorecard,
  useScorecardSummary,
  useLazyScorecard,
  getAggregateRiskLevel,
  getGradeInfo,
  getCategoryBreakdown,
  formatCategoryName,
  getRiskLevelClasses,
  getCheckDescription,
} from "./use-scorecard";

// P1 Features: License Compliance
export {
  useLicenseInfo,
  useValidateLicense,
  useLicenseScan,
  useLicensePolicy,
  getCopyleftClasses,
  getCategoryClasses,
  formatCopyleftType,
  formatCategory,
  getViolationSeverityColor,
  getPolicyDescription,
  COMMON_PERMISSIVE_LICENSES,
  COMMON_COPYLEFT_LICENSES,
} from "./use-license";

// P2 Features: VEX (Vulnerability Exploitability eXchange)
export {
  useVexExploitability,
  useVexDocument,
  useVexStatistics,
  useLazyVexExploitability,
  VexUtils,
} from "./use-vex";

// P2 Features: SLSA Provenance
export {
  useSlsaAssessment,
  useSlsaProvenance,
  useVerifyProvenance,
  useLazySlsaAssessment,
  useLazyVerifyProvenance,
  SlsaUtils,
} from "./use-slsa";

// P2 Features: Policy Engine
export {
  usePolicySets,
  useEvaluatePolicy,
  useLazyEvaluatePolicy,
  PolicyUtils,
} from "./use-policy";

// P2 Features: Audit Trail
export {
  useAuditEvents,
  useComplianceReport,
  useLazyAuditEvents,
  useLazyComplianceReport,
  AuditUtils,
} from "./use-audit";

// P2 Features: Update Recommendations
export {
  useUpdateRecommendations,
  useLazyUpdateRecommendations,
  useBatchUpdateRecommendations,
  UpdateUtils,
} from "./use-updates";

// GraphQL Types (generated from schema)

export type Ecosystem = "NPM" | "PY_PI" | "CARGO" | "MAVEN" | "NU_GET" | "GO";

export interface Package {
  id: string;
  name: string;
  ecosystem: Ecosystem;
}

export interface Version {
  id: string;
  packageId: string;
  version: string;
  publishedAt?: string;
  yanked: boolean;
}

export interface PackageMetadata {
  latestVersion?: string;
  license?: string;
  repositoryUrl?: string;
  scorecardTarget?: string;
}

export interface PackageEdge {
  node: Package;
  cursor: string;
  depth?: number;
}

export interface ScoredPackageEdge extends PackageEdge {
  score?: number;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface PackageConnection {
  edges: PackageEdge[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface PackageSearchConnection {
  edges: ScoredPackageEdge[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface DependencyPathResult {
  found: boolean;
  hops: number;
  packages: Package[];
}

// ═══════════════════════════════════════════════════════════════
// VULNERABILITY & REACHABILITY TYPES (P0 Features)
// ═══════════════════════════════════════════════════════════════

export type ReachabilityStatus = 
  | "REACHABLE" 
  | "UNREACHABLE" 
  | "CONDITIONALLY_REACHABLE" 
  | "NO_RULE";

export type DependencyRelationship = "DIRECT" | "TRANSITIVE";

export type VulnerabilitySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface CallSite {
  file: string;
  line: number;
  function: string;
  snippet?: string;
}

export interface ReachabilityEvidence {
  status: ReachabilityStatus;
  confidence: number;
  ruleId?: string;
  callPath: CallSite[];
  conditions: string[];
  analyzedAt: string;
}

export interface ScoreBreakdown {
  reachability: number;
  exploitSignal: number;
  environment: number;
  cvss: number;
}

export interface RiskScore {
  total: number;
  breakdown: ScoreBreakdown;
  calculatedAt: string;
}

export interface VulnerabilityFinding {
  id: string;
  cveId?: string;
  ghsaId?: string;
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  cvssScore?: number;
  epssScore?: number;
  inKev: boolean;
  hasPublicExploit: boolean;
  affectedPackage: Package;
  affectedVersionRange: string;
  fixedVersion?: string;
  reachability: ReachabilityEvidence;
  riskScore: RiskScore;
  relationship: DependencyRelationship;
  introducedBy: Package[];
  publishedAt: string;
  updatedAt: string;
}

export interface VulnerabilityEdge {
  node: VulnerabilityFinding;
  cursor: string;
}

export interface VulnerabilityConnection {
  edges: VulnerabilityEdge[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DependencyEdgeExtended {
  node: Package;
  cursor: string;
  depth: number;
  relationship: DependencyRelationship;
  introducedBy: Package[];
}

export interface TransitivePath {
  target: Package;
  hops: number;
  path: Package[];
  introducedBy: Package;
}

export interface VulnerabilityFilter {
  severity?: VulnerabilitySeverity[];
  reachabilityStatus?: ReachabilityStatus[];
  relationship?: DependencyRelationship;
  hasExploit?: boolean;
  inKev?: boolean;
}

export interface ImpactNode {
  package: Package;
  depth: number;
  estimatedAffectedVersions?: number;
}

export interface ImpactDepthBucket {
  depth: number;
  packageCount: number;
}

export interface ImpactRadiusResult {
  packageId: string;
  vulnerableVersionRange?: string;
  maxDepth: number;
  impactedPackages: number;
  directImpactedPackages: number;
  transitiveImpactedPackages: number;
  impactedVersions: number;
  depthBuckets: ImpactDepthBucket[];
  topImpacted: ImpactNode[];
}

export interface EcosystemCount {
  ecosystem: Ecosystem;
  count: number;
}

export interface GraphStats {
  totalPackages: number;
  totalVersions: number;
  totalDependencies: number;
  totalPackageDependencies: number;
  ecosystemBreakdown?: EcosystemCount[];
}

export interface EventMeta {
  eventId: string;
  occurredAt: string;
  source: string;
}

export interface VersionEvent {
  meta: EventMeta;
  package: Package;
  version: Version;
}

// Query Variables Types
export interface GetPackageVariables {
  id: string;
}

export interface GetPackageMetadataVariables {
  packageId: string;
}

export interface GetReverseDependentsVariables {
  packageId: string;
  maxDepth?: number;
  first?: number;
  after?: string;
}

export interface GetDependencyPathVariables {
  fromPackageId: string;
  toPackageId: string;
  maxHops?: number;
}

export interface GetImpactRadiusVariables {
  packageId: string;
  vulnerableVersionRange?: string | null;
  maxDepth?: number;
  limit?: number;
}

export interface SearchPackagesVariables {
  query: string;
  ecosystem?: string;
  first?: number;
  after?: string;
}

// ═══════════════════════════════════════════════════════════════
// VULNERABILITY & REACHABILITY QUERY VARIABLES
// ═══════════════════════════════════════════════════════════════

export interface GetTransitivePathsVariables {
  packageId: string;
  targetPackageId: string;
  maxDepth?: number;
  first?: number;
}

export interface GetTransitivePathsResponse {
  transitivePaths: TransitivePath[];
}

export interface GetReverseDependentsExtendedVariables {
  packageId: string;
  maxDepth?: number;
  relationship?: DependencyRelationship;
  first?: number;
  after?: string;
}

export interface GetReverseDependentsExtendedResponse {
  reverseDependentsExtended: {
    edges: DependencyEdgeExtended[];
    pageInfo: PageInfo;
    totalCount: number;
  };
}

export interface GetVulnerabilityCountsVariables {
  packageId: string;
  includeTransitive?: boolean;
}

export interface GetVulnerabilityCountsResponse {
  vulnerabilityCounts: SeverityCounts;
}

export interface GetVulnerabilitiesVariables {
  packageId: string;
  filter?: VulnerabilityFilter;
  first?: number;
  after?: string;
}

export interface GetVulnerabilitiesResponse {
  vulnerabilities: VulnerabilityConnection;
}

// Query Response Types
export interface GetPackageResponse {
  package: Package | null;
}

export interface GetPackageMetadataResponse {
  packageMetadata: PackageMetadata;
}

export interface GetReverseDependentsResponse {
  reverseDependents: PackageConnection;
}

export interface GetDependencyPathResponse {
  dependencyPath: DependencyPathResult;
}

export interface GetImpactRadiusResponse {
  impactRadius: ImpactRadiusResult;
}

export interface GetGraphStatsResponse {
  graphStats: GraphStats;
}

export interface SearchPackagesResponse {
  searchPackages: PackageSearchConnection;
}

export interface SemanticSearchPackagesResponse {
  semanticSearchPackages: PackageSearchConnection;
}

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION TYPES
// ═══════════════════════════════════════════════════════════════

export type EventType = "PUBLISH" | "UPDATE" | "YANK" | "DEPRECATE";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BreakingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ChangeType = "BREAKING" | "FEATURE" | "FIX" | "DEPRECATION";

export interface LivePackageEvent {
  id: string;
  type: EventType;
  timestamp: string;
  package: Package;
  version: string;
  metadata?: {
    previousVersion?: string;
    downloadCount?: number;
    isPrerelease?: boolean;
  };
}

// Breaking change types (matches backend)
export interface BreakingChange {
  changeType: string;
  description: string;
  path?: string;
  oldSignature?: string;
  newSignature?: string;
}

export interface BreakingChangeEvent {
  timestamp: string;
  package: Package;
  fromVersion: string;
  toVersion: string;
  severity: BreakingSeverity;
  changes: BreakingChange[];
  affectedDependents: number;
}

// Live stats types (matches backend)
export interface EcosystemActivity {
  ecosystem: Ecosystem;
  count: number;
  change24h: number;
}

export interface LiveStats {
  timestamp: string;
  packagesIndexed: number;
  versionsIndexed: number;
  dependenciesTracked: number;
  eventsPerMinute: number;
  activeConnections: number;
  topEcosystems: EcosystemActivity[];
}

// Dependency impact types (matches backend)
export interface DependencyImpactEvent {
  timestamp: string;
  package: Package;
  version: string;
  impactScore: number;
  affectedPackages: number;
  affectedVersions: number;
  criticalPath: string[];
}

// Legacy aliases for backwards compatibility
export interface BreakingChangeInfo {
  type: ChangeType;
  description: string;
  path?: string;
  breaking: boolean;
}

export interface EcosystemStat {
  ecosystem: Ecosystem;
  packagesIndexed: number;
  versionsIndexed: number;
  recentActivity: number;
}

export interface TrendingPackage {
  package: Package;
  score: number;
  trend: "UP" | "DOWN" | "STABLE";
}

export interface WatchedPackageEvent {
  id: string;
  event: EventType;
  package: Package;
  version: string;
  timestamp: string;
  details?: string;
}

export interface DependencyGraphUpdate {
  type: "ADD" | "REMOVE" | "UPDATE";
  affectedPackage: Package;
  newVersion?: string;
  addedDependencies?: Package[];
  removedDependencies?: Package[];
  timestamp: string;
}

// Subscription Variable Types
export interface NewVersionVariables {
  ecosystem?: Ecosystem;
  packageId?: string;
}

export interface BreakingChangeVariables {
  ecosystem?: Ecosystem;
  packageId?: string;
  minSeverity?: BreakingSeverity;
}

export interface DependencyImpactVariables {
  ecosystem?: Ecosystem;
  minImpactScore?: number;
}

// Legacy variable types for backwards compatibility
export interface LivePackageActivityVariables {
  ecosystems?: Ecosystem[];
  eventTypes?: EventType[];
}

export interface WatchPackagesVariables {
  packageId?: string;
}

export interface DependencyGraphUpdateVariables {
  rootPackageId: string;
  maxDepth?: number;
}

// Subscription Response Types
export interface NewVersionResponse {
  newVersion: VersionEvent;
}

export interface BreakingChangeDetectedResponse {
  breakingChangeDetected: BreakingChangeEvent;
}

export interface LiveStatsResponse {
  liveStats: LiveStats;
}

export interface DependencyImpactResponse {
  dependencyImpact: DependencyImpactEvent;
}

// Legacy response types
export interface LivePackageActivityResponse {
  livePackageActivity: LivePackageEvent;
}

export interface WatchPackagesResponse {
  watchPackages: WatchedPackageEvent;
}

export interface DependencyGraphUpdateResponse {
  dependencyGraphUpdate: DependencyGraphUpdate;
}

// ═══════════════════════════════════════════════════════════════
// P1: SBOM TYPES
// ═══════════════════════════════════════════════════════════════

export type SbomFormat = "SPDX" | "CYCLONE_DX";
export type SbomEncoding = "JSON" | "XML";

export interface SbomGenerationOptions {
  format: SbomFormat;
  encoding?: SbomEncoding;
  includeVulnerabilities?: boolean;
  includeTransitive?: boolean;
  specVersion?: string;
}

export interface SbomComponent {
  ref: string;
  name: string;
  version: string;
  purl: string;
  ecosystem: Ecosystem;
  licenses: string[];
  hasVulnerabilities: boolean;
  vulnerabilityCount: number;
}

export interface SbomResult {
  format: SbomFormat;
  encoding: SbomEncoding;
  content: string;
  componentCount: number;
  vulnerabilityCount: number;
  generatedAt: string;
  downloadUrl?: string;
}

// ═══════════════════════════════════════════════════════════════
// P1: OPENSSF SCORECARD TYPES
// ═══════════════════════════════════════════════════════════════

export type ScorecardCheckType =
  | "VULNERABILITIES"
  | "MAINTAINED"
  | "CODE_REVIEW"
  | "CII_BEST_PRACTICES"
  | "LICENSE"
  | "SIGNED_RELEASES"
  | "BRANCH_PROTECTION"
  | "DANGEROUS_WORKFLOW"
  | "TOKEN_PERMISSIONS"
  | "SECURITY_POLICY"
  | "SAST"
  | "BINARY_ARTIFACTS"
  | "PINNED_DEPENDENCIES"
  | "DEPENDENCY_UPDATE_TOOL"
  | "FUZZING"
  | "PACKAGING"
  | "WEBHOOKS"
  | "CI_TESTS"
  | "CONTRIBUTORS";

export type RiskCategory = 
  | "HOLISTIC_SECURITY"
  | "SOURCE_RISK"
  | "BUILD_RISK";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ScorecardCheck {
  check: ScorecardCheckType;
  name: string;
  score: number;
  reason: string;
  details: string[];
  documentationUrl?: string;
  riskCategory: RiskCategory;
  riskLevel: RiskLevel;
}

export interface ScorecardResult {
  target: string;
  targetType: string;
  aggregateScore: number;
  checks: ScorecardCheck[];
  holisticSecurity: ScorecardCheck[];
  sourceRisk: ScorecardCheck[];
  buildRisk: ScorecardCheck[];
  generatedAt: string;
  scorecardVersion: string;
  commitSha?: string;
  failedChecks: ScorecardCheck[];
  criticalFindingsCount: number;
}

export interface ScorecardSummary {
  target: string;
  aggregateScore: number;
  riskLevel: RiskLevel;
  passedChecks: number;
  failedChecks: number;
  criticalIssues: number;
}

// ═══════════════════════════════════════════════════════════════
// P1: LICENSE COMPLIANCE TYPES
// ═══════════════════════════════════════════════════════════════

export type CopyleftType = "NONE" | "WEAK" | "STRONG" | "NETWORK";

export type LicenseCategory = 
  | "PERMISSIVE"
  | "COPYLEFT"
  | "PROPRIETARY"
  | "PUBLIC_DOMAIN"
  | "UNKNOWN";

export type LicensePolicyPreset = "DEFAULT" | "PERMISSIVE_ONLY" | "ENTERPRISE";

export interface LicenseInfo {
  id: string;
  name: string;
  osiApproved: boolean;
  fsfLibre: boolean;
  copyleft: CopyleftType;
  category: LicenseCategory;
  referenceUrl: string;
  deprecated: boolean;
}

export interface LicenseViolation {
  violationType: string;
  licenseId: string;
  reason: string;
  severity: string;
}

export interface LicenseValidationResult {
  compliant: boolean;
  policyName: string;
  detectedLicense?: string;
  violations: LicenseViolation[];
  warnings: string[];
}

export interface LicenseScanSummary {
  totalPackages: number;
  licensesDetected: string[];
  copyleftCount: number;
  permissiveCount: number;
  unknownCount: number;
  complianceStatus: boolean;
  violations: LicenseViolation[];
}

// Query Response Types
export interface GenerateSbomResponse {
  generateSbom: SbomResult;
}

export interface GetScorecardResponse {
  scorecard: ScorecardResult;
}

export interface GetScorecardSummaryResponse {
  scorecardSummary: ScorecardSummary;
}

export interface GetLicenseInfoResponse {
  licenseInfo: LicenseInfo | null;
}

export interface ValidateLicenseResponse {
  validateLicense: LicenseValidationResult;
}

export interface ScanLicensesResponse {
  scanLicenses: LicenseScanSummary;
}

// ═══════════════════════════════════════════════════════════════
// P2: VEX (Vulnerability Exploitability eXchange) TYPES
// ═══════════════════════════════════════════════════════════════

export type VexStatus = 
  | "NOT_AFFECTED"
  | "AFFECTED"
  | "FIXED"
  | "UNDER_INVESTIGATION";

export type VexJustification =
  | "COMPONENT_NOT_PRESENT"
  | "VULNERABLE_CODE_NOT_PRESENT"
  | "VULNERABLE_CODE_NOT_IN_EXECUTE_PATH"
  | "VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY"
  | "INLINE_MITIGATIONS_ALREADY_EXIST";

export type VexSeverity = 
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "NONE"
  | "UNKNOWN";

export type VexActionType = "UPDATE" | "WORKAROUND" | "MITIGATION" | "NONE";

export interface VexProduct {
  id: string;
  name: string;
  version: string;
  purl?: string;
  cpe?: string;
}

export interface VexSupplier {
  name: string;
  url?: string;
  email?: string;
}

export interface VexImpactStatement {
  summary: string;
  details?: string;
  adjustedCvss?: string;
  adjustedSeverity?: VexSeverity;
}

export interface VexActionStatement {
  actionType: VexActionType;
  description: string;
  targetRelease?: string;
  workaround?: string;
  estimatedFixDate?: string;
}

export interface VexStatement {
  id: string;
  vulnerabilityId: string;
  product: VexProduct;
  status: VexStatus;
  justification?: VexJustification;
  impact?: VexImpactStatement;
  action?: VexActionStatement;
  timestamp: string;
  supplier: VexSupplier;
  notes?: string;
}

export interface VexDocument {
  id: string;
  version: string;
  author: VexSupplier;
  timestamp: string;
  statements: VexStatement[];
  statementCount: number;
}

export interface VexStatistics {
  totalStatements: number;
  notAffectedCount: number;
  affectedCount: number;
  fixedCount: number;
  underInvestigationCount: number;
}

export interface VexExploitabilityResult {
  vulnerabilityId: string;
  productId: string;
  exploitable: boolean;
  status: VexStatus;
  justification?: VexJustification;
  recommendation?: string;
}

// ═══════════════════════════════════════════════════════════════
// P2: SLSA PROVENANCE TYPES
// ═══════════════════════════════════════════════════════════════

export type SlsaBuildLevel = "L0" | "L1" | "L2" | "L3";

export interface SlsaSubject {
  name: string;
  sha256: string;
}

export interface SlsaBuilder {
  id: string;
  version?: string;
}

export interface SlsaBuildMetadata {
  invocationId?: string;
  startedOn?: string;
  finishedOn?: string;
}

export interface SlsaProvenance {
  statementType: string;
  predicateType: string;
  subjects: SlsaSubject[];
  builder: SlsaBuilder;
  repository: string;
  gitRef?: string;
  workflow?: string;
  buildMetadata: SlsaBuildMetadata;
}

export interface ProvenanceVerificationCheck {
  name: string;
  passed: boolean;
  message?: string;
}

export interface ProvenanceVerificationResult {
  valid: boolean;
  slsaLevel: SlsaBuildLevel;
  checks: ProvenanceVerificationCheck[];
  errors: string[];
  warnings: string[];
}

export interface SlsaAssessment {
  packageId: string;
  level: SlsaBuildLevel;
  hasProvenance: boolean;
  provenanceSigned: boolean;
  builder?: string;
  sourceRepo?: string;
  assessedAt: string;
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════
// P2: POLICY ENGINE TYPES
// ═══════════════════════════════════════════════════════════════

export type PolicyResult = "PASS" | "FAIL" | "WARN" | "SKIP";

export type PolicySeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PolicyCategory = 
  | "LICENSE"
  | "SECURITY"
  | "SUPPLY_CHAIN"
  | "QUALITY"
  | "COMPLIANCE"
  | "CUSTOM";

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  blocking: boolean;
  remediation?: string;
  reference?: string;
}

export interface PolicySet {
  id: string;
  name: string;
  description?: string;
  version: string;
  rules: PolicyRule[];
  ruleCount: number;
  blockingRuleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  result: PolicyResult;
  severity: PolicySeverity;
  blocking: boolean;
  message: string;
  remediation?: string;
}

export interface PolicyEvaluationResult {
  policySetId: string;
  packageId: string;
  overallResult: PolicyResult;
  ruleResults: RuleEvaluationResult[];
  passedCount: number;
  failedCount: number;
  warningCount: number;
  blockingFailures: number;
  evaluatedAt: string;
  durationMs: number;
}

export interface PolicyEvaluationInput {
  packageId: string;
  policySetId?: string;
  useDefaultIfNotSpecified?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// P2: AUDIT TRAIL TYPES
// ═══════════════════════════════════════════════════════════════

export type AuditEventCategory =
  | "SECURITY"
  | "ACCESS"
  | "DATA_CHANGE"
  | "CONFIGURATION"
  | "POLICY"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "SYSTEM"
  | "COMPLIANCE";

export type AuditSeverity =
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARNING"
  | "ERROR"
  | "CRITICAL"
  | "ALERT"
  | "EMERGENCY";

export type AuditOutcome = "SUCCESS" | "FAILURE" | "PARTIAL" | "UNKNOWN";

export type ActorType = "USER" | "SERVICE" | "SYSTEM" | "ANONYMOUS" | "API_KEY";

export interface AuditActor {
  actorType: ActorType;
  id?: string;
  name?: string;
  email?: string;
  ipAddress?: string;
}

export interface AuditTarget {
  targetType: string;
  id: string;
  name?: string;
}

export interface AuditEvent {
  id: string;
  sequence: number;
  timestamp: string;
  eventType: string;
  category: AuditEventCategory;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  message: string;
  actor: AuditActor;
  target?: AuditTarget;
  tenantId?: string;
  correlationId?: string;
}

export interface AuditEventEdge {
  node: AuditEvent;
  cursor: string;
}

export interface AuditEventConnection {
  edges: AuditEventEdge[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface AuditFilterInput {
  category?: AuditEventCategory;
  minSeverity?: AuditSeverity;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  startTime?: string;
  endTime?: string;
  tenantId?: string;
}

export interface ComplianceReport {
  periodStart: string;
  periodEnd: string;
  totalEvents: number;
  securityEvents: number;
  policyEvents: number;
  complianceEvents: number;
  totalViolations: number;
  totalPolicyEvaluations: number;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// P2: UPDATE RECOMMENDATION TYPES
// ═══════════════════════════════════════════════════════════════

export type UpdateUrgency = 
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "OPTIONAL";

export type UpdateReason =
  | "SECURITY_VULNERABILITY"
  | "DEPRECATED_VERSION"
  | "END_OF_LIFE"
  | "LICENSE_CHANGE"
  | "MAJOR_BUG_FIX"
  | "PERFORMANCE_IMPROVEMENT"
  | "NEW_FEATURES"
  | "MAINTENANCE_UPDATE";

export interface UpdateRecommendation {
  packageId: string;
  packageName: string;
  currentVersion: string;
  recommendedVersion: string;
  latestVersion: string;
  urgency: UpdateUrgency;
  reasons: UpdateReason[];
  breakingChanges: boolean;
  changelogUrl?: string;
  vulnerabilitiesFixed: number;
  recommendationText: string;
}

export interface UpdateRecommendationSummary {
  totalPackages: number;
  updatesAvailable: number;
  criticalUpdates: number;
  securityUpdates: number;
  recommendations: UpdateRecommendation[];
}

// ═══════════════════════════════════════════════════════════════
// P2: QUERY RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════

export interface VexExploitabilityResponse {
  vexExploitability: VexExploitabilityResult;
}

export interface VexDocumentResponse {
  vexDocument: VexDocument | null;
}

export interface VexStatisticsResponse {
  vexStatistics: VexStatistics;
}

export interface SlsaAssessmentResponse {
  slsaAssessment: SlsaAssessment;
}

export interface SlsaProvenanceResponse {
  slsaProvenance: SlsaProvenance | null;
}

export interface VerifyProvenanceResponse {
  verifyProvenance: ProvenanceVerificationResult;
}

export interface PolicySetsResponse {
  policySets: PolicySet[];
}

export interface EvaluatePolicyResponse {
  evaluatePolicy: PolicyEvaluationResult;
}

export interface AuditEventsResponse {
  auditEvents: AuditEventConnection;
}

export interface ComplianceReportResponse {
  complianceReport: ComplianceReport;
}

export interface UpdateRecommendationsResponse {
  updateRecommendations: UpdateRecommendationSummary;
}

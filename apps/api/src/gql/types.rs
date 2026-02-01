//! GraphQL types matching the enterprise schema

#![allow(dead_code)]

use async_graphql::{Enum, InputObject, SimpleObject, ID};
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum Ecosystem {
    Npm,
    PyPi,
    Cargo,
    Maven,
    NuGet,
    Go,
    Unknown,
}

impl From<&str> for Ecosystem {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "npm" => Ecosystem::Npm,
            "pypi" => Ecosystem::PyPi,
            "cargo" | "crates" => Ecosystem::Cargo,
            "maven" => Ecosystem::Maven,
            "nuget" => Ecosystem::NuGet,
            "go" | "golang" => Ecosystem::Go,
            _ => Ecosystem::Unknown,
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════

/// Package node from the dependency graph
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct Package {
    pub id: ID,
    pub ecosystem: Ecosystem,
    pub name: String,
    #[graphql(skip)]
    pub created_at: Option<i64>,
    #[graphql(skip)]
    pub updated_at: Option<i64>,
}

/// Version node with metadata
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct Version {
    pub id: ID,
    pub package_id: ID,
    pub version: String,
    pub published_at: Option<String>,
    pub yanked: bool,
}

/// Dependency edge with version requirement
#[derive(SimpleObject, Clone, Debug)]
#[allow(dead_code)]
pub struct Dependency {
    pub package: Package,
    pub version_req: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// QUERY RESULT TYPES
// ═══════════════════════════════════════════════════════════════

/// Result for reverseDependents query
#[derive(SimpleObject, Clone, Debug)]
#[allow(dead_code)]
pub struct ReverseDependentNode {
    pub package: Package,
    pub depth: i32,
}

/// Connection type for pagination (Relay-style)
#[derive(SimpleObject, Clone, Debug)]
pub struct PackageConnection {
    pub edges: Vec<PackageEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct PackageEdge {
    pub node: Package,
    pub cursor: String,
    pub depth: Option<i32>,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct PageInfo {
    pub has_next_page: bool,
    pub has_previous_page: bool,
    pub start_cursor: Option<String>,
    pub end_cursor: Option<String>,
}

/// Result for dependencyPath query
#[derive(SimpleObject, Clone, Debug)]
pub struct DependencyPathResult {
    /// Whether a path was found
    pub found: bool,
    /// Number of hops in the path
    pub hops: i32,
    /// Ordered list of packages in the path (from -> to)
    pub packages: Vec<Package>,
}

/// Result for impactRadius query (CVE simulation)
#[derive(SimpleObject, Clone, Debug)]
pub struct ImpactRadiusResult {
    /// The vulnerable package
    pub package_id: ID,
    /// The semver range that is vulnerable (for reference)
    pub vulnerable_version_range: Option<String>,
    /// Max traversal depth used
    pub max_depth: i32,
    /// Total number of impacted packages
    pub impacted_packages: i32,
    /// Total number of impacted versions (approximate)
    pub impacted_versions: i32,
    /// Top impacted packages by proximity
    pub top_impacted: Vec<ImpactNode>,
}

/// A package impacted by a vulnerability
#[derive(SimpleObject, Clone, Debug)]
pub struct ImpactNode {
    pub package: Package,
    /// Number of hops from the vulnerable package
    pub depth: i32,
    /// Estimated affected versions in this package
    pub estimated_affected_versions: Option<i32>,
}

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION TYPES
// ═══════════════════════════════════════════════════════════════

/// Real-time event for new versions
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct VersionEvent {
    pub meta: EventMeta,
    pub package: Package,
    pub version: Version,
}

/// Breaking change detection event
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct BreakingChangeEvent {
    pub meta: EventMeta,
    pub package: Package,
    pub old_version: String,
    pub new_version: String,
    pub severity: BreakingSeverity,
    pub changes: Vec<BreakingChange>,
    pub affected_dependents: i32,
}

/// Severity of breaking change
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum BreakingSeverity {
    /// Minor breaking change (deprecation, behavioral)
    Low,
    /// Moderate breaking change (API signature change)
    Medium,
    /// Major breaking change (removed exports, incompatible types)
    High,
    /// Critical breaking change (security-related, requires immediate attention)
    Critical,
}

/// Individual breaking change detail
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct BreakingChange {
    /// Type of breaking change (removed_export, changed_signature, etc.)
    pub change_type: String,
    /// Description of the breaking change
    pub description: String,
    /// Affected symbol (function, class, type name)
    pub symbol: Option<String>,
    /// Suggested migration path
    pub migration_hint: Option<String>,
}

/// Live statistics event (periodic updates)
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct LiveStatsEvent {
    pub timestamp: String,
    pub total_packages: i64,
    pub total_versions: i64,
    pub packages_last_hour: i64,
    pub versions_last_hour: i64,
    pub active_subscriptions: usize,
    pub processing_queue_size: i32,
    pub ecosystem_activity: Vec<EcosystemActivity>,
}

/// Per-ecosystem activity stats
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct EcosystemActivity {
    pub ecosystem: Ecosystem,
    pub packages_added: i64,
    pub versions_added: i64,
    pub change_rate_percent: f64,
}

/// Dependency impact event (when a widely-used package changes)
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct DependencyImpactEvent {
    pub meta: EventMeta,
    pub package: Package,
    pub version: String,
    pub impact_score: f64,
    pub direct_dependents: i32,
    pub transitive_dependents: i32,
    pub notable_dependents: Vec<Package>,
}

/// Package activity event (batch updates)
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct PackageActivityEvent {
    pub event_type: PackageActivityType,
    pub package: Package,
    pub details: Option<String>,
    pub occurred_at: String,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum PackageActivityType {
    Published,
    Yanked,
    Deprecated,
    Unyanked,
    OwnershipChanged,
}

/// Event metadata
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct EventMeta {
    pub event_id: ID,
    pub occurred_at: String,
    pub source: String,
    pub traceparent: Option<String>,
}

/// Union type for all subscription events
#[derive(Clone, Debug, async_graphql::Union)]
pub enum SubscriptionEvent {
    Version(VersionEvent),
    BreakingChange(BreakingChangeEvent),
    LiveStats(LiveStatsEvent),
    DependencyImpact(DependencyImpactEvent),
    PackageActivity(PackageActivityEvent),
}

// ═══════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(InputObject, Clone, Debug)]
#[allow(dead_code)]
pub struct PackageFilter {
    pub ecosystem: Option<Ecosystem>,
    pub name_contains: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// STATS TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(SimpleObject, Clone, Debug)]
pub struct GraphStats {
    pub total_packages: i64,
    pub total_versions: i64,
    pub total_dependencies: i64,
    pub total_package_dependencies: i64,
    pub ecosystem_breakdown: Vec<EcosystemCount>,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct EcosystemCount {
    pub ecosystem: Ecosystem,
    pub count: i64,
}

// ═══════════════════════════════════════════════════════════════
// SEARCH TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(SimpleObject, Clone, Debug)]
pub struct SearchConnection {
    pub edges: Vec<SearchEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct SearchEdge {
    pub node: Package,
    pub cursor: String,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct SemanticSearchConnection {
    pub edges: Vec<SemanticSearchEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct SemanticSearchEdge {
    pub node: Package,
    pub cursor: String,
    /// Cosine similarity score from Qdrant
    pub score: f32,
}

// ═══════════════════════════════════════════════════════════════
// REACHABILITY & VULNERABILITY TYPES
// Based on Semgrep Supply Chain and industry best practices
// ═══════════════════════════════════════════════════════════════

/// Reachability status based on Semgrep classification
/// - REACHABLE: Code uses the vulnerable function/pattern
/// - UNREACHABLE: Dependency exists but vulnerable code is not called
/// - CONDITIONALLY_REACHABLE: Depends on runtime conditions (OS, config)
/// - NO_RULE: No reachability rule exists for this CVE
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum ReachabilityStatus {
    Reachable,
    Unreachable,
    ConditionallyReachable,
    NoRule,
}

/// Dependency relationship type (GitHub Dependency Graph style)
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum DependencyRelationship {
    /// Directly declared in manifest/lockfile
    Direct,
    /// Brought in by another dependency
    Transitive,
}

/// Vulnerability severity level
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

/// Location in source code where vulnerable pattern was found
#[derive(SimpleObject, Clone, Debug)]
pub struct CallSite {
    pub file: String,
    pub line: i32,
    pub column: Option<i32>,
    pub function: String,
    pub snippet: Option<String>,
}

/// Evidence for reachability determination
#[derive(SimpleObject, Clone, Debug)]
pub struct ReachabilityEvidence {
    pub status: ReachabilityStatus,
    /// Confidence in the determination (0.0 - 1.0)
    pub confidence: f32,
    /// ID of the rule that matched (e.g., "semgrep:cve-2021-44228")
    pub rule_id: Option<String>,
    /// Call path from entry point to vulnerable code
    pub call_path: Option<Vec<CallSite>>,
    /// Conditions for CONDITIONALLY_REACHABLE
    pub conditions: Option<Vec<String>>,
    /// When the analysis was performed
    pub analyzed_at: String,
}

/// Breakdown of risk score components
#[derive(SimpleObject, Clone, Debug)]
pub struct ScoreBreakdown {
    /// Reachability component (max 40 pts)
    pub reachability: f32,
    /// Exploit signal: EPSS + availability (max 25 pts)
    pub exploit_signal: f32,
    /// Environment exposure (max 20 pts)
    pub environment: f32,
    /// CVSS base score normalized (max 15 pts)
    pub cvss: f32,
}

/// Complete risk score with breakdown
/// Based on Jit.io Context Engine and OX Security prioritization
#[derive(SimpleObject, Clone, Debug)]
pub struct RiskScore {
    /// Total score (0-100)
    pub total: f32,
    /// Human-readable label (Low/Medium/High/Critical)
    pub label: String,
    /// Component breakdown
    pub breakdown: ScoreBreakdown,
    /// When risk score was calculated
    #[graphql(name = "calculatedAt")]
    pub calculated_at: String,
}

/// Vulnerability finding with full context
#[derive(SimpleObject, Clone, Debug)]
pub struct VulnerabilityFinding {
    pub id: ID,
    #[graphql(name = "cveId")]
    pub cve_id: String,
    #[graphql(name = "ghsaId")]
    pub ghsa_id: Option<String>,
    pub title: String,
    pub description: String,
    pub severity: Severity,
    #[graphql(name = "cvssScore")]
    pub cvss_score: f32,
    #[graphql(name = "epssScore")]
    pub epss_score: Option<f32>,
    #[graphql(name = "inKev")]
    pub in_kev: bool,
    #[graphql(name = "hasPublicExploit")]
    pub has_public_exploit: bool,
    #[graphql(name = "affectedPackage")]
    pub affected_package: Package,
    #[graphql(name = "affectedVersionRange")]
    pub affected_version_range: String,
    #[graphql(name = "fixedVersion")]
    pub fixed_version: Option<String>,
    pub reachability: ReachabilityEvidence,
    #[graphql(name = "riskScore")]
    pub risk_score: RiskScore,
    #[graphql(name = "relationship")]
    pub relationship: DependencyRelationship,
    #[graphql(name = "introducedBy")]
    pub introduced_by: Vec<Package>,
    #[graphql(name = "publishedAt")]
    pub published_at: String,
    #[graphql(name = "updatedAt")]
    pub updated_at: String,
}

/// Connection type for vulnerability pagination
#[derive(SimpleObject, Clone, Debug)]
pub struct VulnerabilityConnection {
    pub edges: Vec<VulnerabilityEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct VulnerabilityEdge {
    pub node: VulnerabilityFinding,
    pub cursor: String,
}

/// Counts by severity level for filtering UI
#[derive(SimpleObject, Clone, Debug, Default)]
pub struct SeverityCounts {
    pub critical: i32,
    pub high: i32,
    pub medium: i32,
    pub low: i32,
}

// ═══════════════════════════════════════════════════════════════
// TRANSITIVE DEPENDENCY TYPES
// ═══════════════════════════════════════════════════════════════

/// Extended dependency edge with relationship info
#[derive(SimpleObject, Clone, Debug)]
pub struct DependencyEdgeExtended {
    pub node: Package,
    pub cursor: String,
    pub depth: i32,
    pub relationship: DependencyRelationship,
    /// Which direct dependencies introduced this transitive dep
    pub introduced_by: Vec<Package>,
}

/// Connection for extended dependency queries
#[derive(SimpleObject, Clone, Debug)]
pub struct DependencyConnectionExtended {
    pub edges: Vec<DependencyEdgeExtended>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

/// Transitive path showing how a dependency was introduced
#[derive(SimpleObject, Clone, Debug)]
pub struct TransitivePath {
    /// Ordered list of packages from root to target
    pub packages: Vec<Package>,
    /// Length of the path
    pub length: i32,
}

/// Input for filtering vulnerabilities
#[derive(InputObject, Clone, Debug)]
pub struct VulnerabilityFilter {
    pub severity: Option<Vec<Severity>>,
    pub reachability: Option<Vec<ReachabilityStatus>>,
    pub min_risk_score: Option<f32>,
    pub exploit_available: Option<bool>,
}

// ═══════════════════════════════════════════════════════════════
// SBOM TYPES
// Based on SPDX 2.3 and CycloneDX 1.5
// ═══════════════════════════════════════════════════════════════

/// SBOM format selection
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum SbomFormat {
    /// SPDX 2.3 (ISO/IEC 5962:2021)
    Spdx,
    /// CycloneDX 1.5 (OWASP standard)
    CycloneDx,
}

/// SBOM output encoding
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum SbomEncoding {
    Json,
    Xml,
}

/// SBOM component type
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum SbomComponentType {
    Application,
    Framework,
    Library,
    Container,
    OperatingSystem,
    Device,
    Firmware,
    File,
}

/// SBOM generation options
#[derive(InputObject, Clone, Debug)]
pub struct SbomGenerationOptions {
    /// Output format (SPDX or CycloneDX)
    pub format: SbomFormat,
    /// Output encoding
    #[graphql(default)]
    pub encoding: Option<SbomEncoding>,
    /// Include vulnerabilities in SBOM
    #[graphql(default = true)]
    pub include_vulnerabilities: bool,
    /// Include transitive dependencies
    #[graphql(default)]
    pub include_transitive: Option<bool>,
    /// Include file hashes
    #[graphql(default = true)]
    pub include_hashes: bool,
    /// Maximum depth for transitive dependencies
    #[graphql(default)]
    pub max_depth: Option<i32>,
    /// Optional SBOM spec version
    #[graphql(default)]
    pub spec_version: Option<String>,
}

/// SBOM generation result
#[derive(SimpleObject, Clone, Debug)]
pub struct SbomResult {
    /// Format used
    pub format: SbomFormat,
    /// Encoding used
    pub encoding: SbomEncoding,
    /// SBOM content as string (JSON or XML)
    pub content: String,
    /// Number of components included
    pub component_count: i32,
    /// Number of vulnerabilities included
    pub vulnerability_count: i32,
    /// Generation timestamp
    pub generated_at: String,
    /// Download URL (if applicable)
    pub download_url: Option<String>,
}

/// SBOM component in the output
#[derive(SimpleObject, Clone, Debug)]
pub struct SbomComponent {
    pub id: ID,
    pub name: String,
    pub version: String,
    pub ecosystem: Ecosystem,
    pub purl: String,
    pub license: Option<String>,
    pub component_type: SbomComponentType,
    pub is_direct: bool,
}

// ═══════════════════════════════════════════════════════════════
// OPENSSF SCORECARD TYPES
// Based on https://scorecard.dev and OSSF Scorecard project
// ═══════════════════════════════════════════════════════════════

/// OpenSSF Scorecard check types (19 checks)
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "PascalCase")]
pub enum ScorecardCheckType {
    BinaryArtifacts,
    BranchProtection,
    CiTests,
    CiiBestPractices,
    CodeReview,
    Contributors,
    DangerousWorkflow,
    DependencyUpdateTool,
    Fuzzing,
    License,
    Maintained,
    Packaging,
    PinnedDependencies,
    Sast,
    SecurityPolicy,
    SignedReleases,
    TokenPermissions,
    Vulnerabilities,
    Webhooks,
}

/// Risk category for scorecard checks
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "PascalCase")]
pub enum RiskCategory {
    HolisticSecurity,
    SourceRisk,
    BuildRisk,
}

/// Risk level classification
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum RiskLevel {
    Critical,
    High,
    Medium,
    Low,
    Unknown,
}

/// Individual scorecard check result
#[derive(SimpleObject, Clone, Debug)]
pub struct ScorecardCheck {
    pub check: ScorecardCheckType,
    pub name: String,
    pub score: i32,
    pub reason: String,
    pub details: Vec<String>,
    pub documentation_url: Option<String>,
    pub risk_category: RiskCategory,
    pub risk_level: RiskLevel,
}

/// Complete scorecard result
#[derive(SimpleObject, Clone, Debug)]
pub struct ScorecardResult {
    /// Target repository/package
    pub target: String,
    pub target_type: String,
    /// Overall weighted score (0-10)
    pub aggregate_score: f32,
    /// Individual check results
    pub checks: Vec<ScorecardCheck>,
    /// Checks grouped by category
    pub holistic_security: Vec<ScorecardCheck>,
    pub source_risk: Vec<ScorecardCheck>,
    pub build_risk: Vec<ScorecardCheck>,
    /// Analysis timestamp
    pub generated_at: String,
    /// Scorecard version
    pub scorecard_version: String,
    /// Commit SHA (for repos)
    pub commit_sha: Option<String>,
    /// Failed checks (score < 5)
    pub failed_checks: Vec<ScorecardCheck>,
    /// Critical findings count
    pub critical_findings_count: i32,
}

/// Summary of scorecard for quick display
#[derive(SimpleObject, Clone, Debug)]
pub struct ScorecardSummary {
    pub target: String,
    pub aggregate_score: f32,
    pub risk_level: RiskLevel,
    pub passed_checks: i32,
    pub failed_checks: i32,
    pub critical_issues: i32,
}

// ═══════════════════════════════════════════════════════════════
// LICENSE COMPLIANCE TYPES
// Based on SPDX License List and expressions
// ═══════════════════════════════════════════════════════════════

/// License copyleft classification
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum CopyleftType {
    /// No copyleft (MIT, BSD, Apache)
    None,
    /// Weak copyleft (LGPL, MPL)
    Weak,
    /// Strong copyleft (GPL)
    Strong,
    /// Network copyleft (AGPL)
    Network,
}

/// License category
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum LicenseCategory {
    Permissive,
    Copyleft,
    Proprietary,
    PublicDomain,
    Unknown,
}

/// License information
#[derive(SimpleObject, Clone, Debug)]
pub struct LicenseInfo {
    pub id: String,
    pub name: String,
    pub osi_approved: bool,
    pub fsf_libre: bool,
    pub copyleft: CopyleftType,
    pub category: LicenseCategory,
    pub reference_url: String,
    pub deprecated: bool,
}

/// Parsed license expression node
#[derive(SimpleObject, Clone, Debug)]
pub struct LicenseExpressionNode {
    /// Type: "simple", "with_exception", "and", "or"
    pub node_type: String,
    /// License ID for simple nodes
    pub license_id: Option<String>,
    /// Exception ID for WITH nodes
    pub exception_id: Option<String>,
    /// String representation
    pub display: String,
}

/// License policy violation
#[derive(SimpleObject, Clone, Debug)]
pub struct LicenseViolation {
    pub violation_type: String,
    pub license_id: String,
    pub reason: String,
    pub severity: String,
}

/// Result of license policy validation
#[derive(SimpleObject, Clone, Debug)]
pub struct LicenseValidationResult {
    pub compliant: bool,
    pub policy_name: String,
    pub detected_license: Option<String>,
    pub violations: Vec<LicenseViolation>,
    pub warnings: Vec<String>,
}

/// License policy input
#[derive(InputObject, Clone, Debug)]
pub struct LicensePolicyInput {
    /// Policy name
    pub name: String,
    /// Explicitly allowed licenses
    #[graphql(default)]
    pub allowed: Option<Vec<String>>,
    /// Explicitly denied licenses
    #[graphql(default)]
    pub denied: Option<Vec<String>>,
    /// Allow copyleft licenses
    #[graphql(default = true)]
    pub allow_copyleft: bool,
    /// Allow network copyleft (AGPL)
    #[graphql(default = false)]
    pub allow_network_copyleft: bool,
    /// Require OSI approved
    #[graphql(default = false)]
    pub require_osi_approved: bool,
}

/// Pre-defined license policy type
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum LicensePolicyPreset {
    /// Default permissive policy
    Default,
    /// Only permissive licenses
    PermissiveOnly,
    /// Enterprise-friendly (no AGPL, GPL-3, etc.)
    Enterprise,
}

/// License scan summary for a project
#[derive(SimpleObject, Clone, Debug)]
pub struct LicenseScanSummary {
    pub total_packages: i32,
    pub licenses_detected: Vec<String>,
    pub copyleft_count: i32,
    pub permissive_count: i32,
    pub unknown_count: i32,
    pub compliance_status: bool,
    pub violations: Vec<LicenseViolation>,
}

// ═══════════════════════════════════════════════════════════════
// VEX (Vulnerability Exploitability eXchange) TYPES
// ═══════════════════════════════════════════════════════════════

/// VEX analysis status
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum VexStatus {
    /// Vulnerability does not affect the product
    NotAffected,
    /// Vulnerability affects the product
    Affected,
    /// Vulnerability has been fixed
    Fixed,
    /// Still under investigation
    UnderInvestigation,
}

/// Justification for NotAffected status
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum VexJustification {
    /// Component is not present in the product
    ComponentNotPresent,
    /// Vulnerable code is not present
    VulnerableCodeNotPresent,
    /// Vulnerable code cannot be executed
    VulnerableCodeNotInExecutePath,
    /// Adversary cannot control vulnerable code
    VulnerableCodeCannotBeControlledByAdversary,
    /// Inline mitigations prevent exploitation
    InlineMitigationsAlreadyExist,
}

/// Severity level for VEX
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum VexSeverity {
    Critical,
    High,
    Medium,
    Low,
    None,
    Unknown,
}

/// VEX action type
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum VexActionType {
    Update,
    Workaround,
    Mitigation,
    None,
}

/// VEX product information
#[derive(SimpleObject, Clone, Debug)]
pub struct VexProduct {
    pub id: String,
    pub name: String,
    pub version: String,
    pub purl: Option<String>,
    pub cpe: Option<String>,
}

/// VEX supplier information
#[derive(SimpleObject, Clone, Debug)]
pub struct VexSupplier {
    pub name: String,
    pub url: Option<String>,
    pub email: Option<String>,
}

/// VEX impact statement
#[derive(SimpleObject, Clone, Debug)]
pub struct VexImpactStatement {
    pub summary: String,
    pub details: Option<String>,
    pub adjusted_cvss: Option<String>,
    pub adjusted_severity: Option<VexSeverity>,
}

/// VEX action statement
#[derive(SimpleObject, Clone, Debug)]
pub struct VexActionStatement {
    pub action_type: VexActionType,
    pub description: String,
    pub target_release: Option<String>,
    pub workaround: Option<String>,
    pub estimated_fix_date: Option<String>,
}

/// VEX statement
#[derive(SimpleObject, Clone, Debug)]
pub struct VexStatement {
    pub id: String,
    pub vulnerability_id: String,
    pub product: VexProduct,
    pub status: VexStatus,
    pub justification: Option<VexJustification>,
    pub impact: Option<VexImpactStatement>,
    pub action: Option<VexActionStatement>,
    pub timestamp: String,
    pub supplier: VexSupplier,
    pub notes: Option<String>,
}

/// VEX document
#[derive(SimpleObject, Clone, Debug)]
pub struct VexDocument {
    pub id: String,
    pub version: String,
    pub author: VexSupplier,
    pub timestamp: String,
    pub statements: Vec<VexStatement>,
    pub statement_count: i32,
}

/// VEX statistics
#[derive(SimpleObject, Clone, Debug)]
pub struct VexStatistics {
    pub total_statements: i32,
    pub not_affected_count: i32,
    pub affected_count: i32,
    pub fixed_count: i32,
    pub under_investigation_count: i32,
}

/// VEX exploitability check result
#[derive(SimpleObject, Clone, Debug)]
pub struct VexExploitabilityResult {
    pub vulnerability_id: String,
    pub product_id: String,
    pub exploitable: bool,
    pub status: VexStatus,
    pub justification: Option<VexJustification>,
    pub recommendation: Option<String>,
}

/// Input for creating VEX statement
#[derive(InputObject, Clone, Debug)]
pub struct VexStatementInput {
    pub vulnerability_id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_version: String,
    pub status: VexStatus,
    pub justification: Option<VexJustification>,
    pub notes: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// SLSA PROVENANCE TYPES
// ═══════════════════════════════════════════════════════════════

/// SLSA Build Level
#[derive(Enum, Copy, Clone, Eq, PartialEq, PartialOrd, Ord, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum SlsaBuildLevel {
    /// No SLSA guarantees
    L0,
    /// Provenance exists
    L1,
    /// Hosted build platform
    L2,
    /// Hardened builds
    L3,
}

/// SLSA provenance subject (artifact)
#[derive(SimpleObject, Clone, Debug)]
pub struct SlsaSubject {
    pub name: String,
    pub sha256: String,
}

/// SLSA builder information
#[derive(SimpleObject, Clone, Debug)]
pub struct SlsaBuilder {
    pub id: String,
    pub version: Option<String>,
}

/// SLSA build metadata
#[derive(SimpleObject, Clone, Debug)]
pub struct SlsaBuildMetadata {
    pub invocation_id: Option<String>,
    pub started_on: Option<String>,
    pub finished_on: Option<String>,
}

/// SLSA provenance
#[derive(SimpleObject, Clone, Debug)]
pub struct SlsaProvenance {
    pub statement_type: String,
    pub predicate_type: String,
    pub subjects: Vec<SlsaSubject>,
    pub builder: SlsaBuilder,
    pub repository: String,
    pub git_ref: Option<String>,
    pub workflow: Option<String>,
    pub build_metadata: SlsaBuildMetadata,
}

/// Provenance verification check
#[derive(SimpleObject, Clone, Debug)]
pub struct ProvenanceVerificationCheck {
    pub name: String,
    pub passed: bool,
    pub message: Option<String>,
}

/// Provenance verification result
#[derive(SimpleObject, Clone, Debug)]
pub struct ProvenanceVerificationResult {
    pub valid: bool,
    pub slsa_level: SlsaBuildLevel,
    pub checks: Vec<ProvenanceVerificationCheck>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// SLSA assessment for a package
#[derive(SimpleObject, Clone, Debug)]
pub struct SlsaAssessment {
    pub package_id: String,
    pub level: SlsaBuildLevel,
    pub has_provenance: bool,
    pub provenance_signed: bool,
    pub builder: Option<String>,
    pub source_repo: Option<String>,
    pub assessed_at: String,
    pub recommendations: Vec<String>,
}

// ═══════════════════════════════════════════════════════════════
// POLICY ENGINE TYPES
// ═══════════════════════════════════════════════════════════════

/// Policy evaluation result
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum PolicyResult {
    Pass,
    Fail,
    Warn,
    Skip,
}

/// Policy severity
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum PolicySeverity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

/// Policy category
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum PolicyCategory {
    License,
    Security,
    SupplyChain,
    Quality,
    Compliance,
    Custom,
}

/// Individual policy rule
#[derive(SimpleObject, Clone, Debug)]
pub struct PolicyRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: PolicyCategory,
    pub severity: PolicySeverity,
    pub blocking: bool,
    pub remediation: Option<String>,
    pub reference: Option<String>,
}

/// Policy set
#[derive(SimpleObject, Clone, Debug)]
pub struct PolicySet {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub version: String,
    pub rules: Vec<PolicyRule>,
    pub rule_count: i32,
    pub blocking_rule_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Individual rule evaluation result
#[derive(SimpleObject, Clone, Debug)]
pub struct RuleEvaluationResult {
    pub rule_id: String,
    pub rule_name: String,
    pub result: PolicyResult,
    pub severity: PolicySeverity,
    pub blocking: bool,
    pub message: String,
    pub remediation: Option<String>,
}

/// Complete policy evaluation result
#[derive(SimpleObject, Clone, Debug)]
pub struct PolicyEvaluationResult {
    pub policy_set_id: String,
    pub package_id: String,
    pub overall_result: PolicyResult,
    pub rule_results: Vec<RuleEvaluationResult>,
    pub passed_count: i32,
    pub failed_count: i32,
    pub warning_count: i32,
    pub blocking_failures: i32,
    pub evaluated_at: String,
    pub duration_ms: i32,
}

/// Policy evaluation input
#[derive(InputObject, Clone, Debug)]
pub struct PolicyEvaluationInput {
    pub package_id: String,
    pub policy_set_id: Option<String>,
    /// Use default enterprise policy if no ID specified
    #[graphql(default = true)]
    pub use_default_if_not_specified: bool,
}

// ═══════════════════════════════════════════════════════════════
// AUDIT TRAIL TYPES
// ═══════════════════════════════════════════════════════════════

/// Audit event category
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AuditEventCategory {
    Security,
    Access,
    DataChange,
    Configuration,
    Policy,
    Authentication,
    Authorization,
    System,
    Compliance,
}

/// Audit severity
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AuditSeverity {
    Debug,
    Info,
    Notice,
    Warning,
    Error,
    Critical,
    Alert,
    Emergency,
}

/// Audit outcome
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AuditOutcome {
    Success,
    Failure,
    Partial,
    Unknown,
}

/// Actor type
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum ActorType {
    User,
    Service,
    System,
    Anonymous,
    ApiKey,
}

/// Audit actor information
#[derive(SimpleObject, Clone, Debug)]
pub struct AuditActor {
    pub actor_type: ActorType,
    pub id: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub ip_address: Option<String>,
}

/// Audit target information
#[derive(SimpleObject, Clone, Debug)]
pub struct AuditTarget {
    pub target_type: String,
    pub id: String,
    pub name: Option<String>,
}

/// Audit event
#[derive(SimpleObject, Clone, Debug)]
pub struct AuditEvent {
    pub id: String,
    pub sequence: i64,
    pub timestamp: String,
    pub event_type: String,
    pub category: AuditEventCategory,
    pub severity: AuditSeverity,
    pub outcome: AuditOutcome,
    pub message: String,
    pub actor: AuditActor,
    pub target: Option<AuditTarget>,
    pub tenant_id: Option<String>,
    pub correlation_id: Option<String>,
}

/// Audit event connection (paginated)
#[derive(SimpleObject, Clone, Debug)]
pub struct AuditEventConnection {
    pub edges: Vec<AuditEventEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

#[derive(SimpleObject, Clone, Debug)]
pub struct AuditEventEdge {
    pub node: AuditEvent,
    pub cursor: String,
}

/// Audit filter input
#[derive(InputObject, Clone, Debug)]
pub struct AuditFilterInput {
    pub category: Option<AuditEventCategory>,
    pub min_severity: Option<AuditSeverity>,
    pub actor_id: Option<String>,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub tenant_id: Option<String>,
}

/// Compliance report summary
#[derive(SimpleObject, Clone, Debug)]
pub struct ComplianceReport {
    pub period_start: String,
    pub period_end: String,
    pub total_events: i32,
    pub security_events: i32,
    pub policy_events: i32,
    pub compliance_events: i32,
    pub total_violations: i32,
    pub total_policy_evaluations: i32,
    pub generated_at: String,
}

// ═══════════════════════════════════════════════════════════════
// UPDATE RECOMMENDATION TYPES
// ═══════════════════════════════════════════════════════════════

/// Update urgency level
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum UpdateUrgency {
    /// Critical security fix
    Critical,
    /// High priority security update
    High,
    /// Medium priority
    Medium,
    /// Low priority improvement
    Low,
    /// Optional update
    Optional,
}

/// Reason for update recommendation
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum UpdateReason {
    SecurityVulnerability,
    DeprecatedVersion,
    EndOfLife,
    LicenseChange,
    MajorBugFix,
    PerformanceImprovement,
    NewFeatures,
    MaintenanceUpdate,
}

/// Update recommendation
#[derive(SimpleObject, Clone, Debug)]
pub struct UpdateRecommendation {
    pub package_id: String,
    pub package_name: String,
    pub current_version: String,
    pub recommended_version: String,
    pub latest_version: String,
    pub urgency: UpdateUrgency,
    pub reasons: Vec<UpdateReason>,
    pub breaking_changes: bool,
    pub changelog_url: Option<String>,
    pub vulnerabilities_fixed: i32,
    pub recommendation_text: String,
}

/// Batch update recommendations
#[derive(SimpleObject, Clone, Debug)]
pub struct UpdateRecommendationSummary {
    pub total_packages: i32,
    pub updates_available: i32,
    pub critical_updates: i32,
    pub security_updates: i32,
    pub recommendations: Vec<UpdateRecommendation>,
}

// ═══════════════════════════════════════════════════════════════
// GEMINI SECURITY AGENT TYPES
// For autonomous AI-powered security analysis
// ═══════════════════════════════════════════════════════════════

/// Input for starting an autonomous security agent task
#[derive(InputObject, Clone, Debug)]
pub struct SecurityAgentInput {
    /// The task description for the agent (e.g., "Analyze npm:lodash for vulnerabilities")
    pub task: String,
    /// Optional: Maximum number of steps the agent can take (default: 10)
    pub max_steps: Option<i32>,
    /// Optional: Specific packages to analyze
    pub target_packages: Option<Vec<String>>,
    /// Optional: Analysis depth for dependency traversal
    pub analysis_depth: Option<i32>,
}

/// Result of a security agent execution
#[derive(SimpleObject, Clone, Debug)]
pub struct SecurityAgentResult {
    /// The original task that was requested
    pub task: String,
    /// All steps the agent took during execution
    pub steps: Vec<SecurityAgentStep>,
    /// The agent's final analysis and recommendations
    pub final_response: String,
    /// Total number of function calls made by the agent
    pub total_function_calls: i32,
    /// List of packages that were analyzed
    pub packages_analyzed: Vec<String>,
    /// Vulnerabilities discovered during analysis
    pub vulnerabilities_found: Vec<AgentVulnerability>,
    /// Prioritized recommendations from the agent
    pub recommendations: Vec<String>,
    /// Structured JSON report (Gemini 3 structured output)
    pub structured_report_json: Option<String>,
    /// Whether the analysis completed successfully
    pub success: bool,
    /// Execution time in milliseconds
    pub execution_time_ms: i64,
}

/// A single step in the agent's execution
#[derive(SimpleObject, Clone, Debug)]
pub struct SecurityAgentStep {
    /// Step number in the sequence
    pub step_number: i32,
    /// What type of action was taken
    pub action_type: AgentActionType,
    /// Name of the tool that was called (if applicable)
    pub tool_name: Option<String>,
    /// Arguments passed to the tool (as JSON string)
    pub tool_args: Option<String>,
    /// Result from the tool (as JSON string)
    pub tool_result: Option<String>,
    /// Text response from the agent (if applicable)
    pub text_response: Option<String>,
    /// Agent's reasoning/thought for this step
    pub thought_summary: Option<String>,
}

/// Type of action the agent took
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AgentActionType {
    /// Agent called a function/tool
    FunctionCall,
    /// Agent provided a text response
    TextResponse,
    /// Agent encountered an error
    Error,
}

/// Vulnerability found by the agent
#[derive(SimpleObject, Clone, Debug)]
pub struct AgentVulnerability {
    /// CVE identifier
    pub cve_id: String,
    /// Affected package
    pub package: String,
    /// Severity level
    pub severity: String,
    /// Description of the vulnerability
    pub description: String,
    /// Version that fixes the vulnerability (if known)
    pub fix_version: Option<String>,
}

/// Available tools that the security agent can use
#[derive(SimpleObject, Clone, Debug)]
pub struct AgentTool {
    /// Name of the tool
    pub name: String,
    /// Description of what the tool does
    pub description: String,
    /// JSON schema of the tool's parameters
    pub parameters_schema: String,
}

/// Streaming update from the agent
#[derive(SimpleObject, Clone, Debug, Serialize, Deserialize)]
pub struct SecurityAgentUpdate {
    /// Current step number
    pub step_number: i32,
    /// Status of the current step
    pub status: AgentUpdateStatus,
    /// Current tool being executed
    pub current_tool: Option<String>,
    /// Progress message
    pub message: String,
    /// Partial results so far
    pub partial_results: Option<String>,
}

/// Status of agent update
#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AgentUpdateStatus {
    /// Agent is thinking/planning
    Thinking,
    /// Agent is executing a tool
    Executing,
    /// Tool execution completed
    Completed,
    /// An error occurred
    Error,
    /// Agent has finished
    Done,
}

//! OpenSSF Scorecard Models
//!
//! Implementation of OpenSSF Scorecard checks based on:
//! https://github.com/ossf/scorecard
//! https://scorecard.dev/
//!
//! Provides 18 automated security checks across 3 risk themes:
//! - Holistic Security
//! - Source Risk  
//! - Build Risk

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════════════════════════════════════
// SCORECARD CHECK DEFINITIONS
// ═══════════════════════════════════════════════════════════════

/// OpenSSF Scorecard Check types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum ScorecardCheck {
    /// Binary-Artifacts: Is the project free of checked-in binaries?
    BinaryArtifacts,
    /// Branch-Protection: Does the project use branch protection?
    BranchProtection,
    /// CI-Tests: Does the project run CI tests before pull requests are merged?
    CiTests,
    /// CII-Best-Practices: Does the project have a CII Best Practices Badge?
    CiiBestPractices,
    /// Code-Review: Does the project require code review before code is merged?
    CodeReview,
    /// Contributors: Does the project have contributors from at least two different organizations?
    Contributors,
    /// Dangerous-Workflow: Does the project avoid dangerous coding patterns in CI/CD?
    DangerousWorkflow,
    /// Dependency-Update-Tool: Does the project use tools to help update dependencies?
    DependencyUpdateTool,
    /// Fuzzing: Does the project use fuzzing tools?
    Fuzzing,
    /// License: Does the project declare a license?
    License,
    /// Maintained: Is the project maintained?
    Maintained,
    /// Packaging: Does the project build and publish official packages?
    Packaging,
    /// Pinned-Dependencies: Does the project declare and pin dependencies?
    PinnedDependencies,
    /// SAST: Does the project use static analysis tools?
    Sast,
    /// Security-Policy: Does the project have a security policy?
    SecurityPolicy,
    /// Signed-Releases: Does the project cryptographically sign releases?
    SignedReleases,
    /// Token-Permissions: Does the project follow principle of least privilege for CI?
    TokenPermissions,
    /// Vulnerabilities: Does the project have known vulnerabilities?
    Vulnerabilities,
    /// Webhooks: Does the project have secure webhooks?
    Webhooks,
}

impl ScorecardCheck {
    /// Get all checks
    pub fn all() -> Vec<Self> {
        vec![
            Self::BinaryArtifacts,
            Self::BranchProtection,
            Self::CiTests,
            Self::CiiBestPractices,
            Self::CodeReview,
            Self::Contributors,
            Self::DangerousWorkflow,
            Self::DependencyUpdateTool,
            Self::Fuzzing,
            Self::License,
            Self::Maintained,
            Self::Packaging,
            Self::PinnedDependencies,
            Self::Sast,
            Self::SecurityPolicy,
            Self::SignedReleases,
            Self::TokenPermissions,
            Self::Vulnerabilities,
            Self::Webhooks,
        ]
    }

    /// Get check name as string
    pub fn name(&self) -> &'static str {
        match self {
            Self::BinaryArtifacts => "Binary-Artifacts",
            Self::BranchProtection => "Branch-Protection",
            Self::CiTests => "CI-Tests",
            Self::CiiBestPractices => "CII-Best-Practices",
            Self::CodeReview => "Code-Review",
            Self::Contributors => "Contributors",
            Self::DangerousWorkflow => "Dangerous-Workflow",
            Self::DependencyUpdateTool => "Dependency-Update-Tool",
            Self::Fuzzing => "Fuzzing",
            Self::License => "License",
            Self::Maintained => "Maintained",
            Self::Packaging => "Packaging",
            Self::PinnedDependencies => "Pinned-Dependencies",
            Self::Sast => "SAST",
            Self::SecurityPolicy => "Security-Policy",
            Self::SignedReleases => "Signed-Releases",
            Self::TokenPermissions => "Token-Permissions",
            Self::Vulnerabilities => "Vulnerabilities",
            Self::Webhooks => "Webhooks",
        }
    }

    /// Get risk category for this check
    pub fn risk_category(&self) -> RiskCategory {
        match self {
            // Source Risk checks
            Self::BinaryArtifacts
            | Self::BranchProtection
            | Self::CodeReview
            | Self::Contributors
            | Self::DangerousWorkflow
            | Self::Maintained => RiskCategory::SourceRisk,

            // Build Risk checks
            Self::CiTests
            | Self::DependencyUpdateTool
            | Self::Fuzzing
            | Self::Packaging
            | Self::PinnedDependencies
            | Self::Sast
            | Self::SignedReleases
            | Self::TokenPermissions => RiskCategory::BuildRisk,

            // Holistic Security checks
            Self::CiiBestPractices
            | Self::License
            | Self::SecurityPolicy
            | Self::Vulnerabilities
            | Self::Webhooks => RiskCategory::HolisticSecurity,
        }
    }

    /// Get description for this check
    pub fn description(&self) -> &'static str {
        match self {
            Self::BinaryArtifacts => {
                "Determines if the project has generated executable artifacts in the source repository"
            }
            Self::BranchProtection => {
                "Determines if the default and release branches are protected"
            }
            Self::CiTests => "Determines if the project runs tests before pull requests are merged",
            Self::CiiBestPractices => "Determines if the project has a CII Best Practices Badge",
            Self::CodeReview => {
                "Determines if the project requires code review before code is merged"
            }
            Self::Contributors => {
                "Determines if the project has a set of contributors from at least two different organizations"
            }
            Self::DangerousWorkflow => {
                "Determines if the project's GitHub Action workflows avoid dangerous patterns"
            }
            Self::DependencyUpdateTool => "Determines if the project uses a dependency update tool",
            Self::Fuzzing => "Determines if the project uses fuzzing",
            Self::License => "Determines if the project has defined a license",
            Self::Maintained => "Determines if the project is actively maintained",
            Self::Packaging => "Determines if the project is published as a package",
            Self::PinnedDependencies => {
                "Determines if the project has declared and pinned its dependencies"
            }
            Self::Sast => "Determines if the project uses static code analysis",
            Self::SecurityPolicy => "Determines if the project has published a security policy",
            Self::SignedReleases => {
                "Determines if the project cryptographically signs release artifacts"
            }
            Self::TokenPermissions => {
                "Determines if the project's workflows follow the principle of least privilege"
            }
            Self::Vulnerabilities => {
                "Determines if the project has open, known unfixed vulnerabilities"
            }
            Self::Webhooks => "Determines if the project has secure webhooks",
        }
    }

    /// Get the risk weight for this check (used in aggregate scoring)
    pub fn weight(&self) -> f32 {
        match self {
            // Critical checks (weight 10)
            Self::Vulnerabilities => 10.0,
            Self::DangerousWorkflow => 10.0,
            Self::BinaryArtifacts => 10.0,

            // High importance checks (weight 7.5)
            Self::BranchProtection => 7.5,
            Self::CodeReview => 7.5,
            Self::TokenPermissions => 7.5,
            Self::PinnedDependencies => 7.5,
            Self::Maintained => 7.5,

            // Medium importance checks (weight 5)
            Self::Sast => 5.0,
            Self::SecurityPolicy => 5.0,
            Self::SignedReleases => 5.0,
            Self::DependencyUpdateTool => 5.0,
            Self::CiTests => 5.0,
            Self::License => 5.0,

            // Lower importance checks (weight 2.5)
            Self::Fuzzing => 2.5,
            Self::CiiBestPractices => 2.5,
            Self::Contributors => 2.5,
            Self::Packaging => 2.5,
            Self::Webhooks => 2.5,
        }
    }
}

/// Risk category for scorecard checks
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RiskCategory {
    /// Holistic security practices
    HolisticSecurity,
    /// Source code and repository risks
    SourceRisk,
    /// Build and supply chain risks
    BuildRisk,
}

impl RiskCategory {
    pub fn name(&self) -> &'static str {
        match self {
            Self::HolisticSecurity => "Holistic Security",
            Self::SourceRisk => "Source Risk",
            Self::BuildRisk => "Build Risk",
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD RESULTS
// ═══════════════════════════════════════════════════════════════

/// Result of a single scorecard check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    /// The check that was performed
    pub check: ScorecardCheck,
    /// Score from 0-10 (10 being the best)
    pub score: i32,
    /// Reason for the score
    pub reason: String,
    /// Detailed documentation about the finding
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub details: Vec<String>,
    /// Documentation URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub documentation_url: Option<String>,
}

impl CheckResult {
    /// Get the risk level based on score
    pub fn risk_level(&self) -> RiskLevel {
        match self.score {
            0..=2 => RiskLevel::Critical,
            3..=4 => RiskLevel::High,
            5..=7 => RiskLevel::Medium,
            8..=10 => RiskLevel::Low,
            _ => RiskLevel::Unknown,
        }
    }

    /// Check if this result passes (score >= 5)
    pub fn passes(&self) -> bool {
        self.score >= 5
    }
}

/// Risk level classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Critical,
    High,
    Medium,
    Low,
    Unknown,
}

impl RiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Critical => "critical",
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
            Self::Unknown => "unknown",
        }
    }

    /// Numeric value for ordering
    pub fn value(&self) -> i32 {
        match self {
            Self::Critical => 4,
            Self::High => 3,
            Self::Medium => 2,
            Self::Low => 1,
            Self::Unknown => 0,
        }
    }
}

/// Complete scorecard result for a project/package
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScorecardResult {
    /// Repository or package identifier
    pub target: String,
    /// Target type (repository, package)
    pub target_type: String,
    /// Overall aggregate score (0-10)
    pub aggregate_score: f32,
    /// Individual check results
    pub checks: Vec<CheckResult>,
    /// Timestamp when scorecard was generated
    pub generated_at: String,
    /// Scorecard version used
    pub scorecard_version: String,
    /// Commit SHA (for repositories)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_sha: Option<String>,
}

impl ScorecardResult {
    /// Calculate aggregate score from individual checks
    pub fn calculate_aggregate(&self) -> f32 {
        if self.checks.is_empty() {
            return 0.0;
        }

        let total_weight: f32 = self.checks.iter().map(|c| c.check.weight()).sum();
        let weighted_sum: f32 = self
            .checks
            .iter()
            .map(|c| c.score as f32 * c.check.weight())
            .sum();

        if total_weight > 0.0 {
            weighted_sum / total_weight
        } else {
            0.0
        }
    }

    /// Get checks by category
    pub fn checks_by_category(&self) -> HashMap<RiskCategory, Vec<&CheckResult>> {
        let mut result = HashMap::new();
        for check in &self.checks {
            result
                .entry(check.check.risk_category())
                .or_insert_with(Vec::new)
                .push(check);
        }
        result
    }

    /// Get failed checks (score < 5)
    pub fn failed_checks(&self) -> Vec<&CheckResult> {
        self.checks.iter().filter(|c| !c.passes()).collect()
    }

    /// Get critical/high risk checks
    pub fn critical_findings(&self) -> Vec<&CheckResult> {
        self.checks
            .iter()
            .filter(|c| matches!(c.risk_level(), RiskLevel::Critical | RiskLevel::High))
            .collect()
    }

    /// Get overall risk level
    pub fn overall_risk_level(&self) -> RiskLevel {
        match self.aggregate_score {
            s if s < 3.0 => RiskLevel::Critical,
            s if s < 5.0 => RiskLevel::High,
            s if s < 7.0 => RiskLevel::Medium,
            _ => RiskLevel::Low,
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD ANALYZER
// ═══════════════════════════════════════════════════════════════

/// Analyzes repositories/packages against OpenSSF Scorecard checks
pub struct ScorecardAnalyzer {
    version: String,
}

impl Default for ScorecardAnalyzer {
    fn default() -> Self {
        Self {
            version: "4.13".to_string(), // Latest as of 2024
        }
    }
}

impl ScorecardAnalyzer {
    pub fn new(version: &str) -> Self {
        Self {
            version: version.to_string(),
        }
    }

    /// Analyze a repository and return scorecard results
    /// This is a framework - actual implementation would call git/API
    pub fn analyze_repo(&self, repo: &RepoMetadata) -> ScorecardResult {
        let checks = vec![
            self.check_binary_artifacts(repo),
            self.check_branch_protection(repo),
            self.check_ci_tests(repo),
            self.check_cii_best_practices(repo),
            self.check_code_review(repo),
            self.check_contributors(repo),
            self.check_dangerous_workflow(repo),
            self.check_dependency_update_tool(repo),
            self.check_fuzzing(repo),
            self.check_license(repo),
            self.check_maintained(repo),
            self.check_packaging(repo),
            self.check_pinned_dependencies(repo),
            self.check_sast(repo),
            self.check_security_policy(repo),
            self.check_signed_releases(repo),
            self.check_token_permissions(repo),
            self.check_vulnerabilities(repo),
        ];

        let mut result = ScorecardResult {
            target: repo.url.clone(),
            target_type: "repository".to_string(),
            aggregate_score: 0.0,
            checks,
            generated_at: chrono::Utc::now().to_rfc3339(),
            scorecard_version: self.version.clone(),
            commit_sha: repo.commit_sha.clone(),
        };

        result.aggregate_score = result.calculate_aggregate();
        result
    }

    fn check_binary_artifacts(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_binary_artifacts { 0 } else { 10 };
        CheckResult {
            check: ScorecardCheck::BinaryArtifacts,
            score,
            reason: if score == 10 {
                "no binaries found in the repo".to_string()
            } else {
                "binaries present in source repository".to_string()
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#binary-artifacts"
                    .to_string(),
            ),
        }
    }

    fn check_branch_protection(&self, repo: &RepoMetadata) -> CheckResult {
        let score = match &repo.branch_protection {
            Some(bp) => {
                let mut s = 0;
                if bp.require_pull_request {
                    s += 3;
                }
                if bp.require_review {
                    s += 3;
                }
                if bp.require_status_checks {
                    s += 2;
                }
                if bp.enforce_admins {
                    s += 2;
                }
                s.min(10)
            }
            None => 0,
        };

        CheckResult {
            check: ScorecardCheck::BranchProtection,
            score,
            reason: format!("branch protection score: {}/10", score),
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#branch-protection"
                    .to_string(),
            ),
        }
    }

    fn check_ci_tests(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_ci_tests { 10 } else { 0 };
        CheckResult {
            check: ScorecardCheck::CiTests,
            score,
            reason: if score == 10 {
                "CI tests are run on PRs".to_string()
            } else {
                "no CI tests found".to_string()
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#ci-tests".to_string(),
            ),
        }
    }

    fn check_cii_best_practices(&self, repo: &RepoMetadata) -> CheckResult {
        let score = match repo.cii_badge_level.as_deref() {
            Some("gold") => 10,
            Some("silver") => 7,
            Some("passing") => 5,
            Some("in_progress") => 2,
            _ => 0,
        };

        CheckResult {
            check: ScorecardCheck::CiiBestPractices,
            score,
            reason: match repo.cii_badge_level.as_deref() {
                Some(level) => format!("Found CII badge at {} level", level),
                None => "No CII badge found".to_string(),
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#cii-best-practices"
                    .to_string(),
            ),
        }
    }

    fn check_code_review(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.requires_code_review { 10 } else { 0 };
        CheckResult {
            check: ScorecardCheck::CodeReview,
            score,
            reason: if score == 10 {
                "all changesets reviewed before merge".to_string()
            } else {
                "code review not required".to_string()
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#code-review"
                    .to_string(),
            ),
        }
    }

    fn check_contributors(&self, repo: &RepoMetadata) -> CheckResult {
        let score = match repo.contributor_orgs {
            n if n >= 3 => 10,
            2 => 7,
            1 => 3,
            _ => 0,
        };

        CheckResult {
            check: ScorecardCheck::Contributors,
            score,
            reason: format!("{} contributing organization(s)", repo.contributor_orgs),
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#contributors"
                    .to_string(),
            ),
        }
    }

    fn check_dangerous_workflow(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_dangerous_workflow { 0 } else { 10 };
        CheckResult {
            check: ScorecardCheck::DangerousWorkflow,
            score,
            reason: if score == 10 {
                "no dangerous workflow patterns found".to_string()
            } else {
                "dangerous workflow patterns detected".to_string()
            },
            details: repo.dangerous_workflow_details.clone(),
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#dangerous-workflow"
                    .to_string(),
            ),
        }
    }

    fn check_dependency_update_tool(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_dependabot || repo.has_renovate {
            10
        } else {
            0
        };
        let reason = if repo.has_dependabot {
            "Dependabot detected".to_string()
        } else if repo.has_renovate {
            "Renovate detected".to_string()
        } else {
            "no dependency update tool found".to_string()
        };

        CheckResult {
            check: ScorecardCheck::DependencyUpdateTool,
            score,
            reason,
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#dependency-update-tool"
                    .to_string(),
            ),
        }
    }

    fn check_fuzzing(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_fuzzing { 10 } else { 0 };
        CheckResult {
            check: ScorecardCheck::Fuzzing,
            score,
            reason: if score == 10 {
                "project uses fuzzing".to_string()
            } else {
                "no fuzzing detected".to_string()
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#fuzzing".to_string(),
            ),
        }
    }

    fn check_license(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.license.is_some() { 10 } else { 0 };
        CheckResult {
            check: ScorecardCheck::License,
            score,
            reason: match &repo.license {
                Some(l) => format!("license file found: {}", l),
                None => "no license file found".to_string(),
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#license".to_string(),
            ),
        }
    }

    fn check_maintained(&self, repo: &RepoMetadata) -> CheckResult {
        let score = match repo.days_since_last_commit {
            Some(d) if d <= 30 => 10,
            Some(d) if d <= 90 => 7,
            Some(d) if d <= 180 => 5,
            Some(d) if d <= 365 => 3,
            Some(_) => 0,
            None => 0,
        };

        CheckResult {
            check: ScorecardCheck::Maintained,
            score,
            reason: match repo.days_since_last_commit {
                Some(d) => format!("{} days since last commit", d),
                None => "unable to determine last commit".to_string(),
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#maintained".to_string(),
            ),
        }
    }

    fn check_packaging(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.publishes_package { 10 } else { 0 };
        CheckResult {
            check: ScorecardCheck::Packaging,
            score,
            reason: if score == 10 {
                "project publishes official packages".to_string()
            } else {
                "project does not publish packages".to_string()
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#packaging".to_string(),
            ),
        }
    }

    fn check_pinned_dependencies(&self, repo: &RepoMetadata) -> CheckResult {
        let score = ((repo.pinned_dependencies_ratio * 10.0) as i32).min(10);
        CheckResult {
            check: ScorecardCheck::PinnedDependencies,
            score,
            reason: format!(
                "{:.0}% of dependencies are pinned",
                repo.pinned_dependencies_ratio * 100.0
            ),
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#pinned-dependencies"
                    .to_string(),
            ),
        }
    }

    fn check_sast(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_sast { 10 } else { 0 };
        let mut details = vec![];
        if repo.has_codeql {
            details.push("CodeQL detected".to_string());
        }
        if repo.has_sonarqube {
            details.push("SonarQube detected".to_string());
        }
        if repo.has_semgrep {
            details.push("Semgrep detected".to_string());
        }

        CheckResult {
            check: ScorecardCheck::Sast,
            score,
            reason: if score == 10 {
                "SAST tools in use".to_string()
            } else {
                "no SAST tools detected".to_string()
            },
            details,
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#sast".to_string(),
            ),
        }
    }

    fn check_security_policy(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_security_policy { 10 } else { 0 };
        CheckResult {
            check: ScorecardCheck::SecurityPolicy,
            score,
            reason: if score == 10 {
                "security policy file found".to_string()
            } else {
                "no security policy file found".to_string()
            },
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#security-policy"
                    .to_string(),
            ),
        }
    }

    fn check_signed_releases(&self, repo: &RepoMetadata) -> CheckResult {
        let score = ((repo.signed_releases_ratio * 10.0) as i32).min(10);
        CheckResult {
            check: ScorecardCheck::SignedReleases,
            score,
            reason: format!(
                "{:.0}% of releases are signed",
                repo.signed_releases_ratio * 100.0
            ),
            details: vec![],
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#signed-releases"
                    .to_string(),
            ),
        }
    }

    fn check_token_permissions(&self, repo: &RepoMetadata) -> CheckResult {
        let score = if repo.has_least_privilege_tokens {
            10
        } else {
            0
        };
        CheckResult {
            check: ScorecardCheck::TokenPermissions,
            score,
            reason: if score == 10 {
                "GitHub workflows follow least privilege".to_string()
            } else {
                "token permissions are too broad".to_string()
            },
            details: repo.token_permission_issues.clone(),
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#token-permissions"
                    .to_string(),
            ),
        }
    }

    fn check_vulnerabilities(&self, repo: &RepoMetadata) -> CheckResult {
        let score = match repo.known_vulnerabilities {
            0 => 10,
            1..=2 => 7,
            3..=5 => 5,
            6..=10 => 3,
            _ => 0,
        };

        CheckResult {
            check: ScorecardCheck::Vulnerabilities,
            score,
            reason: format!("{} known vulnerabilities", repo.known_vulnerabilities),
            details: repo.vulnerability_ids.clone(),
            documentation_url: Some(
                "https://github.com/ossf/scorecard/blob/main/docs/checks.md#vulnerabilities"
                    .to_string(),
            ),
        }
    }
}

/// Repository metadata for scorecard analysis
#[derive(Debug, Clone, Default)]
pub struct RepoMetadata {
    pub url: String,
    pub commit_sha: Option<String>,
    pub has_binary_artifacts: bool,
    pub branch_protection: Option<BranchProtection>,
    pub has_ci_tests: bool,
    pub cii_badge_level: Option<String>,
    pub requires_code_review: bool,
    pub contributor_orgs: u32,
    pub has_dangerous_workflow: bool,
    pub dangerous_workflow_details: Vec<String>,
    pub has_dependabot: bool,
    pub has_renovate: bool,
    pub has_fuzzing: bool,
    pub license: Option<String>,
    pub days_since_last_commit: Option<u32>,
    pub publishes_package: bool,
    pub pinned_dependencies_ratio: f32,
    pub has_sast: bool,
    pub has_codeql: bool,
    pub has_sonarqube: bool,
    pub has_semgrep: bool,
    pub has_security_policy: bool,
    pub signed_releases_ratio: f32,
    pub has_least_privilege_tokens: bool,
    pub token_permission_issues: Vec<String>,
    pub known_vulnerabilities: u32,
    pub vulnerability_ids: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct BranchProtection {
    pub require_pull_request: bool,
    pub require_review: bool,
    pub require_status_checks: bool,
    pub enforce_admins: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scorecard_check_all() {
        let checks = ScorecardCheck::all();
        assert_eq!(checks.len(), 19);
    }

    #[test]
    fn test_check_result_risk_level() {
        let check = CheckResult {
            check: ScorecardCheck::Vulnerabilities,
            score: 2,
            reason: "test".to_string(),
            details: vec![],
            documentation_url: None,
        };
        assert_eq!(check.risk_level(), RiskLevel::Critical);

        let check = CheckResult {
            check: ScorecardCheck::License,
            score: 10,
            reason: "test".to_string(),
            details: vec![],
            documentation_url: None,
        };
        assert_eq!(check.risk_level(), RiskLevel::Low);
    }

    #[test]
    fn test_aggregate_score() {
        let result = ScorecardResult {
            target: "test".to_string(),
            target_type: "repository".to_string(),
            aggregate_score: 0.0,
            checks: vec![
                CheckResult {
                    check: ScorecardCheck::Vulnerabilities, // weight 10
                    score: 10,
                    reason: "".to_string(),
                    details: vec![],
                    documentation_url: None,
                },
                CheckResult {
                    check: ScorecardCheck::License, // weight 5
                    score: 0,
                    reason: "".to_string(),
                    details: vec![],
                    documentation_url: None,
                },
            ],
            generated_at: "".to_string(),
            scorecard_version: "4.13".to_string(),
            commit_sha: None,
        };

        // (10*10 + 0*5) / (10+5) = 100/15 = 6.67
        let aggregate = result.calculate_aggregate();
        assert!((aggregate - 6.67).abs() < 0.1);
    }

    #[test]
    fn test_analyzer_basic() {
        let analyzer = ScorecardAnalyzer::default();
        let repo = RepoMetadata {
            url: "https://github.com/test/repo".to_string(),
            has_ci_tests: true,
            license: Some("MIT".to_string()),
            has_security_policy: true,
            ..Default::default()
        };

        let result = analyzer.analyze_repo(&repo);
        assert!(!result.checks.is_empty());
        assert!(result.aggregate_score >= 0.0);
        assert!(result.aggregate_score <= 10.0);
    }
}

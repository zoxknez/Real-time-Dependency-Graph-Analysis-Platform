//! Policy Engine for Automated Compliance Evaluation
//!
//! A flexible policy engine that evaluates packages against configurable
//! security, license, and supply chain policies.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::license::LicenseInfo;
use crate::provenance::SlsaBuildLevel;
use crate::vex::VexSeverity;

// ═══════════════════════════════════════════════════════════════════════════
// POLICY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/// Policy evaluation result
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PolicyResult {
    /// Policy passed
    Pass,
    /// Policy failed - blocking
    Fail,
    /// Warning - non-blocking
    Warn,
    /// Skipped - not applicable
    Skip,
}

impl PolicyResult {
    pub fn is_blocking(&self) -> bool {
        matches!(self, PolicyResult::Fail)
    }
}

/// Severity levels for policy violations
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PolicySeverity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

// ═══════════════════════════════════════════════════════════════════════════
// POLICY RULES
// ═══════════════════════════════════════════════════════════════════════════

/// A single policy rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    /// Rule identifier
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Description
    pub description: String,
    /// Rule category
    pub category: PolicyCategory,
    /// Severity when violated
    pub severity: PolicySeverity,
    /// The actual rule condition
    pub condition: PolicyCondition,
    /// Whether violation is blocking
    pub blocking: bool,
    /// Remediation guidance
    pub remediation: Option<String>,
    /// External reference (CWE, etc.)
    pub reference: Option<String>,
}

/// Policy categories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PolicyCategory {
    License,
    Security,
    SupplyChain,
    Quality,
    Compliance,
    Custom,
}

impl PolicyCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            PolicyCategory::License => "license",
            PolicyCategory::Security => "security",
            PolicyCategory::SupplyChain => "supply_chain",
            PolicyCategory::Quality => "quality",
            PolicyCategory::Compliance => "compliance",
            PolicyCategory::Custom => "custom",
        }
    }
}

/// Policy condition types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PolicyCondition {
    /// License must be in allowed list
    LicenseAllowed { allowed: Vec<String> },
    /// License must not be in denied list
    LicenseDenied { denied: Vec<String> },
    /// License must be OSI approved
    LicenseOsiApproved,
    /// No vulnerabilities above severity threshold
    MaxVulnerabilitySeverity { max_severity: VexSeverity },
    /// All vulnerabilities must have VEX assessment
    RequireVexAssessment,
    /// Minimum SLSA level required
    MinSlsaLevel { min_level: SlsaBuildLevel },
    /// Package must have SBOM
    RequireSbom,
    /// Package must have provenance
    RequireProvenance,
    /// OpenSSF Scorecard minimum score
    MinScorecardScore { min_score: f64 },
    /// Specific scorecard check must pass
    ScorecardCheckRequired { check_name: String, min_score: i32 },
    /// Package age limit (unmaintained detection)
    MaxPackageAge { max_days: u32 },
    /// Dependency depth limit
    MaxDependencyDepth { max_depth: u32 },
    /// Custom expression (for advanced use)
    CustomExpression { expression: String },
    /// Combined conditions (AND)
    All { conditions: Vec<PolicyCondition> },
    /// Combined conditions (OR)
    Any { conditions: Vec<PolicyCondition> },
    /// Negation
    Not { condition: Box<PolicyCondition> },
}

// ═══════════════════════════════════════════════════════════════════════════
// POLICY SET
// ═══════════════════════════════════════════════════════════════════════════

/// A collection of related policy rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicySet {
    /// Policy set identifier
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Description
    pub description: Option<String>,
    /// Version
    pub version: String,
    /// Individual rules
    pub rules: Vec<PolicyRule>,
    /// Metadata
    pub metadata: Option<HashMap<String, String>>,
    /// Created timestamp
    pub created_at: DateTime<Utc>,
    /// Last updated
    pub updated_at: DateTime<Utc>,
}

impl PolicySet {
    /// Create a new empty policy set
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            name: name.into(),
            description: None,
            version: "1.0.0".to_string(),
            rules: Vec::new(),
            metadata: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a rule to the policy set
    pub fn add_rule(&mut self, rule: PolicyRule) {
        self.rules.push(rule);
        self.updated_at = Utc::now();
    }

    /// Get rules by category
    pub fn rules_by_category(&self, category: PolicyCategory) -> Vec<&PolicyRule> {
        self.rules
            .iter()
            .filter(|r| r.category == category)
            .collect()
    }

    /// Count blocking rules
    pub fn blocking_rule_count(&self) -> usize {
        self.rules.iter().filter(|r| r.blocking).count()
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POLICY EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

/// Context for policy evaluation
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PolicyContext {
    /// Package identifier
    pub package_id: String,
    /// Package name
    pub package_name: String,
    /// Package version
    pub package_version: String,
    /// License information
    pub license: Option<LicenseInfo>,
    /// Vulnerability count by severity
    pub vulnerabilities: HashMap<VexSeverity, usize>,
    /// VEX assessment count
    pub vex_assessments: usize,
    /// SLSA level
    pub slsa_level: Option<SlsaBuildLevel>,
    /// Has SBOM
    pub has_sbom: bool,
    /// Has provenance
    pub has_provenance: bool,
    /// OpenSSF Scorecard score
    pub scorecard_score: Option<f64>,
    /// Individual scorecard check scores
    pub scorecard_checks: HashMap<String, i32>,
    /// Last update date
    pub last_updated: Option<DateTime<Utc>>,
    /// Dependency depth
    pub dependency_depth: Option<u32>,
    /// Additional metadata
    pub metadata: HashMap<String, String>,
}

/// Individual rule evaluation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleEvaluation {
    /// Rule ID
    pub rule_id: String,
    /// Rule name
    pub rule_name: String,
    /// Evaluation result
    pub result: PolicyResult,
    /// Severity
    pub severity: PolicySeverity,
    /// Is blocking
    pub blocking: bool,
    /// Message explaining the result
    pub message: String,
    /// Remediation if failed
    pub remediation: Option<String>,
}

/// Complete policy evaluation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyEvaluation {
    /// Policy set ID
    pub policy_set_id: String,
    /// Package evaluated
    pub package_id: String,
    /// Overall result
    pub overall_result: PolicyResult,
    /// Individual rule results
    pub rule_results: Vec<RuleEvaluation>,
    /// Count of passed rules
    pub passed_count: usize,
    /// Count of failed rules
    pub failed_count: usize,
    /// Count of warnings
    pub warning_count: usize,
    /// Count of blocking failures
    pub blocking_failures: usize,
    /// Evaluation timestamp
    pub evaluated_at: DateTime<Utc>,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

// ═══════════════════════════════════════════════════════════════════════════
// POLICY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/// The policy engine that evaluates contexts against policy sets
pub struct PolicyEngine {
    /// Loaded policy sets
    policy_sets: HashMap<String, PolicySet>,
}

impl PolicyEngine {
    pub fn new() -> Self {
        Self {
            policy_sets: HashMap::new(),
        }
    }

    /// Load a policy set
    pub fn load_policy_set(&mut self, policy_set: PolicySet) {
        self.policy_sets.insert(policy_set.id.clone(), policy_set);
    }

    /// Get a policy set by ID
    pub fn get_policy_set(&self, id: &str) -> Option<&PolicySet> {
        self.policy_sets.get(id)
    }

    /// Evaluate a context against a policy set
    pub fn evaluate(
        &self,
        policy_set_id: &str,
        context: &PolicyContext,
    ) -> Option<PolicyEvaluation> {
        let policy_set = self.policy_sets.get(policy_set_id)?;
        let start = std::time::Instant::now();

        let mut rule_results = Vec::new();

        for rule in &policy_set.rules {
            let (result, message) = self.evaluate_condition(&rule.condition, context);

            rule_results.push(RuleEvaluation {
                rule_id: rule.id.clone(),
                rule_name: rule.name.clone(),
                result,
                severity: rule.severity,
                blocking: rule.blocking,
                message,
                remediation: if result == PolicyResult::Fail {
                    rule.remediation.clone()
                } else {
                    None
                },
            });
        }

        let passed_count = rule_results
            .iter()
            .filter(|r| r.result == PolicyResult::Pass)
            .count();
        let failed_count = rule_results
            .iter()
            .filter(|r| r.result == PolicyResult::Fail)
            .count();
        let warning_count = rule_results
            .iter()
            .filter(|r| r.result == PolicyResult::Warn)
            .count();
        let blocking_failures = rule_results
            .iter()
            .filter(|r| r.result == PolicyResult::Fail && r.blocking)
            .count();

        let overall_result = if blocking_failures > 0 {
            PolicyResult::Fail
        } else if warning_count > 0 || failed_count > 0 {
            PolicyResult::Warn
        } else {
            PolicyResult::Pass
        };

        Some(PolicyEvaluation {
            policy_set_id: policy_set_id.to_string(),
            package_id: context.package_id.clone(),
            overall_result,
            rule_results,
            passed_count,
            failed_count,
            warning_count,
            blocking_failures,
            evaluated_at: Utc::now(),
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    /// Evaluate a single condition
    fn evaluate_condition(
        &self,
        condition: &PolicyCondition,
        context: &PolicyContext,
    ) -> (PolicyResult, String) {
        match condition {
            PolicyCondition::LicenseAllowed { allowed } => match &context.license {
                Some(license) => {
                    if allowed.iter().any(|l| l.eq_ignore_ascii_case(&license.id)) {
                        (
                            PolicyResult::Pass,
                            format!("License {} is allowed", license.id),
                        )
                    } else {
                        (
                            PolicyResult::Fail,
                            format!("License {} is not in allowed list", license.id),
                        )
                    }
                }
                None => (
                    PolicyResult::Skip,
                    "No license information available".to_string(),
                ),
            },
            PolicyCondition::LicenseDenied { denied } => match &context.license {
                Some(license) => {
                    if denied.iter().any(|l| l.eq_ignore_ascii_case(&license.id)) {
                        (
                            PolicyResult::Fail,
                            format!("License {} is denied", license.id),
                        )
                    } else {
                        (
                            PolicyResult::Pass,
                            format!("License {} is not denied", license.id),
                        )
                    }
                }
                None => (
                    PolicyResult::Skip,
                    "No license information available".to_string(),
                ),
            },
            PolicyCondition::LicenseOsiApproved => match &context.license {
                Some(license) => {
                    if license.osi_approved {
                        (PolicyResult::Pass, "License is OSI approved".to_string())
                    } else {
                        (
                            PolicyResult::Fail,
                            format!("License {} is not OSI approved", license.id),
                        )
                    }
                }
                None => (
                    PolicyResult::Skip,
                    "No license information available".to_string(),
                ),
            },
            PolicyCondition::MaxVulnerabilitySeverity { max_severity } => {
                let has_violations = context
                    .vulnerabilities
                    .iter()
                    .any(|(sev, count)| *count > 0 && *sev > *max_severity);
                if has_violations {
                    (
                        PolicyResult::Fail,
                        format!("Has vulnerabilities above {:?} severity", max_severity),
                    )
                } else {
                    (
                        PolicyResult::Pass,
                        "No high-severity vulnerabilities".to_string(),
                    )
                }
            }
            PolicyCondition::RequireVexAssessment => {
                let total_vulns: usize = context.vulnerabilities.values().sum();
                if total_vulns == 0 {
                    (
                        PolicyResult::Pass,
                        "No vulnerabilities to assess".to_string(),
                    )
                } else if context.vex_assessments >= total_vulns {
                    (
                        PolicyResult::Pass,
                        "All vulnerabilities have VEX assessments".to_string(),
                    )
                } else {
                    (
                        PolicyResult::Fail,
                        format!(
                            "Missing VEX assessments: {} of {} vulnerabilities assessed",
                            context.vex_assessments, total_vulns
                        ),
                    )
                }
            }
            PolicyCondition::MinSlsaLevel { min_level } => match context.slsa_level {
                Some(level) if level >= *min_level => (
                    PolicyResult::Pass,
                    format!(
                        "SLSA level {} meets minimum {}",
                        level.as_str(),
                        min_level.as_str()
                    ),
                ),
                Some(level) => (
                    PolicyResult::Fail,
                    format!(
                        "SLSA level {} below minimum {}",
                        level.as_str(),
                        min_level.as_str()
                    ),
                ),
                None => (
                    PolicyResult::Fail,
                    "No SLSA level information available".to_string(),
                ),
            },
            PolicyCondition::RequireSbom => {
                if context.has_sbom {
                    (PolicyResult::Pass, "SBOM is available".to_string())
                } else {
                    (PolicyResult::Fail, "No SBOM available".to_string())
                }
            }
            PolicyCondition::RequireProvenance => {
                if context.has_provenance {
                    (PolicyResult::Pass, "Provenance is available".to_string())
                } else {
                    (PolicyResult::Fail, "No provenance available".to_string())
                }
            }
            PolicyCondition::MinScorecardScore { min_score } => match context.scorecard_score {
                Some(score) if score >= *min_score => (
                    PolicyResult::Pass,
                    format!(
                        "Scorecard score {:.1} meets minimum {:.1}",
                        score, min_score
                    ),
                ),
                Some(score) => (
                    PolicyResult::Fail,
                    format!(
                        "Scorecard score {:.1} below minimum {:.1}",
                        score, min_score
                    ),
                ),
                None => (
                    PolicyResult::Skip,
                    "No scorecard score available".to_string(),
                ),
            },
            PolicyCondition::ScorecardCheckRequired {
                check_name,
                min_score,
            } => match context.scorecard_checks.get(check_name) {
                Some(score) if *score >= *min_score => (
                    PolicyResult::Pass,
                    format!(
                        "{} check score {} meets minimum {}",
                        check_name, score, min_score
                    ),
                ),
                Some(score) => (
                    PolicyResult::Fail,
                    format!(
                        "{} check score {} below minimum {}",
                        check_name, score, min_score
                    ),
                ),
                None => (
                    PolicyResult::Skip,
                    format!("Scorecard check {} not available", check_name),
                ),
            },
            PolicyCondition::MaxPackageAge { max_days } => match context.last_updated {
                Some(updated) => {
                    let age = Utc::now().signed_duration_since(updated);
                    let days = age.num_days() as u32;
                    if days <= *max_days {
                        (
                            PolicyResult::Pass,
                            format!("Package updated {} days ago", days),
                        )
                    } else {
                        (
                            PolicyResult::Warn,
                            format!("Package not updated in {} days (max: {})", days, max_days),
                        )
                    }
                }
                None => (PolicyResult::Skip, "No update date available".to_string()),
            },
            PolicyCondition::MaxDependencyDepth { max_depth } => match context.dependency_depth {
                Some(depth) if depth <= *max_depth => (
                    PolicyResult::Pass,
                    format!("Dependency depth {} within limit {}", depth, max_depth),
                ),
                Some(depth) => (
                    PolicyResult::Warn,
                    format!("Dependency depth {} exceeds limit {}", depth, max_depth),
                ),
                None => (PolicyResult::Skip, "Dependency depth unknown".to_string()),
            },
            PolicyCondition::CustomExpression { expression } => {
                // Custom expressions would need a proper expression evaluator
                // For now, we just skip them
                (
                    PolicyResult::Skip,
                    format!("Custom expression not evaluated: {}", expression),
                )
            }
            PolicyCondition::All { conditions } => {
                let mut all_pass = true;
                let mut messages = Vec::new();

                for cond in conditions {
                    let (result, msg) = self.evaluate_condition(cond, context);
                    if result == PolicyResult::Fail {
                        all_pass = false;
                        messages.push(msg);
                    }
                }

                if all_pass {
                    (PolicyResult::Pass, "All conditions passed".to_string())
                } else {
                    (PolicyResult::Fail, messages.join("; "))
                }
            }
            PolicyCondition::Any { conditions } => {
                for cond in conditions {
                    let (result, msg) = self.evaluate_condition(cond, context);
                    if result == PolicyResult::Pass {
                        return (PolicyResult::Pass, msg);
                    }
                }
                (PolicyResult::Fail, "No conditions passed".to_string())
            }
            PolicyCondition::Not { condition } => {
                let (result, msg) = self.evaluate_condition(condition, context);
                match result {
                    PolicyResult::Pass => (PolicyResult::Fail, format!("NOT({})", msg)),
                    PolicyResult::Fail => (PolicyResult::Pass, format!("NOT({})", msg)),
                    other => (other, msg),
                }
            }
        }
    }

    /// Create default enterprise policy set
    pub fn create_default_enterprise_policy() -> PolicySet {
        let mut policy = PolicySet::new("enterprise-default", "Enterprise Default Policy");
        policy.description =
            Some("Default security and compliance policy for enterprise environments".to_string());

        // License rules
        policy.add_rule(PolicyRule {
            id: "license-osi".to_string(),
            name: "OSI Approved License Required".to_string(),
            description: "All dependencies must use OSI-approved licenses".to_string(),
            category: PolicyCategory::License,
            severity: PolicySeverity::High,
            condition: PolicyCondition::LicenseOsiApproved,
            blocking: true,
            remediation: Some("Replace with an OSI-approved licensed alternative".to_string()),
            reference: Some("https://opensource.org/licenses".to_string()),
        });

        policy.add_rule(PolicyRule {
            id: "license-deny-gpl".to_string(),
            name: "No Copyleft Licenses".to_string(),
            description: "Deny strong copyleft licenses in commercial software".to_string(),
            category: PolicyCategory::License,
            severity: PolicySeverity::High,
            condition: PolicyCondition::LicenseDenied {
                denied: vec![
                    "GPL-2.0".to_string(),
                    "GPL-3.0".to_string(),
                    "AGPL-3.0".to_string(),
                    "LGPL-2.1".to_string(),
                    "LGPL-3.0".to_string(),
                ],
            },
            blocking: true,
            remediation: Some("Replace with a permissively-licensed alternative".to_string()),
            reference: None,
        });

        // Security rules
        policy.add_rule(PolicyRule {
            id: "vuln-critical".to_string(),
            name: "No Critical Vulnerabilities".to_string(),
            description: "No dependencies with critical severity vulnerabilities".to_string(),
            category: PolicyCategory::Security,
            severity: PolicySeverity::Critical,
            condition: PolicyCondition::MaxVulnerabilitySeverity {
                max_severity: VexSeverity::High,
            },
            blocking: true,
            remediation: Some("Upgrade to a patched version or apply VEX assessment".to_string()),
            reference: None,
        });

        // Supply chain rules
        policy.add_rule(PolicyRule {
            id: "slsa-l1".to_string(),
            name: "SLSA Build Level 1".to_string(),
            description: "All packages must meet SLSA Build Level 1".to_string(),
            category: PolicyCategory::SupplyChain,
            severity: PolicySeverity::Medium,
            condition: PolicyCondition::MinSlsaLevel {
                min_level: SlsaBuildLevel::L1,
            },
            blocking: false,
            remediation: Some(
                "Use packages from build systems that provide provenance".to_string(),
            ),
            reference: Some("https://slsa.dev/spec/v1.0/levels".to_string()),
        });

        policy.add_rule(PolicyRule {
            id: "scorecard-min".to_string(),
            name: "Minimum OpenSSF Scorecard Score".to_string(),
            description: "Dependencies should have minimum scorecard score of 5.0".to_string(),
            category: PolicyCategory::SupplyChain,
            severity: PolicySeverity::Low,
            condition: PolicyCondition::MinScorecardScore { min_score: 5.0 },
            blocking: false,
            remediation: Some(
                "Consider alternative packages with better security practices".to_string(),
            ),
            reference: Some("https://securityscorecards.dev".to_string()),
        });

        // Quality rules
        policy.add_rule(PolicyRule {
            id: "unmaintained".to_string(),
            name: "Package Freshness".to_string(),
            description: "Warn about packages not updated in 2 years".to_string(),
            category: PolicyCategory::Quality,
            severity: PolicySeverity::Low,
            condition: PolicyCondition::MaxPackageAge { max_days: 730 },
            blocking: false,
            remediation: Some("Consider actively maintained alternatives".to_string()),
            reference: None,
        });

        policy
    }
}

impl Default for PolicyEngine {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::{CopyleftType, LicenseCategory};

    #[allow(clippy::field_reassign_with_default)]
    fn test_context() -> PolicyContext {
        let mut ctx = PolicyContext::default();
        ctx.package_id = "pkg:npm/test@1.0.0".to_string();
        ctx.package_name = "test".to_string();
        ctx.package_version = "1.0.0".to_string();
        ctx.license = Some(LicenseInfo {
            id: "MIT".to_string(),
            name: "MIT License".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::Permissive,
            reference: "https://spdx.org/licenses/MIT.html".to_string(),
            deprecated: false,
        });
        ctx.scorecard_score = Some(7.5);
        ctx.slsa_level = Some(SlsaBuildLevel::L1);
        ctx.has_sbom = true;
        ctx.last_updated = Some(Utc::now());
        ctx
    }

    #[test]
    fn test_license_allowed() {
        let mut engine = PolicyEngine::new();
        let mut policy = PolicySet::new("test", "Test Policy");

        policy.add_rule(PolicyRule {
            id: "lic-1".to_string(),
            name: "Allowed Licenses".to_string(),
            description: "Test".to_string(),
            category: PolicyCategory::License,
            severity: PolicySeverity::High,
            condition: PolicyCondition::LicenseAllowed {
                allowed: vec!["MIT".to_string(), "Apache-2.0".to_string()],
            },
            blocking: true,
            remediation: None,
            reference: None,
        });

        engine.load_policy_set(policy);

        let result = engine.evaluate("test", &test_context()).unwrap();
        assert_eq!(result.overall_result, PolicyResult::Pass);
    }

    #[test]
    fn test_license_denied() {
        let mut engine = PolicyEngine::new();
        let mut policy = PolicySet::new("test", "Test Policy");

        policy.add_rule(PolicyRule {
            id: "lic-1".to_string(),
            name: "Denied Licenses".to_string(),
            description: "Test".to_string(),
            category: PolicyCategory::License,
            severity: PolicySeverity::High,
            condition: PolicyCondition::LicenseDenied {
                denied: vec!["GPL-3.0".to_string()],
            },
            blocking: true,
            remediation: None,
            reference: None,
        });

        engine.load_policy_set(policy);

        let result = engine.evaluate("test", &test_context()).unwrap();
        assert_eq!(result.overall_result, PolicyResult::Pass); // MIT is not denied
    }

    #[test]
    fn test_default_enterprise_policy() {
        let policy = PolicyEngine::create_default_enterprise_policy();

        assert!(!policy.rules.is_empty());
        assert!(
            policy
                .rules
                .iter()
                .any(|r| r.category == PolicyCategory::License)
        );
        assert!(
            policy
                .rules
                .iter()
                .any(|r| r.category == PolicyCategory::Security)
        );
        assert!(
            policy
                .rules
                .iter()
                .any(|r| r.category == PolicyCategory::SupplyChain)
        );
    }

    #[test]
    fn test_slsa_level_check() {
        let mut engine = PolicyEngine::new();
        let mut policy = PolicySet::new("test", "Test Policy");

        policy.add_rule(PolicyRule {
            id: "slsa-1".to_string(),
            name: "SLSA L2".to_string(),
            description: "Test".to_string(),
            category: PolicyCategory::SupplyChain,
            severity: PolicySeverity::High,
            condition: PolicyCondition::MinSlsaLevel {
                min_level: SlsaBuildLevel::L2,
            },
            blocking: true,
            remediation: None,
            reference: None,
        });

        engine.load_policy_set(policy);

        let context = test_context(); // Has L1
        let result = engine.evaluate("test", &context).unwrap();

        // Should fail because context has L1 but requires L2
        assert_eq!(result.overall_result, PolicyResult::Fail);
    }

    #[test]
    fn test_combined_conditions() {
        let mut engine = PolicyEngine::new();
        let mut policy = PolicySet::new("test", "Test Policy");

        policy.add_rule(PolicyRule {
            id: "combined-1".to_string(),
            name: "Combined Check".to_string(),
            description: "Test".to_string(),
            category: PolicyCategory::Compliance,
            severity: PolicySeverity::Medium,
            condition: PolicyCondition::All {
                conditions: vec![
                    PolicyCondition::LicenseOsiApproved,
                    PolicyCondition::MinScorecardScore { min_score: 5.0 },
                ],
            },
            blocking: true,
            remediation: None,
            reference: None,
        });

        engine.load_policy_set(policy);

        let result = engine.evaluate("test", &test_context()).unwrap();
        assert_eq!(result.overall_result, PolicyResult::Pass);
    }
}

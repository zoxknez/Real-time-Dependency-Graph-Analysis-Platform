//! License Compliance Module
//!
//! SPDX License Expression parsing and policy validation
//! Based on: https://spdx.org/licenses/
//!           https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ═══════════════════════════════════════════════════════════════
// SPDX LICENSE IDENTIFIERS
// ═══════════════════════════════════════════════════════════════

/// Well-known SPDX license identifiers with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    /// SPDX identifier (e.g., "MIT", "Apache-2.0")
    pub id: String,
    /// Full license name
    pub name: String,
    /// OSI approved
    pub osi_approved: bool,
    /// FSF libre
    pub fsf_libre: bool,
    /// Copyleft type
    pub copyleft: CopyleftType,
    /// License category
    pub category: LicenseCategory,
    /// Reference URL
    pub reference: String,
    /// Is deprecated
    pub deprecated: bool,
}

/// Copyleft classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CopyleftType {
    /// No copyleft (MIT, BSD, Apache)
    None,
    /// Weak copyleft (LGPL, MPL, EPL)
    Weak,
    /// Strong copyleft (GPL, AGPL)
    Strong,
    /// Network copyleft (AGPL)
    Network,
}

impl CopyleftType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Weak => "weak",
            Self::Strong => "strong",
            Self::Network => "network",
        }
    }
}

/// License category for policy rules
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LicenseCategory {
    Permissive,
    Copyleft,
    Proprietary,
    PublicDomain,
    Unknown,
}

impl LicenseCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Permissive => "permissive",
            Self::Copyleft => "copyleft",
            Self::Proprietary => "proprietary",
            Self::PublicDomain => "public-domain",
            Self::Unknown => "unknown",
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// SPDX LICENSE EXPRESSION PARSER
// ═══════════════════════════════════════════════════════════════

/// SPDX License Expression AST node
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LicenseExpr {
    /// Simple license identifier (e.g., "MIT")
    Simple(String),
    /// License with exception (e.g., "GPL-2.0-only WITH Classpath-exception-2.0")
    WithException { license: String, exception: String },
    /// AND conjunction - both licenses apply
    And(Box<LicenseExpr>, Box<LicenseExpr>),
    /// OR disjunction - choice of licenses
    Or(Box<LicenseExpr>, Box<LicenseExpr>),
}

impl LicenseExpr {
    /// Parse an SPDX license expression
    pub fn parse(expr: &str) -> Result<Self, LicenseParseError> {
        LicenseExprParser::new(expr).parse()
    }
    
    /// Get all license identifiers in this expression
    pub fn all_licenses(&self) -> Vec<&str> {
        match self {
            Self::Simple(id) => vec![id.as_str()],
            Self::WithException { license, .. } => vec![license.as_str()],
            Self::And(left, right) | Self::Or(left, right) => {
                let mut result = left.all_licenses();
                result.extend(right.all_licenses());
                result
            }
        }
    }
    
    /// Get all license identifiers as owned strings
    pub fn all_license_ids(&self) -> Vec<String> {
        self.all_licenses().into_iter().map(|s| s.to_string()).collect()
    }
    
    /// Check if this expression is satisfied by a set of allowed licenses
    pub fn is_satisfied_by(&self, allowed: &HashSet<String>) -> bool {
        match self {
            Self::Simple(id) => allowed.contains(id),
            Self::WithException { license, .. } => allowed.contains(license),
            Self::And(left, right) => {
                left.is_satisfied_by(allowed) && right.is_satisfied_by(allowed)
            }
            Self::Or(left, right) => {
                left.is_satisfied_by(allowed) || right.is_satisfied_by(allowed)
            }
        }
    }
    
    /// Find a satisfying choice for OR expressions
    pub fn find_satisfying_choice(&self, allowed: &HashSet<String>) -> Option<Vec<String>> {
        match self {
            Self::Simple(id) => {
                if allowed.contains(id) {
                    Some(vec![id.clone()])
                } else {
                    None
                }
            }
            Self::WithException { license, exception } => {
                if allowed.contains(license) {
                    Some(vec![format!("{} WITH {}", license, exception)])
                } else {
                    None
                }
            }
            Self::And(left, right) => {
                let left_choice = left.find_satisfying_choice(allowed)?;
                let right_choice = right.find_satisfying_choice(allowed)?;
                let mut result = left_choice;
                result.extend(right_choice);
                Some(result)
            }
            Self::Or(left, right) => {
                // Try left first
                if let Some(choice) = left.find_satisfying_choice(allowed) {
                    return Some(choice);
                }
                // Try right
                right.find_satisfying_choice(allowed)
            }
        }
    }
}

impl std::fmt::Display for LicenseExpr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Simple(id) => write!(f, "{}", id),
            Self::WithException { license, exception } => {
                write!(f, "{} WITH {}", license, exception)
            }
            Self::And(left, right) => write!(f, "({} AND {})", left, right),
            Self::Or(left, right) => write!(f, "({} OR {})", left, right),
        }
    }
}

/// Parser for SPDX license expressions
struct LicenseExprParser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> LicenseExprParser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input: input.trim(), pos: 0 }
    }
    
    fn parse(&mut self) -> Result<LicenseExpr, LicenseParseError> {
        self.parse_or()
    }
    
    fn parse_or(&mut self) -> Result<LicenseExpr, LicenseParseError> {
        let mut left = self.parse_and()?;
        
        while self.match_keyword("OR") {
            let right = self.parse_and()?;
            left = LicenseExpr::Or(Box::new(left), Box::new(right));
        }
        
        Ok(left)
    }
    
    fn parse_and(&mut self) -> Result<LicenseExpr, LicenseParseError> {
        let mut left = self.parse_with()?;
        
        while self.match_keyword("AND") {
            let right = self.parse_with()?;
            left = LicenseExpr::And(Box::new(left), Box::new(right));
        }
        
        Ok(left)
    }
    
    fn parse_with(&mut self) -> Result<LicenseExpr, LicenseParseError> {
        let expr = self.parse_primary()?;
        
        if self.match_keyword("WITH") {
            let exception = self.parse_identifier()?;
            if let LicenseExpr::Simple(license) = expr {
                return Ok(LicenseExpr::WithException { license, exception });
            } else {
                return Err(LicenseParseError::InvalidWithClause);
            }
        }
        
        Ok(expr)
    }
    
    fn parse_primary(&mut self) -> Result<LicenseExpr, LicenseParseError> {
        self.skip_whitespace();
        
        if self.match_char('(') {
            let expr = self.parse_or()?;
            if !self.match_char(')') {
                return Err(LicenseParseError::UnmatchedParenthesis);
            }
            Ok(expr)
        } else {
            let id = self.parse_identifier()?;
            Ok(LicenseExpr::Simple(id))
        }
    }
    
    fn parse_identifier(&mut self) -> Result<String, LicenseParseError> {
        self.skip_whitespace();
        
        let start = self.pos;
        while self.pos < self.input.len() {
            let c = self.input[self.pos..].chars().next().unwrap();
            if c.is_alphanumeric() || c == '-' || c == '.' || c == '+' {
                self.pos += c.len_utf8();
            } else {
                break;
            }
        }
        
        if self.pos == start {
            return Err(LicenseParseError::ExpectedIdentifier);
        }
        
        Ok(self.input[start..self.pos].to_string())
    }
    
    fn skip_whitespace(&mut self) {
        while self.pos < self.input.len() {
            let c = self.input[self.pos..].chars().next().unwrap();
            if c.is_whitespace() {
                self.pos += c.len_utf8();
            } else {
                break;
            }
        }
    }
    
    fn match_keyword(&mut self, keyword: &str) -> bool {
        self.skip_whitespace();
        if self.input[self.pos..].starts_with(keyword) {
            let after = self.pos + keyword.len();
            // Make sure it's not part of a longer identifier
            if after >= self.input.len() || 
               !self.input[after..].chars().next().unwrap().is_alphanumeric() {
                self.pos = after;
                return true;
            }
        }
        false
    }
    
    fn match_char(&mut self, c: char) -> bool {
        self.skip_whitespace();
        if self.input[self.pos..].starts_with(c) {
            self.pos += c.len_utf8();
            true
        } else {
            false
        }
    }
}

/// License expression parse error
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LicenseParseError {
    ExpectedIdentifier,
    UnmatchedParenthesis,
    InvalidWithClause,
    UnexpectedToken,
}

impl std::fmt::Display for LicenseParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ExpectedIdentifier => write!(f, "expected license identifier"),
            Self::UnmatchedParenthesis => write!(f, "unmatched parenthesis"),
            Self::InvalidWithClause => write!(f, "invalid WITH clause"),
            Self::UnexpectedToken => write!(f, "unexpected token"),
        }
    }
}

impl std::error::Error for LicenseParseError {}

// ═══════════════════════════════════════════════════════════════
// LICENSE POLICY ENGINE
// ═══════════════════════════════════════════════════════════════

/// License compliance policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePolicy {
    /// Policy name
    pub name: String,
    /// Policy description
    pub description: Option<String>,
    /// Allowed licenses (whitelist)
    pub allowed: HashSet<String>,
    /// Denied licenses (blacklist)
    pub denied: HashSet<String>,
    /// Allowed categories
    pub allowed_categories: HashSet<LicenseCategory>,
    /// Denied categories
    pub denied_categories: HashSet<LicenseCategory>,
    /// Allow copyleft
    pub allow_copyleft: bool,
    /// Allow network copyleft (AGPL)
    pub allow_network_copyleft: bool,
    /// Require OSI approved
    pub require_osi_approved: bool,
    /// Allow unknown licenses
    pub allow_unknown: bool,
}

impl Default for LicensePolicy {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            description: None,
            allowed: HashSet::new(),
            denied: HashSet::new(),
            allowed_categories: [
                LicenseCategory::Permissive,
                LicenseCategory::PublicDomain,
            ].into_iter().collect(),
            denied_categories: HashSet::new(),
            allow_copyleft: true,
            allow_network_copyleft: false,
            require_osi_approved: false,
            allow_unknown: false,
        }
    }
}

impl LicensePolicy {
    /// Create a permissive-only policy
    pub fn permissive_only() -> Self {
        Self {
            name: "permissive-only".to_string(),
            description: Some("Only allow permissive and public domain licenses".to_string()),
            allowed_categories: [
                LicenseCategory::Permissive,
                LicenseCategory::PublicDomain,
            ].into_iter().collect(),
            allow_copyleft: false,
            allow_network_copyleft: false,
            ..Default::default()
        }
    }
    
    /// Create an enterprise-friendly policy
    pub fn enterprise() -> Self {
        let mut denied = HashSet::new();
        denied.insert("AGPL-3.0-only".to_string());
        denied.insert("AGPL-3.0-or-later".to_string());
        denied.insert("GPL-3.0-only".to_string());
        denied.insert("GPL-3.0-or-later".to_string());
        denied.insert("SSPL-1.0".to_string());
        denied.insert("Commons-Clause".to_string());
        
        Self {
            name: "enterprise".to_string(),
            description: Some("Enterprise-friendly license policy".to_string()),
            denied,
            allow_copyleft: true, // Weak copyleft OK (LGPL, MPL)
            allow_network_copyleft: false,
            require_osi_approved: true,
            ..Default::default()
        }
    }
}

/// Result of license policy validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyValidationResult {
    /// Is the package compliant?
    pub compliant: bool,
    /// Policy that was checked
    pub policy_name: String,
    /// Violations found
    pub violations: Vec<LicenseViolation>,
    /// Warnings (non-blocking issues)
    pub warnings: Vec<String>,
    /// Detected license expression
    pub detected_license: Option<String>,
}

/// A license policy violation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseViolation {
    /// Violation type
    pub violation_type: ViolationType,
    /// License ID that caused the violation
    pub license_id: String,
    /// Human-readable reason
    pub reason: String,
    /// Severity
    pub severity: ViolationSeverity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ViolationType {
    DeniedLicense,
    DeniedCategory,
    CopyleftNotAllowed,
    NetworkCopyleftNotAllowed,
    NotOsiApproved,
    UnknownLicense,
    DeprecatedLicense,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ViolationSeverity {
    Error,
    Warning,
    Info,
}

/// License policy validator
pub struct LicensePolicyValidator {
    /// License database
    license_db: LicenseDatabase,
}

impl LicensePolicyValidator {
    pub fn new() -> Self {
        Self {
            license_db: LicenseDatabase::default(),
        }
    }
    
    /// Validate a license expression against a policy
    pub fn validate(
        &self,
        license_expr: &str,
        policy: &LicensePolicy,
    ) -> PolicyValidationResult {
        let mut violations = Vec::new();
        let mut warnings = Vec::new();
        
        // Parse the license expression
        let parsed = match LicenseExpr::parse(license_expr) {
            Ok(expr) => expr,
            Err(e) => {
                violations.push(LicenseViolation {
                    violation_type: ViolationType::UnknownLicense,
                    license_id: license_expr.to_string(),
                    reason: format!("Failed to parse license expression: {}", e),
                    severity: ViolationSeverity::Error,
                });
                return PolicyValidationResult {
                    compliant: false,
                    policy_name: policy.name.clone(),
                    violations,
                    warnings,
                    detected_license: Some(license_expr.to_string()),
                };
            }
        };
        
        // Get all licenses in the expression
        let license_ids = parsed.all_license_ids();
        
        for license_id in &license_ids {
            // Check if explicitly denied
            if policy.denied.contains(license_id) {
                violations.push(LicenseViolation {
                    violation_type: ViolationType::DeniedLicense,
                    license_id: license_id.clone(),
                    reason: format!("License '{}' is explicitly denied by policy", license_id),
                    severity: ViolationSeverity::Error,
                });
                continue;
            }
            
            // Look up license info
            if let Some(info) = self.license_db.get(license_id) {
                // Check deprecated
                if info.deprecated {
                    warnings.push(format!("License '{}' is deprecated", license_id));
                }
                
                // Check category
                if policy.denied_categories.contains(&info.category) {
                    violations.push(LicenseViolation {
                        violation_type: ViolationType::DeniedCategory,
                        license_id: license_id.clone(),
                        reason: format!(
                            "License category '{}' is denied by policy",
                            info.category.as_str()
                        ),
                        severity: ViolationSeverity::Error,
                    });
                }
                
                // Check copyleft
                if !policy.allow_copyleft && matches!(info.copyleft, CopyleftType::Strong | CopyleftType::Weak) {
                    violations.push(LicenseViolation {
                        violation_type: ViolationType::CopyleftNotAllowed,
                        license_id: license_id.clone(),
                        reason: format!(
                            "Copyleft license '{}' not allowed by policy",
                            license_id
                        ),
                        severity: ViolationSeverity::Error,
                    });
                }
                
                // Check network copyleft
                if !policy.allow_network_copyleft && info.copyleft == CopyleftType::Network {
                    violations.push(LicenseViolation {
                        violation_type: ViolationType::NetworkCopyleftNotAllowed,
                        license_id: license_id.clone(),
                        reason: format!(
                            "Network copyleft license '{}' not allowed by policy",
                            license_id
                        ),
                        severity: ViolationSeverity::Error,
                    });
                }
                
                // Check OSI approved
                if policy.require_osi_approved && !info.osi_approved {
                    violations.push(LicenseViolation {
                        violation_type: ViolationType::NotOsiApproved,
                        license_id: license_id.clone(),
                        reason: format!("License '{}' is not OSI approved", license_id),
                        severity: ViolationSeverity::Error,
                    });
                }
            } else if !policy.allow_unknown {
                violations.push(LicenseViolation {
                    violation_type: ViolationType::UnknownLicense,
                    license_id: license_id.clone(),
                    reason: format!("Unknown license '{}'", license_id),
                    severity: ViolationSeverity::Error,
                });
            } else {
                warnings.push(format!("Unknown license '{}' - manual review recommended", license_id));
            }
        }
        
        PolicyValidationResult {
            compliant: violations.is_empty(),
            policy_name: policy.name.clone(),
            violations,
            warnings,
            detected_license: Some(license_expr.to_string()),
        }
    }
}

impl Default for LicensePolicyValidator {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════
// LICENSE DATABASE
// ═══════════════════════════════════════════════════════════════

/// Database of known SPDX licenses
pub struct LicenseDatabase {
    licenses: HashMap<String, LicenseInfo>,
}

impl Default for LicenseDatabase {
    fn default() -> Self {
        let mut db = Self {
            licenses: HashMap::new(),
        };
        db.load_common_licenses();
        db
    }
}

impl LicenseDatabase {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn get(&self, id: &str) -> Option<&LicenseInfo> {
        self.licenses.get(id)
    }
    
    pub fn all(&self) -> impl Iterator<Item = &LicenseInfo> {
        self.licenses.values()
    }
    
    fn load_common_licenses(&mut self) {
        // Permissive licenses
        self.add_license(LicenseInfo {
            id: "MIT".to_string(),
            name: "MIT License".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::Permissive,
            reference: "https://spdx.org/licenses/MIT.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "Apache-2.0".to_string(),
            name: "Apache License 2.0".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::Permissive,
            reference: "https://spdx.org/licenses/Apache-2.0.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "BSD-2-Clause".to_string(),
            name: "BSD 2-Clause \"Simplified\" License".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::Permissive,
            reference: "https://spdx.org/licenses/BSD-2-Clause.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "BSD-3-Clause".to_string(),
            name: "BSD 3-Clause \"New\" or \"Revised\" License".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::Permissive,
            reference: "https://spdx.org/licenses/BSD-3-Clause.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "ISC".to_string(),
            name: "ISC License".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::Permissive,
            reference: "https://spdx.org/licenses/ISC.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "Unlicense".to_string(),
            name: "The Unlicense".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::PublicDomain,
            reference: "https://spdx.org/licenses/Unlicense.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "CC0-1.0".to_string(),
            name: "Creative Commons Zero v1.0 Universal".to_string(),
            osi_approved: false,
            fsf_libre: true,
            copyleft: CopyleftType::None,
            category: LicenseCategory::PublicDomain,
            reference: "https://spdx.org/licenses/CC0-1.0.html".to_string(),
            deprecated: false,
        });
        
        // Weak copyleft licenses
        self.add_license(LicenseInfo {
            id: "LGPL-2.1-only".to_string(),
            name: "GNU Lesser General Public License v2.1 only".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::Weak,
            category: LicenseCategory::Copyleft,
            reference: "https://spdx.org/licenses/LGPL-2.1-only.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "LGPL-3.0-only".to_string(),
            name: "GNU Lesser General Public License v3.0 only".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::Weak,
            category: LicenseCategory::Copyleft,
            reference: "https://spdx.org/licenses/LGPL-3.0-only.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "MPL-2.0".to_string(),
            name: "Mozilla Public License 2.0".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::Weak,
            category: LicenseCategory::Copyleft,
            reference: "https://spdx.org/licenses/MPL-2.0.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "EPL-2.0".to_string(),
            name: "Eclipse Public License 2.0".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::Weak,
            category: LicenseCategory::Copyleft,
            reference: "https://spdx.org/licenses/EPL-2.0.html".to_string(),
            deprecated: false,
        });
        
        // Strong copyleft licenses
        self.add_license(LicenseInfo {
            id: "GPL-2.0-only".to_string(),
            name: "GNU General Public License v2.0 only".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::Strong,
            category: LicenseCategory::Copyleft,
            reference: "https://spdx.org/licenses/GPL-2.0-only.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "GPL-3.0-only".to_string(),
            name: "GNU General Public License v3.0 only".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::Strong,
            category: LicenseCategory::Copyleft,
            reference: "https://spdx.org/licenses/GPL-3.0-only.html".to_string(),
            deprecated: false,
        });
        
        // Network copyleft
        self.add_license(LicenseInfo {
            id: "AGPL-3.0-only".to_string(),
            name: "GNU Affero General Public License v3.0 only".to_string(),
            osi_approved: true,
            fsf_libre: true,
            copyleft: CopyleftType::Network,
            category: LicenseCategory::Copyleft,
            reference: "https://spdx.org/licenses/AGPL-3.0-only.html".to_string(),
            deprecated: false,
        });
        
        // Source-available / Proprietary
        self.add_license(LicenseInfo {
            id: "SSPL-1.0".to_string(),
            name: "Server Side Public License, v 1".to_string(),
            osi_approved: false,
            fsf_libre: false,
            copyleft: CopyleftType::Network,
            category: LicenseCategory::Proprietary,
            reference: "https://spdx.org/licenses/SSPL-1.0.html".to_string(),
            deprecated: false,
        });
        
        self.add_license(LicenseInfo {
            id: "BSL-1.0".to_string(),
            name: "Business Source License 1.1".to_string(),
            osi_approved: false,
            fsf_libre: false,
            copyleft: CopyleftType::None,
            category: LicenseCategory::Proprietary,
            reference: "https://spdx.org/licenses/BSL-1.0.html".to_string(),
            deprecated: false,
        });
    }
    
    fn add_license(&mut self, info: LicenseInfo) {
        self.licenses.insert(info.id.clone(), info);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_simple() {
        let expr = LicenseExpr::parse("MIT").unwrap();
        assert_eq!(expr, LicenseExpr::Simple("MIT".to_string()));
    }
    
    #[test]
    fn test_parse_with_exception() {
        let expr = LicenseExpr::parse("GPL-2.0-only WITH Classpath-exception-2.0").unwrap();
        assert_eq!(expr, LicenseExpr::WithException {
            license: "GPL-2.0-only".to_string(),
            exception: "Classpath-exception-2.0".to_string(),
        });
    }
    
    #[test]
    fn test_parse_or() {
        let expr = LicenseExpr::parse("MIT OR Apache-2.0").unwrap();
        assert!(matches!(expr, LicenseExpr::Or(_, _)));
        
        let licenses = expr.all_licenses();
        assert!(licenses.contains(&"MIT"));
        assert!(licenses.contains(&"Apache-2.0"));
    }
    
    #[test]
    fn test_parse_and() {
        let expr = LicenseExpr::parse("MIT AND Apache-2.0").unwrap();
        assert!(matches!(expr, LicenseExpr::And(_, _)));
    }
    
    #[test]
    fn test_parse_complex() {
        let expr = LicenseExpr::parse("(MIT OR Apache-2.0) AND BSD-3-Clause").unwrap();
        let licenses = expr.all_licenses();
        assert_eq!(licenses.len(), 3);
    }
    
    #[test]
    fn test_is_satisfied_by() {
        let expr = LicenseExpr::parse("MIT OR Apache-2.0").unwrap();
        
        let mut allowed: HashSet<String> = HashSet::new();
        allowed.insert("MIT".to_string());
        
        assert!(expr.is_satisfied_by(&allowed));
        
        allowed.clear();
        allowed.insert("GPL-3.0-only".to_string());
        
        assert!(!expr.is_satisfied_by(&allowed));
    }
    
    #[test]
    fn test_policy_validation() {
        let validator = LicensePolicyValidator::new();
        let policy = LicensePolicy::permissive_only();
        
        // MIT should pass
        let result = validator.validate("MIT", &policy);
        assert!(result.compliant);
        
        // GPL should fail
        let result = validator.validate("GPL-3.0-only", &policy);
        assert!(!result.compliant);
    }
    
    #[test]
    fn test_enterprise_policy() {
        let validator = LicensePolicyValidator::new();
        let policy = LicensePolicy::enterprise();
        
        // MIT should pass
        let result = validator.validate("MIT", &policy);
        assert!(result.compliant);
        
        // AGPL should fail
        let result = validator.validate("AGPL-3.0-only", &policy);
        assert!(!result.compliant);
        assert!(!result.violations.is_empty());
    }
}

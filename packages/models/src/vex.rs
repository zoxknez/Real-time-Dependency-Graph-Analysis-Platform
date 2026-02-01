//! VEX (Vulnerability Exploitability eXchange) Implementation
//!
//! Based on CycloneDX VEX specification for communicating the exploitability
//! of vulnerabilities in the context of specific products.
//!
//! Reference: https://cyclonedx.org/capabilities/vex/

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

// ═══════════════════════════════════════════════════════════════════════════
// VEX STATUS
// ═══════════════════════════════════════════════════════════════════════════

/// VEX analysis status as defined by CISA VEX specification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VexStatus {
    /// Not yet determined whether the vulnerability affects the product
    NotAffected,
    /// The vulnerability may affect the product but has not been confirmed
    Affected,
    /// The vulnerability affects the product but has been fixed
    Fixed,
    /// The vulnerability is still under investigation
    UnderInvestigation,
}

impl VexStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            VexStatus::NotAffected => "not_affected",
            VexStatus::Affected => "affected",
            VexStatus::Fixed => "fixed",
            VexStatus::UnderInvestigation => "under_investigation",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            VexStatus::NotAffected => "Not Affected",
            VexStatus::Affected => "Affected",
            VexStatus::Fixed => "Fixed",
            VexStatus::UnderInvestigation => "Under Investigation",
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VEX JUSTIFICATION (for NotAffected status)
// ═══════════════════════════════════════════════════════════════════════════

/// Justification for why a vulnerability does not affect a product
/// Based on CISA VEX Use Case document
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VexJustification {
    /// The code is not present in the product
    ComponentNotPresent,
    /// The vulnerable code is present but cannot be executed
    VulnerableCodeNotPresent,
    /// The vulnerable code is present but cannot be reached
    VulnerableCodeNotInExecutePath,
    /// The vulnerable code requires a configuration that is not used
    VulnerableCodeCannotBeControlledByAdversary,
    /// Inline mitigations already prevent exploitation
    InlineMitigationsAlreadyExist,
}

impl VexJustification {
    pub fn as_str(&self) -> &'static str {
        match self {
            VexJustification::ComponentNotPresent => "component_not_present",
            VexJustification::VulnerableCodeNotPresent => "vulnerable_code_not_present",
            VexJustification::VulnerableCodeNotInExecutePath => "vulnerable_code_not_in_execute_path",
            VexJustification::VulnerableCodeCannotBeControlledByAdversary => "vulnerable_code_cannot_be_controlled_by_adversary",
            VexJustification::InlineMitigationsAlreadyExist => "inline_mitigations_already_exist",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            VexJustification::ComponentNotPresent => 
                "The vulnerable component is not present in the product",
            VexJustification::VulnerableCodeNotPresent => 
                "The product uses the component but does not include the vulnerable code",
            VexJustification::VulnerableCodeNotInExecutePath => 
                "The vulnerable code is present but cannot be executed in the product's context",
            VexJustification::VulnerableCodeCannotBeControlledByAdversary => 
                "The vulnerable code requires specific conditions that cannot be achieved by an adversary",
            VexJustification::InlineMitigationsAlreadyExist => 
                "The product has inline mitigations that prevent exploitation of the vulnerability",
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VEX IMPACT STATEMENT
// ═══════════════════════════════════════════════════════════════════════════

/// Impact statement for affected vulnerabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexImpactStatement {
    /// Brief description of impact
    pub summary: String,
    /// Detailed technical impact description
    pub details: Option<String>,
    /// CVSS vector (if different from original)
    pub adjusted_cvss: Option<String>,
    /// Adjusted severity
    pub adjusted_severity: Option<VexSeverity>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum VexSeverity {
    Critical,
    High,
    Medium,
    Low,
    None,
    Unknown,
}

// ═══════════════════════════════════════════════════════════════════════════
// VEX ACTION STATEMENT (for Affected status)
// ═══════════════════════════════════════════════════════════════════════════

/// Recommended action for affected vulnerabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexActionStatement {
    /// Type of action
    pub action_type: VexActionType,
    /// Description of the action
    pub description: String,
    /// Target version/release with fix
    pub target_release: Option<String>,
    /// Workaround steps if available
    pub workaround: Option<String>,
    /// Estimated fix date
    pub estimated_fix_date: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VexActionType {
    /// Apply available update
    Update,
    /// Apply workaround
    Workaround,
    /// No action possible, accept risk
    None,
    /// Mitigation available
    Mitigation,
}

// ═══════════════════════════════════════════════════════════════════════════
// VEX STATEMENT
// ═══════════════════════════════════════════════════════════════════════════

/// A VEX statement about a specific vulnerability in a specific product
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexStatement {
    /// Unique identifier for this statement
    pub id: String,
    /// Vulnerability being assessed (CVE, GHSA, etc.)
    pub vulnerability_id: String,
    /// Product/component being assessed
    pub product: VexProduct,
    /// Exploitability status
    pub status: VexStatus,
    /// Justification (required when status is NotAffected)
    pub justification: Option<VexJustification>,
    /// Impact statement (for Affected status)
    pub impact: Option<VexImpactStatement>,
    /// Recommended action (for Affected status)
    pub action: Option<VexActionStatement>,
    /// Statement timestamp
    pub timestamp: DateTime<Utc>,
    /// Statement author/supplier
    pub supplier: VexSupplier,
    /// Additional notes
    pub notes: Option<String>,
    /// Source of analysis
    pub analysis_source: Option<String>,
    /// First issued timestamp
    pub first_issued: Option<DateTime<Utc>>,
    /// Last updated timestamp
    pub last_updated: Option<DateTime<Utc>>,
}

/// Product being assessed in VEX statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexProduct {
    /// Product identifier (PURL, CPE, or custom)
    pub id: String,
    /// Product name
    pub name: String,
    /// Product version
    pub version: String,
    /// Package URL (PURL)
    pub purl: Option<String>,
    /// CPE identifier
    pub cpe: Option<String>,
    /// SBOM reference
    pub sbom_ref: Option<String>,
}

/// Supplier/issuer of VEX statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexSupplier {
    /// Supplier name
    pub name: String,
    /// Contact URL
    pub url: Option<String>,
    /// Contact email
    pub email: Option<String>,
}

// ═══════════════════════════════════════════════════════════════════════════
// VEX DOCUMENT
// ═══════════════════════════════════════════════════════════════════════════

/// Complete VEX document containing multiple statements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexDocument {
    /// Document format identifier
    #[serde(rename = "@context")]
    pub context: String,
    /// Document identifier
    pub id: String,
    /// Document format version
    pub version: String,
    /// Author/publisher
    pub author: VexSupplier,
    /// Document timestamp
    pub timestamp: DateTime<Utc>,
    /// VEX statements
    pub statements: Vec<VexStatement>,
    /// Metadata
    pub metadata: Option<VexMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexMetadata {
    /// Lifecycle phase (development, release, etc.)
    pub lifecycle: Option<String>,
    /// Tool that generated the VEX
    pub tooling: Option<String>,
    /// Related SBOMs
    pub related_sboms: Vec<String>,
}

impl VexDocument {
    /// Create a new empty VEX document
    pub fn new(id: impl Into<String>, author: VexSupplier) -> Self {
        Self {
            context: "https://cyclonedx.org/schema/bom/1.5".to_string(),
            id: id.into(),
            version: "1.0".to_string(),
            author,
            timestamp: Utc::now(),
            statements: Vec::new(),
            metadata: None,
        }
    }

    /// Add a statement to the document
    pub fn add_statement(&mut self, statement: VexStatement) {
        self.statements.push(statement);
    }

    /// Find statements for a specific vulnerability
    pub fn find_by_vulnerability(&self, vuln_id: &str) -> Vec<&VexStatement> {
        self.statements
            .iter()
            .filter(|s| s.vulnerability_id == vuln_id)
            .collect()
    }

    /// Find statements for a specific product
    pub fn find_by_product(&self, product_id: &str) -> Vec<&VexStatement> {
        self.statements
            .iter()
            .filter(|s| s.product.id == product_id)
            .collect()
    }

    /// Get statistics about the VEX document
    pub fn statistics(&self) -> VexStatistics {
        let mut by_status: HashMap<VexStatus, usize> = HashMap::new();
        let mut by_justification: HashMap<VexJustification, usize> = HashMap::new();

        for statement in &self.statements {
            *by_status.entry(statement.status).or_insert(0) += 1;
            if let Some(justification) = statement.justification {
                *by_justification.entry(justification).or_insert(0) += 1;
            }
        }

        VexStatistics {
            total_statements: self.statements.len(),
            not_affected_count: *by_status.get(&VexStatus::NotAffected).unwrap_or(&0),
            affected_count: *by_status.get(&VexStatus::Affected).unwrap_or(&0),
            fixed_count: *by_status.get(&VexStatus::Fixed).unwrap_or(&0),
            under_investigation_count: *by_status.get(&VexStatus::UnderInvestigation).unwrap_or(&0),
            by_status,
            by_justification,
        }
    }

    /// Convert to CycloneDX JSON format
    pub fn to_cyclonedx_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

/// VEX document statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VexStatistics {
    pub total_statements: usize,
    pub not_affected_count: usize,
    pub affected_count: usize,
    pub fixed_count: usize,
    pub under_investigation_count: usize,
    pub by_status: HashMap<VexStatus, usize>,
    pub by_justification: HashMap<VexJustification, usize>,
}

// ═══════════════════════════════════════════════════════════════════════════
// VEX ANALYZER
// ═══════════════════════════════════════════════════════════════════════════

/// VEX analyzer for determining exploitability
pub struct VexAnalyzer {
    /// Known VEX documents
    documents: Vec<VexDocument>,
    /// Cache of vulnerability -> VEX status mappings
    cache: HashMap<(String, String), VexStatement>,
}

impl VexAnalyzer {
    pub fn new() -> Self {
        Self {
            documents: Vec::new(),
            cache: HashMap::new(),
        }
    }

    /// Add a VEX document to the analyzer
    pub fn add_document(&mut self, document: VexDocument) {
        // Update cache
        for statement in &document.statements {
            let key = (statement.vulnerability_id.clone(), statement.product.id.clone());
            self.cache.insert(key, statement.clone());
        }
        self.documents.push(document);
    }

    /// Look up VEX status for a vulnerability/product pair
    pub fn lookup(&self, vulnerability_id: &str, product_id: &str) -> Option<&VexStatement> {
        let key = (vulnerability_id.to_string(), product_id.to_string());
        self.cache.get(&key)
    }

    /// Determine if a vulnerability is exploitable for a product
    pub fn is_exploitable(&self, vulnerability_id: &str, product_id: &str) -> VexExploitability {
        match self.lookup(vulnerability_id, product_id) {
            Some(statement) => match statement.status {
                VexStatus::NotAffected => VexExploitability::NotExploitable {
                    justification: statement.justification,
                },
                VexStatus::Affected => VexExploitability::Exploitable {
                    impact: statement.impact.clone(),
                    action: statement.action.clone(),
                },
                VexStatus::Fixed => VexExploitability::Fixed {
                    fixed_version: statement.action.as_ref().and_then(|a| a.target_release.clone()),
                },
                VexStatus::UnderInvestigation => VexExploitability::Unknown,
            },
            None => VexExploitability::Unknown,
        }
    }

    /// Generate a VEX statement for a vulnerability based on analysis
    pub fn generate_statement(
        &self,
        vulnerability_id: &str,
        product: VexProduct,
        analysis_result: VexAnalysisResult,
        supplier: VexSupplier,
    ) -> VexStatement {
        let (status, justification, impact, action) = match analysis_result {
            VexAnalysisResult::NotAffected { reason } => {
                (VexStatus::NotAffected, Some(reason), None, None)
            }
            VexAnalysisResult::Affected { impact, action } => {
                (VexStatus::Affected, None, Some(impact), Some(action))
            }
            VexAnalysisResult::Fixed { version } => {
                (
                    VexStatus::Fixed,
                    None,
                    None,
                    Some(VexActionStatement {
                        action_type: VexActionType::Update,
                        description: format!("Fixed in version {}", version),
                        target_release: Some(version),
                        workaround: None,
                        estimated_fix_date: None,
                    }),
                )
            }
            VexAnalysisResult::UnderInvestigation => {
                (VexStatus::UnderInvestigation, None, None, None)
            }
        };

        VexStatement {
            id: format!("VEX-{}-{}", vulnerability_id, product.id),
            vulnerability_id: vulnerability_id.to_string(),
            product,
            status,
            justification,
            impact,
            action,
            timestamp: Utc::now(),
            supplier,
            notes: None,
            analysis_source: Some("automated-analysis".to_string()),
            first_issued: Some(Utc::now()),
            last_updated: Some(Utc::now()),
        }
    }
}

impl Default for VexAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of VEX exploitability check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VexExploitability {
    /// Not exploitable in this product context
    NotExploitable {
        justification: Option<VexJustification>,
    },
    /// Exploitable - action required
    Exploitable {
        impact: Option<VexImpactStatement>,
        action: Option<VexActionStatement>,
    },
    /// Fixed in specified version
    Fixed {
        fixed_version: Option<String>,
    },
    /// Unknown - no VEX data available
    Unknown,
}

/// VEX analysis result for generating statements
pub enum VexAnalysisResult {
    NotAffected { reason: VexJustification },
    Affected { impact: VexImpactStatement, action: VexActionStatement },
    Fixed { version: String },
    UnderInvestigation,
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn test_supplier() -> VexSupplier {
        VexSupplier {
            name: "Test Vendor".to_string(),
            url: Some("https://example.com".to_string()),
            email: Some("security@example.com".to_string()),
        }
    }

    fn test_product() -> VexProduct {
        VexProduct {
            id: "pkg:npm/lodash@4.17.21".to_string(),
            name: "lodash".to_string(),
            version: "4.17.21".to_string(),
            purl: Some("pkg:npm/lodash@4.17.21".to_string()),
            cpe: None,
            sbom_ref: None,
        }
    }

    #[test]
    fn test_vex_document_creation() {
        let mut doc = VexDocument::new("test-vex-001", test_supplier());
        
        let statement = VexStatement {
            id: "VEX-CVE-2021-23337-lodash".to_string(),
            vulnerability_id: "CVE-2021-23337".to_string(),
            product: test_product(),
            status: VexStatus::NotAffected,
            justification: Some(VexJustification::VulnerableCodeNotInExecutePath),
            impact: None,
            action: None,
            timestamp: Utc::now(),
            supplier: test_supplier(),
            notes: Some("The zipObjectDeep function is not used in our application".to_string()),
            analysis_source: Some("manual-review".to_string()),
            first_issued: Some(Utc::now()),
            last_updated: Some(Utc::now()),
        };
        
        doc.add_statement(statement);
        
        assert_eq!(doc.statements.len(), 1);
        
        let stats = doc.statistics();
        assert_eq!(stats.not_affected_count, 1);
        assert_eq!(stats.affected_count, 0);
    }

    #[test]
    fn test_vex_analyzer() {
        let mut analyzer = VexAnalyzer::new();
        
        let mut doc = VexDocument::new("test-vex-002", test_supplier());
        doc.add_statement(VexStatement {
            id: "VEX-CVE-2021-23337-lodash".to_string(),
            vulnerability_id: "CVE-2021-23337".to_string(),
            product: test_product(),
            status: VexStatus::NotAffected,
            justification: Some(VexJustification::VulnerableCodeNotInExecutePath),
            impact: None,
            action: None,
            timestamp: Utc::now(),
            supplier: test_supplier(),
            notes: None,
            analysis_source: None,
            first_issued: None,
            last_updated: None,
        });
        
        analyzer.add_document(doc);
        
        let exploitability = analyzer.is_exploitable(
            "CVE-2021-23337",
            "pkg:npm/lodash@4.17.21",
        );
        
        assert!(matches!(exploitability, VexExploitability::NotExploitable { .. }));
    }

    #[test]
    fn test_vex_json_serialization() {
        let mut doc = VexDocument::new("test-vex-003", test_supplier());
        doc.metadata = Some(VexMetadata {
            lifecycle: Some("release".to_string()),
            tooling: Some("randomapp-vex-generator/1.0.0".to_string()),
            related_sboms: vec!["sbom-123.json".to_string()],
        });
        
        let json = doc.to_cyclonedx_json().unwrap();
        assert!(json.contains("cyclonedx"));
        assert!(json.contains("test-vex-003"));
    }

    #[test]
    fn test_justification_descriptions() {
        assert!(!VexJustification::ComponentNotPresent.description().is_empty());
        assert!(!VexJustification::VulnerableCodeNotPresent.description().is_empty());
        assert!(!VexJustification::VulnerableCodeNotInExecutePath.description().is_empty());
        assert!(!VexJustification::VulnerableCodeCannotBeControlledByAdversary.description().is_empty());
        assert!(!VexJustification::InlineMitigationsAlreadyExist.description().is_empty());
    }
}

//! SBOM (Software Bill of Materials) Generation
//!
//! Supports both SPDX 2.3 and CycloneDX 1.5 formats
//! Based on: https://spdx.github.io/spdx-spec/v2.3/
//!           https://cyclonedx.org/docs/1.5/json/

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/// SBOM format selection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SbomFormat {
    /// SPDX 2.3 format (ISO/IEC 5962:2021)
    Spdx,
    /// CycloneDX 1.5 format (OWASP standard)
    CycloneDx,
}

/// Component type in the SBOM
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ComponentType {
    Application,
    Framework,
    Library,
    Container,
    OperatingSystem,
    Device,
    Firmware,
    File,
}

/// Package reference for SBOM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SbomPackage {
    /// Package identifier (e.g., "npm:lodash")
    pub id: String,
    /// Package name
    pub name: String,
    /// Package version
    pub version: String,
    /// Package ecosystem
    pub ecosystem: String,
    /// PURL (Package URL) - standardized identifier
    pub purl: String,
    /// SPDX License expression (e.g., "MIT", "Apache-2.0 OR MIT")
    pub license: Option<String>,
    /// Package description
    pub description: Option<String>,
    /// Package homepage URL
    pub homepage: Option<String>,
    /// SHA-256 hash of the package
    pub sha256: Option<String>,
    /// Component type
    pub component_type: ComponentType,
    /// Is this a direct dependency?
    pub is_direct: bool,
    /// CPE (Common Platform Enumeration) identifier
    pub cpe: Option<String>,
}

/// Dependency relationship
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SbomDependency {
    /// Source package reference (the dependent)
    pub from: String,
    /// Target package reference (the dependency)
    pub to: String,
    /// Relationship type
    pub relationship: DependencyRelation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DependencyRelation {
    DependsOn,
    DevDependsOn,
    OptionalDependsOn,
    BuildDependsOn,
}

/// Vulnerability reference in SBOM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SbomVulnerability {
    pub id: String,
    pub source: String, // "NVD", "GHSA", "OSV"
    pub severity: String,
    pub description: String,
    pub affected_packages: Vec<String>,
    pub fixed_version: Option<String>,
    pub cvss_score: Option<f32>,
    pub published_at: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// SPDX 2.3 FORMAT
// ═══════════════════════════════════════════════════════════════

/// SPDX 2.3 Document (Clause 6)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxDocument {
    /// SPDX version (always "SPDX-2.3")
    pub spdx_version: String,
    /// Data license (always "CC0-1.0")
    pub data_license: String,
    /// SPDX document identifier
    #[serde(rename = "SPDXID")]
    pub spdx_id: String,
    /// Document name
    pub name: String,
    /// Document namespace (unique URI)
    pub document_namespace: String,
    /// Document creation info
    pub creation_info: SpdxCreationInfo,
    /// Packages in the SBOM (Clause 7)
    pub packages: Vec<SpdxPackage>,
    /// Files in the SBOM (Clause 8)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub files: Vec<SpdxFile>,
    /// Relationships between elements (Clause 11)
    pub relationships: Vec<SpdxRelationship>,
    /// External document references
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub external_document_refs: Vec<SpdxExternalDocRef>,
    /// Annotations (Clause 12)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub annotations: Vec<SpdxAnnotation>,
}

/// SPDX Creation Info (Clause 6.1-6.8)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxCreationInfo {
    /// Creation timestamp (ISO 8601)
    pub created: String,
    /// Creators (Tool, Person, Organization)
    pub creators: Vec<String>,
    /// SPDX spec version used for license list
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_list_version: Option<String>,
    /// Comment about document creation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// SPDX Package (Clause 7)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxPackage {
    /// Unique package identifier
    #[serde(rename = "SPDXID")]
    pub spdx_id: String,
    /// Package name
    pub name: String,
    /// Package version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_info: Option<String>,
    /// Package download location
    pub download_location: String,
    /// Files analyzed flag
    pub files_analyzed: bool,
    /// Package checksum
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub checksums: Vec<SpdxChecksum>,
    /// Concluded license (SPDX expression)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_concluded: Option<String>,
    /// Declared license
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_declared: Option<String>,
    /// Copyright text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright_text: Option<String>,
    /// Package description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Package homepage
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// External references (PURL, CPE, etc.)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub external_refs: Vec<SpdxExternalRef>,
    /// Package supplier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier: Option<String>,
    /// Package originator
    #[serde(skip_serializing_if = "Option::is_none")]
    pub originator: Option<String>,
    /// Primary package purpose
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_package_purpose: Option<String>,
}

/// SPDX Checksum
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxChecksum {
    pub algorithm: String,
    pub checksum_value: String,
}

/// SPDX External Reference (Clause 7.21)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxExternalRef {
    pub reference_category: String,
    pub reference_type: String,
    pub reference_locator: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// SPDX File (Clause 8)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxFile {
    #[serde(rename = "SPDXID")]
    pub spdx_id: String,
    pub file_name: String,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub checksums: Vec<SpdxChecksum>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_concluded: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright_text: Option<String>,
}

/// SPDX Relationship (Clause 11)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxRelationship {
    pub spdx_element_id: String,
    pub relationship_type: String,
    pub related_spdx_element: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// SPDX External Document Reference
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxExternalDocRef {
    pub external_document_id: String,
    pub spdx_document: String,
    pub checksum: SpdxChecksum,
}

/// SPDX Annotation (Clause 12)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpdxAnnotation {
    pub annotation_date: String,
    pub annotation_type: String,
    pub annotator: String,
    pub comment: String,
}

// ═══════════════════════════════════════════════════════════════
// CYCLONEDX 1.5 FORMAT
// ═══════════════════════════════════════════════════════════════

/// CycloneDX 1.5 BOM
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CycloneDxBom {
    /// BOM format identifier (always "CycloneDX")
    pub bom_format: String,
    /// Spec version (always "1.5")
    pub spec_version: String,
    /// Serial number (UUID URN)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial_number: Option<String>,
    /// BOM version
    pub version: i32,
    /// Metadata about the BOM
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<CdxMetadata>,
    /// Components in the BOM
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub components: Vec<CdxComponent>,
    /// Services (API endpoints, etc.)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub services: Vec<CdxService>,
    /// Dependency relationships
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub dependencies: Vec<CdxDependency>,
    /// Vulnerabilities
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub vulnerabilities: Vec<CdxVulnerability>,
    /// Compositions
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub compositions: Vec<CdxComposition>,
    /// External references
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub external_references: Vec<CdxExternalReference>,
}

/// CycloneDX Metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxMetadata {
    /// Timestamp of BOM generation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    /// Tools used to generate the BOM
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<CdxTools>,
    /// Authors of the BOM
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub authors: Vec<CdxAuthor>,
    /// Component that the BOM represents
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<Box<CdxComponent>>,
    /// Manufacturer of the component
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manufacture: Option<CdxOrganization>,
    /// Supplier of the component
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier: Option<CdxOrganization>,
    /// Licenses
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub licenses: Vec<CdxLicenseChoice>,
}

/// CycloneDX Tools (new format in 1.5)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxTools {
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub components: Vec<CdxComponent>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub services: Vec<CdxService>,
}

/// CycloneDX Author
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxAuthor {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

/// CycloneDX Organization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxOrganization {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub url: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub contact: Vec<CdxAuthor>,
}

/// CycloneDX Component
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxComponent {
    /// Component type (library, framework, application, etc.)
    #[serde(rename = "type")]
    pub component_type: String,
    /// MIME type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    /// BOM reference (unique within BOM)
    #[serde(rename = "bom-ref", skip_serializing_if = "Option::is_none")]
    pub bom_ref: Option<String>,
    /// Supplier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier: Option<CdxOrganization>,
    /// Author
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    /// Publisher
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    /// Group (namespace, e.g., Maven groupId)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    /// Component name
    pub name: String,
    /// Component version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Scope (required, optional, excluded)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// Hashes
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub hashes: Vec<CdxHash>,
    /// Licenses
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub licenses: Vec<CdxLicenseChoice>,
    /// Copyright
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright: Option<String>,
    /// CPE
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpe: Option<String>,
    /// PURL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purl: Option<String>,
    /// SWID tag
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swid: Option<CdxSwid>,
    /// External references
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub external_references: Vec<CdxExternalReference>,
    /// Properties (custom key-value pairs)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub properties: Vec<CdxProperty>,
}

/// CycloneDX Hash
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxHash {
    #[serde(rename = "alg")]
    pub algorithm: String,
    pub content: String,
}

/// CycloneDX License Choice (either license or expression)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxLicenseChoice {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<CdxLicense>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
}

/// CycloneDX License
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxLicense {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// CycloneDX SWID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxSwid {
    pub tag_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// CycloneDX External Reference
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxExternalReference {
    #[serde(rename = "type")]
    pub ref_type: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// CycloneDX Property
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxProperty {
    pub name: String,
    pub value: String,
}

/// CycloneDX Dependency
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxDependency {
    #[serde(rename = "ref")]
    pub reference: String,
    #[serde(rename = "dependsOn", skip_serializing_if = "Vec::is_empty", default)]
    pub depends_on: Vec<String>,
}

/// CycloneDX Service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxService {
    #[serde(rename = "bom-ref", skip_serializing_if = "Option::is_none")]
    pub bom_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<CdxOrganization>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub endpoints: Vec<String>,
}

/// CycloneDX Vulnerability
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxVulnerability {
    #[serde(rename = "bom-ref", skip_serializing_if = "Option::is_none")]
    pub bom_ref: Option<String>,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<CdxVulnSource>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub references: Vec<CdxVulnReference>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ratings: Vec<CdxVulnRating>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub cwes: Vec<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub advisories: Vec<CdxAdvisory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub affects: Vec<CdxAffectedComponent>,
}

/// CycloneDX Vulnerability Source
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxVulnSource {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// CycloneDX Vulnerability Reference
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxVulnReference {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<CdxVulnSource>,
}

/// CycloneDX Vulnerability Rating
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxVulnRating {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<CdxVulnSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vector: Option<String>,
}

/// CycloneDX Advisory
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxAdvisory {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub url: String,
}

/// CycloneDX Affected Component
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxAffectedComponent {
    #[serde(rename = "ref")]
    pub reference: String,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub versions: Vec<CdxAffectedVersion>,
}

/// CycloneDX Affected Version
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxAffectedVersion {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// CycloneDX Composition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxComposition {
    pub aggregate: String,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub assemblies: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub dependencies: Vec<String>,
}

// ═══════════════════════════════════════════════════════════════
// SBOM GENERATOR
// ═══════════════════════════════════════════════════════════════

/// SBOM Generator configuration
#[derive(Debug, Clone)]
pub struct SbomGeneratorConfig {
    /// Tool name
    pub tool_name: String,
    /// Tool version
    pub tool_version: String,
    /// Tool vendor
    pub tool_vendor: String,
    /// Include vulnerabilities in SBOM
    pub include_vulnerabilities: bool,
    /// Include file hashes
    pub include_hashes: bool,
}

impl Default for SbomGeneratorConfig {
    fn default() -> Self {
        Self {
            tool_name: "randomapp-sbom-generator".to_string(),
            tool_version: env!("CARGO_PKG_VERSION").to_string(),
            tool_vendor: "RandomApp".to_string(),
            include_vulnerabilities: true,
            include_hashes: true,
        }
    }
}

/// SBOM Generator
pub struct SbomGenerator {
    config: SbomGeneratorConfig,
}

impl SbomGenerator {
    pub fn new(config: SbomGeneratorConfig) -> Self {
        Self { config }
    }
    
    /// Generate SPDX 2.3 document from packages
    pub fn generate_spdx(
        &self,
        project_name: &str,
        project_version: &str,
        packages: &[SbomPackage],
        dependencies: &[SbomDependency],
        _vulnerabilities: &[SbomVulnerability],
    ) -> SpdxDocument {
        let now = Utc::now();
        let doc_uuid = Uuid::new_v4();
        let namespace = format!(
            "https://randomapp.dev/sbom/{}-{}-{}",
            project_name.replace(' ', "-").to_lowercase(),
            project_version,
            doc_uuid
        );
        
        // Convert packages to SPDX format
        let spdx_packages: Vec<SpdxPackage> = packages
            .iter()
            .map(|pkg| self.to_spdx_package(pkg))
            .collect();
        
        // Build relationships
        let mut relationships = vec![
            // Document describes root package
            SpdxRelationship {
                spdx_element_id: "SPDXRef-DOCUMENT".to_string(),
                relationship_type: "DESCRIBES".to_string(),
                related_spdx_element: format!("SPDXRef-Package-{}", sanitize_id(project_name)),
                comment: None,
            },
        ];
        
        // Add dependency relationships
        for dep in dependencies {
            relationships.push(SpdxRelationship {
                spdx_element_id: format!("SPDXRef-Package-{}", sanitize_id(&dep.from)),
                relationship_type: match dep.relationship {
                    DependencyRelation::DependsOn => "DEPENDS_ON",
                    DependencyRelation::DevDependsOn => "DEV_DEPENDENCY_OF",
                    DependencyRelation::OptionalDependsOn => "OPTIONAL_DEPENDENCY_OF",
                    DependencyRelation::BuildDependsOn => "BUILD_TOOL_OF",
                }.to_string(),
                related_spdx_element: format!("SPDXRef-Package-{}", sanitize_id(&dep.to)),
                comment: None,
            });
        }
        
        SpdxDocument {
            spdx_version: "SPDX-2.3".to_string(),
            data_license: "CC0-1.0".to_string(),
            spdx_id: "SPDXRef-DOCUMENT".to_string(),
            name: format!("{} SBOM", project_name),
            document_namespace: namespace,
            creation_info: SpdxCreationInfo {
                created: now.to_rfc3339(),
                creators: vec![
                    format!("Tool: {}-{}", self.config.tool_name, self.config.tool_version),
                    format!("Organization: {}", self.config.tool_vendor),
                ],
                license_list_version: Some("3.19".to_string()),
                comment: Some("Generated by RandomApp SBOM Generator".to_string()),
            },
            packages: spdx_packages,
            files: vec![],
            relationships,
            external_document_refs: vec![],
            annotations: vec![],
        }
    }
    
    /// Generate CycloneDX 1.5 BOM from packages
    pub fn generate_cyclonedx(
        &self,
        project_name: &str,
        project_version: &str,
        packages: &[SbomPackage],
        dependencies: &[SbomDependency],
        vulnerabilities: &[SbomVulnerability],
    ) -> CycloneDxBom {
        let now = Utc::now();
        let serial = Uuid::new_v4();
        
        // Convert packages to CycloneDX format
        let components: Vec<CdxComponent> = packages
            .iter()
            .map(|pkg| self.to_cdx_component(pkg))
            .collect();
        
        // Build dependency graph
        let mut dep_map: HashMap<String, Vec<String>> = HashMap::new();
        for dep in dependencies {
            dep_map
                .entry(dep.from.clone())
                .or_default()
                .push(dep.to.clone());
        }
        
        let cdx_deps: Vec<CdxDependency> = dep_map
            .into_iter()
            .map(|(from, deps)| CdxDependency {
                reference: from,
                depends_on: deps,
            })
            .collect();
        
        // Convert vulnerabilities
        let cdx_vulns: Vec<CdxVulnerability> = if self.config.include_vulnerabilities {
            vulnerabilities
                .iter()
                .map(|v| self.to_cdx_vulnerability(v))
                .collect()
        } else {
            vec![]
        };
        
        // Build tool component
        let tool_component = CdxComponent {
            component_type: "application".to_string(),
            mime_type: None,
            bom_ref: Some("tool-randomapp".to_string()),
            supplier: None,
            author: None,
            publisher: Some(self.config.tool_vendor.clone()),
            group: None,
            name: self.config.tool_name.clone(),
            version: Some(self.config.tool_version.clone()),
            description: Some("SBOM Generator".to_string()),
            scope: None,
            hashes: vec![],
            licenses: vec![],
            copyright: None,
            cpe: None,
            purl: None,
            swid: None,
            external_references: vec![],
            properties: vec![],
        };
        
        CycloneDxBom {
            bom_format: "CycloneDX".to_string(),
            spec_version: "1.5".to_string(),
            serial_number: Some(format!("urn:uuid:{}", serial)),
            version: 1,
            metadata: Some(CdxMetadata {
                timestamp: Some(now.to_rfc3339()),
                tools: Some(CdxTools {
                    components: vec![tool_component],
                    services: vec![],
                }),
                authors: vec![CdxAuthor {
                    name: Some(self.config.tool_vendor.clone()),
                    email: None,
                }],
                component: Some(Box::new(CdxComponent {
                    component_type: "application".to_string(),
                    mime_type: None,
                    bom_ref: Some(project_name.to_string()),
                    supplier: None,
                    author: None,
                    publisher: None,
                    group: None,
                    name: project_name.to_string(),
                    version: Some(project_version.to_string()),
                    description: None,
                    scope: None,
                    hashes: vec![],
                    licenses: vec![],
                    copyright: None,
                    cpe: None,
                    purl: None,
                    swid: None,
                    external_references: vec![],
                    properties: vec![],
                })),
                manufacture: None,
                supplier: None,
                licenses: vec![],
            }),
            components,
            services: vec![],
            dependencies: cdx_deps,
            vulnerabilities: cdx_vulns,
            compositions: vec![CdxComposition {
                aggregate: "complete".to_string(),
                assemblies: vec![],
                dependencies: vec![],
            }],
            external_references: vec![],
        }
    }
    
    fn to_spdx_package(&self, pkg: &SbomPackage) -> SpdxPackage {
        let mut external_refs = vec![
            SpdxExternalRef {
                reference_category: "PACKAGE-MANAGER".to_string(),
                reference_type: "purl".to_string(),
                reference_locator: pkg.purl.clone(),
                comment: None,
            },
        ];
        
        if let Some(ref cpe) = pkg.cpe {
            external_refs.push(SpdxExternalRef {
                reference_category: "SECURITY".to_string(),
                reference_type: "cpe23Type".to_string(),
                reference_locator: cpe.clone(),
                comment: None,
            });
        }
        
        let checksums = if self.config.include_hashes {
            pkg.sha256.as_ref().map(|h| vec![SpdxChecksum {
                algorithm: "SHA256".to_string(),
                checksum_value: h.clone(),
            }]).unwrap_or_default()
        } else {
            vec![]
        };
        
        SpdxPackage {
            spdx_id: format!("SPDXRef-Package-{}", sanitize_id(&pkg.id)),
            name: pkg.name.clone(),
            version_info: Some(pkg.version.clone()),
            download_location: format!("https://registry.{}.org/{}", pkg.ecosystem.to_lowercase(), pkg.name),
            files_analyzed: false,
            checksums,
            license_concluded: pkg.license.clone(),
            license_declared: pkg.license.clone(),
            copyright_text: Some("NOASSERTION".to_string()),
            description: pkg.description.clone(),
            homepage: pkg.homepage.clone(),
            external_refs,
            supplier: None,
            originator: None,
            primary_package_purpose: Some("LIBRARY".to_string()),
        }
    }
    
    fn to_cdx_component(&self, pkg: &SbomPackage) -> CdxComponent {
        let hashes = if self.config.include_hashes {
            pkg.sha256.as_ref().map(|h| vec![CdxHash {
                algorithm: "SHA-256".to_string(),
                content: h.clone(),
            }]).unwrap_or_default()
        } else {
            vec![]
        };
        
        let licenses = pkg.license.as_ref().map(|l| {
            vec![CdxLicenseChoice {
                license: None,
                expression: Some(l.clone()),
            }]
        }).unwrap_or_default();
        
        CdxComponent {
            component_type: match pkg.component_type {
                ComponentType::Library => "library",
                ComponentType::Framework => "framework",
                ComponentType::Application => "application",
                ComponentType::Container => "container",
                ComponentType::OperatingSystem => "operating-system",
                ComponentType::Device => "device",
                ComponentType::Firmware => "firmware",
                ComponentType::File => "file",
            }.to_string(),
            mime_type: None,
            bom_ref: Some(pkg.id.clone()),
            supplier: None,
            author: None,
            publisher: None,
            group: None,
            name: pkg.name.clone(),
            version: Some(pkg.version.clone()),
            description: pkg.description.clone(),
            scope: Some(if pkg.is_direct { "required" } else { "optional" }.to_string()),
            hashes,
            licenses,
            copyright: None,
            cpe: pkg.cpe.clone(),
            purl: Some(pkg.purl.clone()),
            swid: None,
            external_references: vec![],
            properties: vec![
                CdxProperty {
                    name: "ecosystem".to_string(),
                    value: pkg.ecosystem.clone(),
                },
                CdxProperty {
                    name: "dependency:direct".to_string(),
                    value: pkg.is_direct.to_string(),
                },
            ],
        }
    }
    
    fn to_cdx_vulnerability(&self, vuln: &SbomVulnerability) -> CdxVulnerability {
        CdxVulnerability {
            bom_ref: Some(vuln.id.clone()),
            id: vuln.id.clone(),
            source: Some(CdxVulnSource {
                name: Some(vuln.source.clone()),
                url: None,
            }),
            references: vec![],
            ratings: vuln.cvss_score.map(|s| vec![CdxVulnRating {
                source: Some(CdxVulnSource {
                    name: Some("NVD".to_string()),
                    url: None,
                }),
                score: Some(s as f64),
                severity: Some(vuln.severity.clone()),
                method: Some("CVSSv3".to_string()),
                vector: None,
            }]).unwrap_or_default(),
            cwes: vec![],
            description: Some(vuln.description.clone()),
            detail: None,
            recommendation: vuln.fixed_version.as_ref().map(|v| format!("Upgrade to version {}", v)),
            advisories: vec![],
            created: None,
            published: vuln.published_at.clone(),
            updated: None,
            affects: vuln.affected_packages.iter().map(|p| CdxAffectedComponent {
                reference: p.clone(),
                versions: vec![],
            }).collect(),
        }
    }
}

/// Sanitize string for use as SPDX ID
fn sanitize_id(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '.' { c } else { '-' })
        .collect()
}

/// Generate PURL (Package URL) from package info
pub fn generate_purl(ecosystem: &str, name: &str, version: &str) -> String {
    let pkg_type = match ecosystem.to_lowercase().as_str() {
        "npm" => "npm",
        "pypi" | "py_pi" => "pypi",
        "cargo" | "crates" => "cargo",
        "maven" => "maven",
        "nuget" | "nu_get" => "nuget",
        "go" | "golang" => "golang",
        _ => "generic",
    };
    
    format!("pkg:{}/{}@{}", pkg_type, name, version)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_generate_purl() {
        assert_eq!(
            generate_purl("npm", "lodash", "4.17.21"),
            "pkg:npm/lodash@4.17.21"
        );
        assert_eq!(
            generate_purl("pypi", "requests", "2.28.0"),
            "pkg:pypi/requests@2.28.0"
        );
    }
    
    #[test]
    fn test_sanitize_id() {
        assert_eq!(sanitize_id("npm:lodash"), "npm-lodash");
        assert_eq!(sanitize_id("@angular/core"), "-angular-core");
    }
    
    #[test]
    fn test_spdx_generation() {
        let generator = SbomGenerator::new(SbomGeneratorConfig::default());
        let packages = vec![
            SbomPackage {
                id: "npm:lodash".to_string(),
                name: "lodash".to_string(),
                version: "4.17.21".to_string(),
                ecosystem: "npm".to_string(),
                purl: "pkg:npm/lodash@4.17.21".to_string(),
                license: Some("MIT".to_string()),
                description: Some("Lodash library".to_string()),
                homepage: Some("https://lodash.com".to_string()),
                sha256: None,
                component_type: ComponentType::Library,
                is_direct: true,
                cpe: None,
            },
        ];
        
        let doc = generator.generate_spdx("test-app", "1.0.0", &packages, &[], &[]);
        
        assert_eq!(doc.spdx_version, "SPDX-2.3");
        assert_eq!(doc.packages.len(), 1);
        assert_eq!(doc.packages[0].name, "lodash");
    }
    
    #[test]
    fn test_cyclonedx_generation() {
        let generator = SbomGenerator::new(SbomGeneratorConfig::default());
        let packages = vec![
            SbomPackage {
                id: "npm:express".to_string(),
                name: "express".to_string(),
                version: "4.18.2".to_string(),
                ecosystem: "npm".to_string(),
                purl: "pkg:npm/express@4.18.2".to_string(),
                license: Some("MIT".to_string()),
                description: None,
                homepage: None,
                sha256: None,
                component_type: ComponentType::Framework,
                is_direct: true,
                cpe: None,
            },
        ];
        
        let bom = generator.generate_cyclonedx("test-app", "1.0.0", &packages, &[], &[]);
        
        assert_eq!(bom.bom_format, "CycloneDX");
        assert_eq!(bom.spec_version, "1.5");
        assert_eq!(bom.components.len(), 1);
        assert_eq!(bom.components[0].name, "express");
    }
}

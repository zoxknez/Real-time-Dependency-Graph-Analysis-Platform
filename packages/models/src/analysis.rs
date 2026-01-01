//! Analysis domain models

use serde::{Deserialize, Serialize};

/// Symbol extracted from source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub id: String,
    pub name: String,
    pub qualified_path: String,
    pub kind: SymbolKind,
    pub visibility: Visibility,
    pub signature: String,
    pub location: SourceLocation,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<String>,
    pub documentation: Option<String>,
    pub doc_embedding: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceLocation {
    pub file_path: String,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    pub param_type: String,
    pub optional: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SymbolKind {
    Function,
    Class,
    Method,
    Constant,
    Variable,
    Type,
    Interface,
    Enum,
    Module,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Visibility {
    Public,
    Private,
    Protected,
    Internal,
}

/// Public API of a package version
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicApi {
    pub package_id: String,
    pub version: String,
    pub symbols: Vec<Symbol>,
    pub analyzed_at_ts: i64,
}

/// API diff between versions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiDiff {
    pub package_id: String,
    pub from_version: String,
    pub to_version: String,
    pub changes: Vec<SymbolChange>,
    pub summary: DiffSummary,
    pub analyzed_at_ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolChange {
    pub symbol_id: String,
    pub symbol_path: String,
    pub change_type: super::package::ChangeType,
    pub before: Option<Symbol>,
    pub after: Option<Symbol>,
    pub breaking_confidence: f32,
    pub change_reason: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiffSummary {
    pub added_count: i32,
    pub removed_count: i32,
    pub modified_count: i32,
    pub breaking_count: i32,
    pub overall_breaking_risk: f32,
}

/// Analysis job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisJob {
    pub job_id: String,
    pub package_id: String,
    pub version: String,
    pub status: AnalysisStatus,
    pub created_at_ts: i64,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnalysisStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Skipped,
}

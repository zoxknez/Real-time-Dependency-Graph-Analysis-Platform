//! AST Parser using Tree-sitter
//!
//! Provides language-agnostic parsing and public API extraction
//! for Rust, JavaScript/TypeScript, Python, Go, and Java.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;
use tracing::{debug, info, instrument, warn};

// ═══════════════════════════════════════════════════════════════
// LANGUAGE DEFINITION
// ═══════════════════════════════════════════════════════════════

/// Supported languages for AST parsing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Language {
    JavaScript,
    TypeScript,
    Python,
    Rust,
    Go,
    Java,
}

impl Language {
    /// Detect language from file extension
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "js" | "jsx" | "mjs" | "cjs" => Some(Language::JavaScript),
            "ts" | "tsx" | "mts" | "cts" => Some(Language::TypeScript),
            "py" | "pyi" => Some(Language::Python),
            "rs" => Some(Language::Rust),
            "go" => Some(Language::Go),
            "java" => Some(Language::Java),
            _ => None,
        }
    }

    /// Get tree-sitter language (uses file extension for TSX vs TS).
    fn tree_sitter_language_for_file(&self, file_path: &str) -> tree_sitter::Language {
        let ext = Path::new(file_path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        match self {
            Language::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            Language::TypeScript => {
                if ext == "tsx" {
                    tree_sitter_typescript::LANGUAGE_TSX.into()
                } else {
                    tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()
                }
            }
            Language::Python => tree_sitter_python::LANGUAGE.into(),
            Language::Rust => tree_sitter_rust::LANGUAGE.into(),
            Language::Go => tree_sitter_go::LANGUAGE.into(),
            Language::Java => tree_sitter_java::LANGUAGE.into(),
        }
    }

    /// Backwards-compatible default (assumes non-TSX for TypeScript).
    fn tree_sitter_language(&self) -> tree_sitter::Language {
        self.tree_sitter_language_for_file("")
    }

    /// Get all supported extensions
    pub fn all_extensions() -> &'static [&'static str] {
        &[
            "js", "jsx", "mjs", "ts", "tsx", "py", "pyi", "rs", "go", "java",
        ]
    }
}

// ═══════════════════════════════════════════════════════════════
// SYMBOL TYPES
// ═══════════════════════════════════════════════════════════════

/// Represents a symbol extracted from source code
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExtractedSymbol {
    /// Symbol name
    pub name: String,
    /// Fully qualified path (module::class::method)
    pub qualified_path: String,
    /// Symbol kind
    pub kind: SymbolKind,
    /// Visibility level
    pub visibility: Visibility,
    /// Normalized signature (for comparison)
    pub signature: String,
    /// Raw signature (original)
    pub raw_signature: String,
    /// Start line (1-indexed)
    pub start_line: u32,
    /// End line (1-indexed)
    pub end_line: u32,
    /// Documentation comment
    pub documentation: Option<String>,
    /// Parameters (for functions/methods)
    pub parameters: Vec<ParameterInfo>,
    /// Return type (for functions)
    pub return_type: Option<String>,
    /// Generic parameters
    pub generics: Vec<String>,
    /// Decorators/annotations
    pub annotations: Vec<String>,
    /// Is exported (JS/TS specific)
    pub is_exported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParameterInfo {
    pub name: String,
    pub type_annotation: Option<String>,
    pub default_value: Option<String>,
    pub is_optional: bool,
    pub is_variadic: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SymbolKind {
    Function,
    Class,
    Method,
    Constant,
    Variable,
    Type,
    Interface,
    Enum,
    EnumVariant,
    Struct,
    Trait,
    Module,
    Field,
    Property,
}

impl SymbolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Function => "function",
            Self::Class => "class",
            Self::Method => "method",
            Self::Constant => "constant",
            Self::Variable => "variable",
            Self::Type => "type",
            Self::Interface => "interface",
            Self::Enum => "enum",
            Self::EnumVariant => "enum_variant",
            Self::Struct => "struct",
            Self::Trait => "trait",
            Self::Module => "module",
            Self::Field => "field",
            Self::Property => "property",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Visibility {
    Public,
    Private,
    Protected,
    Internal,
    Crate, // Rust pub(crate)
    Super, // Rust pub(super)
}

impl Visibility {
    /// Check if this visibility exposes the symbol publicly
    pub fn is_public(&self) -> bool {
        matches!(self, Visibility::Public)
    }

    /// Numeric level for comparison
    pub fn level(&self) -> u8 {
        match self {
            Visibility::Public => 5,
            Visibility::Protected => 4,
            Visibility::Crate => 3,
            Visibility::Internal => 3,
            Visibility::Super => 2,
            Visibility::Private => 1,
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API SNAPSHOT
// ═══════════════════════════════════════════════════════════════

/// Represents the complete public API of a package version
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicApiSnapshot {
    /// Package identifier
    pub package_id: String,
    /// Version string
    pub version: String,
    /// All public symbols
    pub symbols: Vec<ExtractedSymbol>,
    /// Hash of the normalized API (for quick comparison)
    pub api_hash: String,
    /// Language breakdown
    pub language_stats: HashMap<Language, usize>,
    /// Total files parsed
    pub files_parsed: usize,
    /// Parse errors (non-fatal)
    pub parse_errors: Vec<String>,
}

impl PublicApiSnapshot {
    /// Create new snapshot
    pub fn new(package_id: String, version: String) -> Self {
        Self {
            package_id,
            version,
            symbols: Vec::new(),
            api_hash: String::new(),
            language_stats: HashMap::new(),
            files_parsed: 0,
            parse_errors: Vec::new(),
        }
    }

    /// Compute API hash
    pub fn compute_hash(&mut self) {
        use std::collections::BTreeMap;
        use std::hash::{Hash, Hasher};

        // Sort symbols for deterministic hash
        let mut sorted: BTreeMap<&str, &ExtractedSymbol> = BTreeMap::new();
        for sym in &self.symbols {
            sorted.insert(&sym.qualified_path, sym);
        }

        // Create canonical representation
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        for (path, sym) in sorted {
            path.hash(&mut hasher);
            sym.signature.hash(&mut hasher);
            (sym.kind as u8).hash(&mut hasher);
        }

        self.api_hash = format!("{:016x}", hasher.finish());
    }

    /// Get only public symbols
    pub fn public_symbols(&self) -> Vec<&ExtractedSymbol> {
        self.symbols
            .iter()
            .filter(|s| s.visibility.is_public())
            .collect()
    }
}

// ═══════════════════════════════════════════════════════════════
// PARSER POOL
// ═══════════════════════════════════════════════════════════════

/// Thread-local parser pool for each language
/// Tree-sitter parsers are not Send/Sync, so we use thread-local storage
pub struct ParserPool {
    timeout: Duration,
    max_file_size: usize,
}

impl ParserPool {
    /// Create new parser pool
    pub fn new(timeout: Duration, max_file_size: usize) -> Self {
        info!(
            "Initializing ParserPool with timeout={:?}, max_file_size={}",
            timeout, max_file_size
        );
        Self {
            timeout,
            max_file_size,
        }
    }

    /// Parse source code and extract public symbols
    #[instrument(skip(self, source), fields(lang = ?language, source_len = source.len()))]
    pub fn parse(
        &self,
        language: Language,
        source: &str,
        file_path: &str,
    ) -> Result<Vec<ExtractedSymbol>> {
        // Check file size
        if source.len() > self.max_file_size {
            debug!("File too large, skipping: {} bytes", source.len());
            return Ok(vec![]);
        }

        // Create parser for this thread
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&language.tree_sitter_language_for_file(file_path))
            .context("Failed to set parser language")?;

        // Parse source
        let tree = parser
            .parse(source, None)
            .ok_or_else(|| anyhow::anyhow!("Parse timeout or failure"))?;

        let root = tree.root_node();
        if root.has_error() {
            debug!("Parse tree has errors, continuing with partial results");
        }

        // Extract symbols based on language
        let symbols = match language {
            Language::Rust => self.extract_rust_symbols(&root, source, file_path),
            Language::JavaScript | Language::TypeScript => {
                self.extract_js_symbols(&root, source, file_path, language == Language::TypeScript)
            }
            Language::Python => self.extract_python_symbols(&root, source, file_path),
            Language::Go => self.extract_go_symbols(&root, source, file_path),
            Language::Java => self.extract_java_symbols(&root, source, file_path),
        };

        debug!(symbol_count = symbols.len(), "Extracted symbols");
        Ok(symbols)
    }

    // ─────────────────────────────────────────────────────────────
    // RUST EXTRACTION
    // ─────────────────────────────────────────────────────────────

    fn extract_rust_symbols(
        &self,
        root: &tree_sitter::Node,
        source: &str,
        file_path: &str,
    ) -> Vec<ExtractedSymbol> {
        let mut symbols = Vec::new();
        let mut cursor = root.walk();

        self.walk_rust_tree(&mut cursor, source, file_path, "", &mut symbols);
        symbols
    }

    fn walk_rust_tree(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        source: &str,
        file_path: &str,
        module_path: &str,
        symbols: &mut Vec<ExtractedSymbol>,
    ) {
        loop {
            let node = cursor.node();
            let kind = node.kind();

            match kind {
                "function_item" => {
                    if let Some(sym) =
                        self.parse_rust_function(&node, source, file_path, module_path)
                    {
                        symbols.push(sym);
                    }
                }
                "struct_item" => {
                    if let Some(sym) = self.parse_rust_struct(&node, source, file_path, module_path)
                    {
                        symbols.push(sym);
                    }
                }
                "enum_item" => {
                    if let Some(sym) = self.parse_rust_enum(&node, source, file_path, module_path) {
                        symbols.push(sym);
                    }
                }
                "trait_item" => {
                    if let Some(sym) = self.parse_rust_trait(&node, source, file_path, module_path)
                    {
                        symbols.push(sym);
                    }
                }
                "impl_item" => {
                    // Extract methods from impl blocks
                    self.extract_rust_impl_methods(&node, source, file_path, module_path, symbols);
                }
                "mod_item" => {
                    if let Some(name_node) = node.child_by_field_name("name") {
                        let mod_name = self.get_node_text(&name_node, source);
                        let new_path = if module_path.is_empty() {
                            mod_name.clone()
                        } else {
                            format!("{}::{}", module_path, mod_name)
                        };

                        // Recurse into module body
                        if let Some(body) = node.child_by_field_name("body") {
                            let mut mod_cursor = body.walk();
                            if mod_cursor.goto_first_child() {
                                self.walk_rust_tree(
                                    &mut mod_cursor,
                                    source,
                                    file_path,
                                    &new_path,
                                    symbols,
                                );
                            }
                        }
                    }
                }
                "const_item" | "static_item" => {
                    if let Some(sym) = self.parse_rust_const(
                        &node,
                        source,
                        file_path,
                        module_path,
                        kind == "static_item",
                    ) {
                        symbols.push(sym);
                    }
                }
                "type_alias" => {
                    if let Some(sym) =
                        self.parse_rust_type_alias(&node, source, file_path, module_path)
                    {
                        symbols.push(sym);
                    }
                }
                _ => {}
            }

            // Recurse into children
            if cursor.goto_first_child() {
                self.walk_rust_tree(cursor, source, file_path, module_path, symbols);
                cursor.goto_parent();
            }

            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }

    fn parse_rust_function(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);

        // Check visibility
        let visibility = self.get_rust_visibility(node, source);

        // Get parameters
        let params = node
            .child_by_field_name("parameters")
            .map(|p| self.parse_rust_parameters(&p, source))
            .unwrap_or_default();

        // Get return type
        let return_type = node.child_by_field_name("return_type").map(|r| {
            self.get_node_text(&r, source)
                .trim_start_matches("->")
                .trim()
                .to_string()
        });

        // Get generics
        let generics = node
            .child_by_field_name("type_parameters")
            .map(|g| self.parse_rust_generics(&g, source))
            .unwrap_or_default();

        // Build signature
        let param_str: Vec<String> = params
            .iter()
            .map(|p| {
                if let Some(ref t) = p.type_annotation {
                    format!("{}: {}", p.name, t)
                } else {
                    p.name.clone()
                }
            })
            .collect();
        let sig = format!(
            "fn {}({}){}",
            name,
            param_str.join(", "),
            return_type
                .as_ref()
                .map(|r| format!(" -> {}", r))
                .unwrap_or_default()
        );

        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}::{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Function,
            visibility,
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_rust_doc_comment(node, source),
            parameters: params,
            return_type,
            generics,
            annotations: vec![],
            is_exported: visibility.is_public(),
        })
    }

    fn parse_rust_struct(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);
        let visibility = self.get_rust_visibility(node, source);

        let generics = node
            .child_by_field_name("type_parameters")
            .map(|g| self.parse_rust_generics(&g, source))
            .unwrap_or_default();

        let sig = if generics.is_empty() {
            format!("struct {}", name)
        } else {
            format!("struct {}<{}>", name, generics.join(", "))
        };

        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}::{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Struct,
            visibility,
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_rust_doc_comment(node, source),
            parameters: vec![],
            return_type: None,
            generics,
            annotations: vec![],
            is_exported: visibility.is_public(),
        })
    }

    fn parse_rust_enum(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);
        let visibility = self.get_rust_visibility(node, source);

        let sig = format!("enum {}", name);
        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}::{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Enum,
            visibility,
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_rust_doc_comment(node, source),
            parameters: vec![],
            return_type: None,
            generics: vec![],
            annotations: vec![],
            is_exported: visibility.is_public(),
        })
    }

    fn parse_rust_trait(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);
        let visibility = self.get_rust_visibility(node, source);

        let sig = format!("trait {}", name);
        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}::{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Trait,
            visibility,
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_rust_doc_comment(node, source),
            parameters: vec![],
            return_type: None,
            generics: vec![],
            annotations: vec![],
            is_exported: visibility.is_public(),
        })
    }

    fn parse_rust_const(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
        is_static: bool,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);
        let visibility = self.get_rust_visibility(node, source);

        let type_node = node.child_by_field_name("type");
        let type_str = type_node.map(|t| self.get_node_text(&t, source));

        let keyword = if is_static { "static" } else { "const" };
        let sig = if let Some(t) = &type_str {
            format!("{} {}: {}", keyword, name, t)
        } else {
            format!("{} {}", keyword, name)
        };

        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}::{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Constant,
            visibility,
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_rust_doc_comment(node, source),
            parameters: vec![],
            return_type: type_str,
            generics: vec![],
            annotations: vec![],
            is_exported: visibility.is_public(),
        })
    }

    fn parse_rust_type_alias(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);
        let visibility = self.get_rust_visibility(node, source);

        let sig = format!("type {}", name);
        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}::{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Type,
            visibility,
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_rust_doc_comment(node, source),
            parameters: vec![],
            return_type: None,
            generics: vec![],
            annotations: vec![],
            is_exported: visibility.is_public(),
        })
    }

    fn extract_rust_impl_methods(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        file_path: &str,
        module_path: &str,
        symbols: &mut Vec<ExtractedSymbol>,
    ) {
        // Get type name for impl
        let type_name = node
            .child_by_field_name("type")
            .map(|t| self.get_node_text(&t, source))
            .unwrap_or_default();

        let impl_path = if module_path.is_empty() {
            type_name.clone()
        } else {
            format!("{}::{}", module_path, type_name)
        };

        // Find body and extract methods
        if let Some(body) = node.child_by_field_name("body") {
            let mut cursor = body.walk();
            if cursor.goto_first_child() {
                loop {
                    let child = cursor.node();
                    if child.kind() == "function_item" {
                        if let Some(mut sym) =
                            self.parse_rust_function(&child, source, file_path, &impl_path)
                        {
                            sym.kind = SymbolKind::Method;
                            symbols.push(sym);
                        }
                    }
                    if !cursor.goto_next_sibling() {
                        break;
                    }
                }
            }
        }
    }

    fn get_rust_visibility(&self, node: &tree_sitter::Node, source: &str) -> Visibility {
        // Look for visibility_modifier child
        let mut cursor = node.walk();
        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                if child.kind() == "visibility_modifier" {
                    let text = self.get_node_text(&child, source);
                    return match text.as_str() {
                        "pub" => Visibility::Public,
                        s if s.starts_with("pub(crate)") => Visibility::Crate,
                        s if s.starts_with("pub(super)") => Visibility::Super,
                        _ => Visibility::Public,
                    };
                }
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }
        Visibility::Private
    }

    fn get_rust_doc_comment(&self, node: &tree_sitter::Node, source: &str) -> Option<String> {
        // Look for preceding comment nodes
        let mut prev = node.prev_sibling();
        let mut docs = Vec::new();

        while let Some(p) = prev {
            if p.kind() == "line_comment" {
                let text = self.get_node_text(&p, source);
                if text.starts_with("///") || text.starts_with("//!") {
                    docs.push(text.trim_start_matches('/').trim().to_string());
                } else {
                    break;
                }
            } else if p.kind() == "block_comment" {
                let text = self.get_node_text(&p, source);
                if text.starts_with("/**") || text.starts_with("/*!") {
                    docs.push(
                        text.trim_start_matches('/')
                            .trim_matches('*')
                            .trim()
                            .to_string(),
                    );
                }
                break;
            } else {
                break;
            }
            prev = p.prev_sibling();
        }

        if docs.is_empty() {
            None
        } else {
            docs.reverse();
            Some(docs.join("\n"))
        }
    }

    fn parse_rust_parameters(&self, node: &tree_sitter::Node, source: &str) -> Vec<ParameterInfo> {
        let mut params = Vec::new();
        let mut cursor = node.walk();

        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                if child.kind() == "parameter" {
                    let pattern = child.child_by_field_name("pattern");
                    let type_node = child.child_by_field_name("type");

                    if let Some(pat) = pattern {
                        let name = self.get_node_text(&pat, source);
                        // Skip self parameters
                        if name != "self" && name != "&self" && name != "&mut self" {
                            params.push(ParameterInfo {
                                name,
                                type_annotation: type_node.map(|t| self.get_node_text(&t, source)),
                                default_value: None,
                                is_optional: false,
                                is_variadic: false,
                            });
                        }
                    }
                } else if child.kind() == "self_parameter" {
                    // Skip self
                }

                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }

        params
    }

    fn parse_rust_generics(&self, node: &tree_sitter::Node, source: &str) -> Vec<String> {
        let mut generics = Vec::new();
        let mut cursor = node.walk();

        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                if child.kind() == "type_identifier" || child.kind() == "lifetime" {
                    generics.push(self.get_node_text(&child, source));
                }
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }

        generics
    }

    // ─────────────────────────────────────────────────────────────
    // JAVASCRIPT/TYPESCRIPT EXTRACTION
    // ─────────────────────────────────────────────────────────────

    fn extract_js_symbols(
        &self,
        root: &tree_sitter::Node,
        source: &str,
        file_path: &str,
        is_typescript: bool,
    ) -> Vec<ExtractedSymbol> {
        let mut symbols = Vec::new();
        let mut cursor = root.walk();

        self.walk_js_tree(
            &mut cursor,
            source,
            file_path,
            "",
            &mut symbols,
            is_typescript,
        );
        symbols
    }

    fn walk_js_tree(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        source: &str,
        file_path: &str,
        module_path: &str,
        symbols: &mut Vec<ExtractedSymbol>,
        is_typescript: bool,
    ) {
        loop {
            let node = cursor.node();
            let kind = node.kind();

            match kind {
                "export_statement" => {
                    // Handle exports
                    if let Some(declaration) = node.child_by_field_name("declaration") {
                        self.extract_js_declaration(
                            &declaration,
                            source,
                            file_path,
                            module_path,
                            symbols,
                            true,
                            is_typescript,
                        );
                    }
                }
                "function_declaration" | "arrow_function" | "function" => {
                    if let Some(sym) =
                        self.parse_js_function(&node, source, file_path, module_path, false)
                    {
                        symbols.push(sym);
                    }
                }
                "class_declaration" => {
                    if let Some(sym) =
                        self.parse_js_class(&node, source, file_path, module_path, false)
                    {
                        symbols.push(sym);
                    }
                }
                "lexical_declaration" | "variable_declaration" => {
                    self.extract_js_variables(
                        &node,
                        source,
                        file_path,
                        module_path,
                        symbols,
                        false,
                    );
                }
                _ => {}
            }

            // Recurse
            if cursor.goto_first_child() {
                self.walk_js_tree(
                    cursor,
                    source,
                    file_path,
                    module_path,
                    symbols,
                    is_typescript,
                );
                cursor.goto_parent();
            }

            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }

    fn extract_js_declaration(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        file_path: &str,
        module_path: &str,
        symbols: &mut Vec<ExtractedSymbol>,
        is_exported: bool,
        _is_typescript: bool,
    ) {
        match node.kind() {
            "function_declaration" => {
                if let Some(mut sym) =
                    self.parse_js_function(node, source, file_path, module_path, is_exported)
                {
                    sym.is_exported = is_exported;
                    if is_exported {
                        sym.visibility = Visibility::Public;
                    }
                    symbols.push(sym);
                }
            }
            "class_declaration" => {
                if let Some(mut sym) =
                    self.parse_js_class(node, source, file_path, module_path, is_exported)
                {
                    sym.is_exported = is_exported;
                    if is_exported {
                        sym.visibility = Visibility::Public;
                    }
                    symbols.push(sym);
                }
            }
            "lexical_declaration" | "variable_declaration" => {
                self.extract_js_variables(
                    node,
                    source,
                    file_path,
                    module_path,
                    symbols,
                    is_exported,
                );
            }
            _ => {}
        }
    }

    fn parse_js_function(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
        is_exported: bool,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);

        let params = node
            .child_by_field_name("parameters")
            .map(|p| self.parse_js_parameters(&p, source))
            .unwrap_or_default();

        let param_str: Vec<String> = params.iter().map(|p| p.name.clone()).collect();
        let sig = format!("function {}({})", name, param_str.join(", "));

        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}.{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Function,
            visibility: if is_exported {
                Visibility::Public
            } else {
                Visibility::Private
            },
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_jsdoc_comment(node, source),
            parameters: params,
            return_type: None,
            generics: vec![],
            annotations: vec![],
            is_exported,
        })
    }

    fn parse_js_class(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
        is_exported: bool,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);

        let sig = format!("class {}", name);
        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}.{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Class,
            visibility: if is_exported {
                Visibility::Public
            } else {
                Visibility::Private
            },
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_jsdoc_comment(node, source),
            parameters: vec![],
            return_type: None,
            generics: vec![],
            annotations: vec![],
            is_exported,
        })
    }

    fn extract_js_variables(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        file_path: &str,
        module_path: &str,
        symbols: &mut Vec<ExtractedSymbol>,
        is_exported: bool,
    ) {
        let mut cursor = node.walk();
        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                if child.kind() == "variable_declarator" {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = self.get_node_text(&name_node, source);
                        let sig = format!("const {}", name);

                        let qualified_path = if module_path.is_empty() {
                            name.clone()
                        } else {
                            format!("{}.{}", module_path, name)
                        };

                        symbols.push(ExtractedSymbol {
                            name,
                            qualified_path,
                            kind: SymbolKind::Constant,
                            visibility: if is_exported {
                                Visibility::Public
                            } else {
                                Visibility::Private
                            },
                            signature: self.normalize_signature(&sig),
                            raw_signature: sig,
                            start_line: child.start_position().row as u32 + 1,
                            end_line: child.end_position().row as u32 + 1,
                            documentation: self.get_jsdoc_comment(&child, source),
                            parameters: vec![],
                            return_type: None,
                            generics: vec![],
                            annotations: vec![],
                            is_exported,
                        });
                    }
                }
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }
    }

    fn parse_js_parameters(&self, node: &tree_sitter::Node, source: &str) -> Vec<ParameterInfo> {
        let mut params = Vec::new();
        let mut cursor = node.walk();

        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                if child.kind() == "identifier" || child.kind() == "rest_pattern" {
                    let name = self.get_node_text(&child, source);
                    params.push(ParameterInfo {
                        name,
                        type_annotation: None,
                        default_value: None,
                        is_optional: false,
                        is_variadic: child.kind() == "rest_pattern",
                    });
                }
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }

        params
    }

    // ─────────────────────────────────────────────────────────────
    // PYTHON EXTRACTION
    // ─────────────────────────────────────────────────────────────

    fn extract_python_symbols(
        &self,
        root: &tree_sitter::Node,
        source: &str,
        file_path: &str,
    ) -> Vec<ExtractedSymbol> {
        let mut symbols = Vec::new();
        let mut cursor = root.walk();

        self.walk_python_tree(&mut cursor, source, file_path, "", &mut symbols);
        symbols
    }

    fn walk_python_tree(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        source: &str,
        file_path: &str,
        module_path: &str,
        symbols: &mut Vec<ExtractedSymbol>,
    ) {
        loop {
            let node = cursor.node();
            let kind = node.kind();

            match kind {
                "function_definition" => {
                    if let Some(sym) =
                        self.parse_python_function(&node, source, file_path, module_path)
                    {
                        symbols.push(sym);
                    }
                }
                "class_definition" => {
                    if let Some(sym) =
                        self.parse_python_class(&node, source, file_path, module_path)
                    {
                        symbols.push(sym);
                    }

                    // Extract methods
                    if let Some(body) = node.child_by_field_name("body") {
                        let class_name = node
                            .child_by_field_name("name")
                            .map(|n| self.get_node_text(&n, source))
                            .unwrap_or_default();
                        let new_path = if module_path.is_empty() {
                            class_name
                        } else {
                            format!("{}.{}", module_path, class_name)
                        };

                        let mut class_cursor = body.walk();
                        if class_cursor.goto_first_child() {
                            self.walk_python_tree(
                                &mut class_cursor,
                                source,
                                file_path,
                                &new_path,
                                symbols,
                            );
                        }
                    }
                }
                _ => {}
            }

            // Only recurse for top-level, not into function/class bodies (handled above)
            if kind != "function_definition"
                && kind != "class_definition"
                && cursor.goto_first_child()
            {
                self.walk_python_tree(cursor, source, file_path, module_path, symbols);
                cursor.goto_parent();
            }

            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }

    fn parse_python_function(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);

        // Skip private functions (start with _)
        let is_private = name.starts_with('_') && !name.starts_with("__");
        let is_dunder = name.starts_with("__") && name.ends_with("__");

        let params = node
            .child_by_field_name("parameters")
            .map(|p| self.parse_python_parameters(&p, source))
            .unwrap_or_default();

        let return_type = node
            .child_by_field_name("return_type")
            .map(|r| self.get_node_text(&r, source));

        let param_str: Vec<String> = params.iter().map(|p| p.name.clone()).collect();
        let sig = format!("def {}({})", name, param_str.join(", "));

        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}.{}", module_path, name)
        };

        let kind = if module_path.contains('.') {
            SymbolKind::Method
        } else {
            SymbolKind::Function
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind,
            visibility: if is_private {
                Visibility::Private
            } else {
                Visibility::Public
            },
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_python_docstring(node, source),
            parameters: params,
            return_type,
            generics: vec![],
            annotations: vec![],
            is_exported: !is_private,
        })
    }

    fn parse_python_class(
        &self,
        node: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
        module_path: &str,
    ) -> Option<ExtractedSymbol> {
        let name_node = node.child_by_field_name("name")?;
        let name = self.get_node_text(&name_node, source);

        let is_private = name.starts_with('_');
        let sig = format!("class {}", name);

        let qualified_path = if module_path.is_empty() {
            name.clone()
        } else {
            format!("{}.{}", module_path, name)
        };

        Some(ExtractedSymbol {
            name,
            qualified_path,
            kind: SymbolKind::Class,
            visibility: if is_private {
                Visibility::Private
            } else {
                Visibility::Public
            },
            signature: self.normalize_signature(&sig),
            raw_signature: sig,
            start_line: node.start_position().row as u32 + 1,
            end_line: node.end_position().row as u32 + 1,
            documentation: self.get_python_docstring(node, source),
            parameters: vec![],
            return_type: None,
            generics: vec![],
            annotations: vec![],
            is_exported: !is_private,
        })
    }

    fn parse_python_parameters(
        &self,
        node: &tree_sitter::Node,
        source: &str,
    ) -> Vec<ParameterInfo> {
        let mut params = Vec::new();
        let mut cursor = node.walk();

        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                match child.kind() {
                    "identifier" => {
                        let name = self.get_node_text(&child, source);
                        if name != "self" && name != "cls" {
                            params.push(ParameterInfo {
                                name,
                                type_annotation: None,
                                default_value: None,
                                is_optional: false,
                                is_variadic: false,
                            });
                        }
                    }
                    "typed_parameter" | "default_parameter" | "typed_default_parameter" => {
                        if let Some(name_node) = child.child(0) {
                            let name = self.get_node_text(&name_node, source);
                            if name != "self" && name != "cls" {
                                params.push(ParameterInfo {
                                    name,
                                    type_annotation: child
                                        .child_by_field_name("type")
                                        .map(|t| self.get_node_text(&t, source)),
                                    default_value: child
                                        .child_by_field_name("value")
                                        .map(|v| self.get_node_text(&v, source)),
                                    is_optional: child.kind().contains("default"),
                                    is_variadic: false,
                                });
                            }
                        }
                    }
                    "list_splat_pattern" => {
                        let name = self.get_node_text(&child, source);
                        params.push(ParameterInfo {
                            name: name.trim_start_matches('*').to_string(),
                            type_annotation: None,
                            default_value: None,
                            is_optional: true,
                            is_variadic: true,
                        });
                    }
                    _ => {}
                }

                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }

        params
    }

    fn get_python_docstring(&self, node: &tree_sitter::Node, source: &str) -> Option<String> {
        // Look for expression_statement with string as first child of body
        if let Some(body) = node.child_by_field_name("body") {
            if let Some(first_stmt) = body.child(0) {
                if first_stmt.kind() == "expression_statement" {
                    if let Some(expr) = first_stmt.child(0) {
                        if expr.kind() == "string" {
                            let text = self.get_node_text(&expr, source);
                            return Some(
                                text.trim_matches('"').trim_matches('\'').trim().to_string(),
                            );
                        }
                    }
                }
            }
        }
        None
    }

    fn get_jsdoc_comment(&self, node: &tree_sitter::Node, source: &str) -> Option<String> {
        let mut current = node.prev_sibling();
        while let Some(prev) = current {
            if prev.kind() == "comment" {
                let text = self.get_node_text(&prev, source);
                let trimmed = text.trim();
                if trimmed.starts_with("/**") {
                    let cleaned = trimmed.trim_start_matches("/**").trim_end_matches("*/");
                    let content = cleaned
                        .lines()
                        .map(|line| line.trim().trim_start_matches('*').trim())
                        .filter(|line| !line.is_empty())
                        .collect::<Vec<_>>()
                        .join("\n");
                    return if content.is_empty() {
                        None
                    } else {
                        Some(content)
                    };
                }
                if trimmed.starts_with("//") {
                    let content = trimmed.trim_start_matches("//").trim();
                    return if content.is_empty() {
                        None
                    } else {
                        Some(content.to_string())
                    };
                }
                return None;
            }
            current = prev.prev_sibling();
        }
        None
    }

    // ─────────────────────────────────────────────────────────────
    // GO EXTRACTION (Basic)
    // ─────────────────────────────────────────────────────────────

    fn extract_go_symbols(
        &self,
        root: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
    ) -> Vec<ExtractedSymbol> {
        let mut symbols = Vec::new();
        let mut cursor = root.walk();
        self.walk_go_tree(&mut cursor, source, &mut symbols);
        symbols
    }

    fn walk_go_tree(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        source: &str,
        symbols: &mut Vec<ExtractedSymbol>,
    ) {
        loop {
            let node = cursor.node();
            match node.kind() {
                "function_declaration" | "method_declaration" => {
                    let name = node
                        .child_by_field_name("name")
                        .map(|n| self.get_node_text(&n, source))
                        .unwrap_or_default();

                    if !name.is_empty() {
                        let visibility = if name
                            .chars()
                            .next()
                            .map(|c| c.is_ascii_uppercase())
                            .unwrap_or(false)
                        {
                            Visibility::Public
                        } else {
                            Visibility::Private
                        };

                        let qualified_path = if node.kind() == "method_declaration" {
                            let receiver = node
                                .child_by_field_name("receiver")
                                .map(|r| self.get_node_text(&r, source))
                                .unwrap_or_default();
                            if receiver.is_empty() {
                                name.clone()
                            } else {
                                format!(
                                    "{}.{}",
                                    receiver.replace(['\n', '\r', '\t', ' '], ""),
                                    name
                                )
                            }
                        } else {
                            name.clone()
                        };

                        let raw_signature = self.get_node_text(&node, source);
                        let signature = self.normalize_signature(&raw_signature);
                        let start_line = (node.start_position().row + 1) as u32;
                        let end_line = (node.end_position().row + 1) as u32;

                        symbols.push(ExtractedSymbol {
                            name,
                            qualified_path,
                            kind: SymbolKind::Function,
                            visibility,
                            signature,
                            raw_signature,
                            start_line,
                            end_line,
                            documentation: None,
                            parameters: Vec::new(),
                            return_type: None,
                            generics: Vec::new(),
                            annotations: Vec::new(),
                            is_exported: false,
                        });
                    }
                }
                "type_spec" => {
                    // Covers: type Foo struct { ... }, type Foo interface { ... }
                    let name = node
                        .child_by_field_name("name")
                        .map(|n| self.get_node_text(&n, source))
                        .unwrap_or_default();

                    if !name.is_empty() {
                        let visibility = if name
                            .chars()
                            .next()
                            .map(|c| c.is_ascii_uppercase())
                            .unwrap_or(false)
                        {
                            Visibility::Public
                        } else {
                            Visibility::Private
                        };

                        let kind = node
                            .child_by_field_name("type")
                            .map(|t| match t.kind() {
                                "struct_type" => SymbolKind::Struct,
                                "interface_type" => SymbolKind::Interface,
                                _ => SymbolKind::Type,
                            })
                            .unwrap_or(SymbolKind::Type);

                        let raw_signature = self.get_node_text(&node, source);
                        let signature = self.normalize_signature(&raw_signature);
                        let start_line = (node.start_position().row + 1) as u32;
                        let end_line = (node.end_position().row + 1) as u32;

                        symbols.push(ExtractedSymbol {
                            name: name.clone(),
                            qualified_path: name,
                            kind,
                            visibility,
                            signature,
                            raw_signature,
                            start_line,
                            end_line,
                            documentation: None,
                            parameters: Vec::new(),
                            return_type: None,
                            generics: Vec::new(),
                            annotations: Vec::new(),
                            is_exported: false,
                        });
                    }
                }
                _ => {}
            }

            if cursor.goto_first_child() {
                self.walk_go_tree(cursor, source, symbols);
                cursor.goto_parent();
            }

            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // JAVA EXTRACTION (Basic)
    // ─────────────────────────────────────────────────────────────

    fn extract_java_symbols(
        &self,
        root: &tree_sitter::Node,
        source: &str,
        _file_path: &str,
    ) -> Vec<ExtractedSymbol> {
        let mut symbols = Vec::new();
        let mut cursor = root.walk();
        self.walk_java_tree(&mut cursor, source, &mut Vec::new(), &mut symbols);
        symbols
    }

    fn walk_java_tree(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        source: &str,
        class_stack: &mut Vec<String>,
        symbols: &mut Vec<ExtractedSymbol>,
    ) {
        loop {
            let node = cursor.node();
            let kind = node.kind();

            let is_type_decl = matches!(
                kind,
                "class_declaration"
                    | "interface_declaration"
                    | "enum_declaration"
                    | "annotation_type_declaration"
            );

            if is_type_decl {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = self.get_node_text(&name_node, source);
                    if !name.is_empty() {
                        let visibility = self.java_visibility(&node, source);
                        let sym_kind = match kind {
                            "interface_declaration" => SymbolKind::Interface,
                            "enum_declaration" => SymbolKind::Enum,
                            _ => SymbolKind::Class,
                        };

                        let raw_signature = self.get_node_text(&node, source);
                        let signature = self.normalize_signature(&raw_signature);
                        let start_line = (node.start_position().row + 1) as u32;
                        let end_line = (node.end_position().row + 1) as u32;

                        symbols.push(ExtractedSymbol {
                            name: name.clone(),
                            qualified_path: name.clone(),
                            kind: sym_kind,
                            visibility,
                            signature,
                            raw_signature,
                            start_line,
                            end_line,
                            documentation: None,
                            parameters: Vec::new(),
                            return_type: None,
                            generics: Vec::new(),
                            annotations: Vec::new(),
                            is_exported: false,
                        });

                        class_stack.push(name);
                    }
                }
            } else if matches!(kind, "method_declaration" | "constructor_declaration") {
                let name = node
                    .child_by_field_name("name")
                    .map(|n| self.get_node_text(&n, source))
                    .unwrap_or_else(|| {
                        if kind == "constructor_declaration" {
                            class_stack.last().cloned().unwrap_or_default()
                        } else {
                            String::new()
                        }
                    });

                if !name.is_empty() {
                    let visibility = self.java_visibility(&node, source);
                    let raw_signature = self.get_node_text(&node, source);
                    let signature = self.normalize_signature(&raw_signature);
                    let start_line = (node.start_position().row + 1) as u32;
                    let end_line = (node.end_position().row + 1) as u32;

                    let qualified_path = match class_stack.last() {
                        Some(class_name) => format!("{}.{}", class_name, name),
                        None => name.clone(),
                    };

                    symbols.push(ExtractedSymbol {
                        name,
                        qualified_path,
                        kind: SymbolKind::Method,
                        visibility,
                        signature,
                        raw_signature,
                        start_line,
                        end_line,
                        documentation: None,
                        parameters: Vec::new(),
                        return_type: None,
                        generics: Vec::new(),
                        annotations: Vec::new(),
                        is_exported: false,
                    });
                }
            }

            if cursor.goto_first_child() {
                self.walk_java_tree(cursor, source, class_stack, symbols);
                cursor.goto_parent();
            }

            if is_type_decl {
                // Pop if we pushed a class name
                // (We only push when we successfully extracted a name.)
                // To keep this simple, if the top of the stack matches this node's name, pop it.
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = self.get_node_text(&name_node, source);
                    if class_stack.last().map(|s| s == &name).unwrap_or(false) {
                        class_stack.pop();
                    }
                }
            }

            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }

    fn java_visibility(&self, node: &tree_sitter::Node, source: &str) -> Visibility {
        let mods_text = node
            .child_by_field_name("modifiers")
            .map(|m| self.get_node_text(&m, source))
            .unwrap_or_default();

        let mods_lower = mods_text.to_ascii_lowercase();
        if mods_lower.contains("public") {
            Visibility::Public
        } else if mods_lower.contains("protected") {
            Visibility::Protected
        } else if mods_lower.contains("private") {
            Visibility::Private
        } else {
            Visibility::Internal
        }
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────

    fn get_node_text(&self, node: &tree_sitter::Node, source: &str) -> String {
        source[node.byte_range()].to_string()
    }

    fn normalize_signature(&self, sig: &str) -> String {
        // Normalize whitespace, remove comments, standardize formatting
        sig.split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .replace(" (", "(")
            .replace("( ", "(")
            .replace(" )", ")")
            .replace(" )", ")")
            .replace(" ,", ",")
            .replace(", ", ",")
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn create_parser() -> ParserPool {
        ParserPool::new(Duration::from_secs(30), 1024 * 1024)
    }

    #[test]
    fn test_rust_function_extraction() {
        let parser = create_parser();
        let source = r#"
/// Documentation for my_function
pub fn my_function(x: i32, y: String) -> Result<(), Error> {
    Ok(())
}

fn private_function() {}
"#;

        let symbols = parser.parse(Language::Rust, source, "test.rs").unwrap();
        assert_eq!(symbols.len(), 2);

        let public_fn = symbols.iter().find(|s| s.name == "my_function").unwrap();
        assert_eq!(public_fn.visibility, Visibility::Public);
        assert_eq!(public_fn.kind, SymbolKind::Function);
        assert_eq!(public_fn.parameters.len(), 2);

        let private_fn = symbols
            .iter()
            .find(|s| s.name == "private_function")
            .unwrap();
        assert_eq!(private_fn.visibility, Visibility::Private);
    }

    #[test]
    fn test_rust_struct_extraction() {
        let parser = create_parser();
        let source = r#"
pub struct MyStruct<T> {
    pub field: T,
}

struct PrivateStruct;
"#;

        let symbols = parser.parse(Language::Rust, source, "test.rs").unwrap();
        assert!(
            symbols
                .iter()
                .any(|s| s.name == "MyStruct" && s.visibility == Visibility::Public)
        );
        assert!(
            symbols
                .iter()
                .any(|s| s.name == "PrivateStruct" && s.visibility == Visibility::Private)
        );
    }

    #[test]
    fn test_python_function_extraction() {
        let parser = create_parser();
        let source = r#"
def public_function(x, y):
    """This is a docstring"""
    pass

def _private_function():
    pass

class MyClass:
    def method(self, arg):
        pass
"#;

        let symbols = parser.parse(Language::Python, source, "test.py").unwrap();

        let public_fn = symbols
            .iter()
            .find(|s| s.name == "public_function")
            .unwrap();
        assert_eq!(public_fn.visibility, Visibility::Public);
        assert!(public_fn.documentation.is_some());

        let private_fn = symbols
            .iter()
            .find(|s| s.name == "_private_function")
            .unwrap();
        assert_eq!(private_fn.visibility, Visibility::Private);
    }

    #[test]
    fn test_js_export_extraction() {
        let parser = create_parser();
        let source = r#"
export function myFunction(a, b) {
    return a + b;
}

export class MyClass {}

function privateFunction() {}
"#;

        let symbols = parser
            .parse(Language::JavaScript, source, "test.js")
            .unwrap();

        let exported = symbols.iter().filter(|s| s.is_exported).count();
        assert!(exported >= 2);
    }

    #[test]
    fn test_language_detection() {
        assert_eq!(Language::from_extension("rs"), Some(Language::Rust));
        assert_eq!(Language::from_extension("py"), Some(Language::Python));
        assert_eq!(Language::from_extension("js"), Some(Language::JavaScript));
        assert_eq!(Language::from_extension("ts"), Some(Language::TypeScript));
        assert_eq!(Language::from_extension("txt"), None);
    }

    #[test]
    fn test_signature_normalization() {
        let parser = create_parser();
        let sig1 = "fn  test(  a: i32  ,  b: String  )";
        let sig2 = "fn test(a: i32, b: String)";

        assert_eq!(
            parser.normalize_signature(sig1),
            parser.normalize_signature(sig2)
        );
    }
}

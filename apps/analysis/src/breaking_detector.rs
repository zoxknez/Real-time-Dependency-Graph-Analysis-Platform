//! Breaking change detection logic

use crate::ast_parser::{ExtractedSymbol, SymbolKind, Visibility};
use anyhow::Result;
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// Types of breaking changes we detect
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BreakingChangeType {
    SymbolRemoved,
    SignatureChanged,
    TypeChanged,
    VisibilityReduced,
    BehaviorChanged,
}

/// Detected breaking change
#[derive(Debug, Clone)]
pub struct BreakingChange {
    pub symbol_path: String,
    pub change_type: BreakingChangeType,
    pub confidence: f32,
    pub before_signature: Option<String>,
    pub after_signature: Option<String>,
    pub description: String,
}

/// Breaking change detector
pub struct BreakingDetector {
    /// Minimum confidence threshold to report a breaking change
    confidence_threshold: f32,
}

impl BreakingDetector {
    pub fn new(confidence_threshold: f32) -> Self {
        Self { confidence_threshold }
    }
    
    /// Compare two versions of a package's public API
    pub fn detect_breaking_changes(
        &self,
        old_symbols: &[ExtractedSymbol],
        new_symbols: &[ExtractedSymbol],
    ) -> Vec<BreakingChange> {
        let mut changes = vec![];
        
        // Index new symbols by qualified path
        let new_by_path: HashMap<&str, &ExtractedSymbol> = new_symbols
            .iter()
            .map(|s| (s.qualified_path.as_str(), s))
            .collect();
        
        // Check each old public symbol
        for old in old_symbols.iter().filter(|s| s.visibility == Visibility::Public) {
            match new_by_path.get(old.qualified_path.as_str()) {
                None => {
                    // Symbol was removed - definitely breaking
                    changes.push(BreakingChange {
                        symbol_path: old.qualified_path.clone(),
                        change_type: BreakingChangeType::SymbolRemoved,
                        confidence: 1.0,
                        before_signature: Some(old.signature.clone()),
                        after_signature: None,
                        description: format!("Public {} '{}' was removed", 
                            format_kind(old.kind), old.name),
                    });
                }
                Some(new) => {
                    // Check for signature changes
                    if old.signature != new.signature {
                        let confidence = self.calculate_signature_change_confidence(old, new);
                        if confidence >= self.confidence_threshold {
                            changes.push(BreakingChange {
                                symbol_path: old.qualified_path.clone(),
                                change_type: BreakingChangeType::SignatureChanged,
                                confidence,
                                before_signature: Some(old.signature.clone()),
                                after_signature: Some(new.signature.clone()),
                                description: format!("Signature of {} '{}' changed",
                                    format_kind(old.kind), old.name),
                            });
                        }
                    }
                    
                    // Check for visibility reduction
                    if is_visibility_reduced(old.visibility, new.visibility) {
                        changes.push(BreakingChange {
                            symbol_path: old.qualified_path.clone(),
                            change_type: BreakingChangeType::VisibilityReduced,
                            confidence: 1.0,
                            before_signature: Some(old.signature.clone()),
                            after_signature: Some(new.signature.clone()),
                            description: format!("{} '{}' visibility reduced from {:?} to {:?}",
                                format_kind(old.kind), old.name, old.visibility, new.visibility),
                        });
                    }
                }
            }
        }
        
        info!(
            old_count = old_symbols.len(),
            new_count = new_symbols.len(),
            breaking_count = changes.len(),
            "Completed breaking change detection"
        );
        
        changes
    }
    
    /// Calculate confidence that a signature change is breaking
    fn calculate_signature_change_confidence(
        &self,
        old: &ExtractedSymbol,
        new: &ExtractedSymbol,
    ) -> f32 {
        // Heuristics for determining if a change is breaking:
        // - Parameter count changed: high confidence
        // - Parameter type changed: high confidence
        // - Return type changed: high confidence
        // - Only parameter names changed: low confidence
        // - Only formatting changed: zero confidence
        
        // TODO: Implement detailed signature comparison
        // For now, assume any signature change is potentially breaking
        0.8
    }
}

fn format_kind(kind: SymbolKind) -> &'static str {
    match kind {
        SymbolKind::Function => "function",
        SymbolKind::Class => "class",
        SymbolKind::Method => "method",
        SymbolKind::Constant => "constant",
        SymbolKind::Variable => "variable",
        SymbolKind::Type => "type",
        SymbolKind::Interface => "interface",
        SymbolKind::Enum => "enum",
        SymbolKind::Module => "module",
    }
}

fn is_visibility_reduced(old: Visibility, new: Visibility) -> bool {
    let old_level = visibility_level(old);
    let new_level = visibility_level(new);
    new_level < old_level
}

fn visibility_level(v: Visibility) -> u8 {
    match v {
        Visibility::Public => 4,
        Visibility::Protected => 3,
        Visibility::Internal => 2,
        Visibility::Private => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_visibility_reduction() {
        assert!(is_visibility_reduced(Visibility::Public, Visibility::Private));
        assert!(!is_visibility_reduced(Visibility::Private, Visibility::Public));
    }
}

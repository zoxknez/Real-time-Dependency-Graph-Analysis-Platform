//! Input Validation Middleware
//!
//! Validates and sanitizes GraphQL inputs:
//! - Request size limits
//! - Query depth validation
//! - Dangerous pattern detection
//! - ID format validation

#![allow(dead_code)]

use async_graphql::parser::{parse_query, types::ExecutableDocument};
use serde::Deserialize;
use std::collections::HashSet;

/// Input validation configuration
#[derive(Debug, Clone)]
pub struct ValidationConfig {
    /// Maximum request body size in bytes
    pub max_body_size: usize,
    /// Maximum query depth
    pub max_depth: usize,
    /// Maximum number of aliases
    pub max_aliases: usize,
    /// Maximum number of root fields
    pub max_root_fields: usize,
    /// Blocked field names (introspection blocking, etc.)
    pub blocked_fields: HashSet<String>,
    /// Enable introspection
    pub allow_introspection: bool,
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            max_body_size: 1024 * 1024, // 1MB
            max_depth: 15,
            max_aliases: 50,
            max_root_fields: 20,
            blocked_fields: HashSet::new(),
            allow_introspection: true,
        }
    }
}

impl ValidationConfig {
    /// Production configuration (more restrictive)
    pub fn production() -> Self {
        let mut blocked = HashSet::new();
        // Block debug fields if any
        blocked.insert("__debug".to_string());

        Self {
            max_body_size: 512 * 1024, // 512KB
            max_depth: 10,
            max_aliases: 30,
            max_root_fields: 10,
            blocked_fields: blocked,
            allow_introspection: false, // Disable in production
        }
    }
}

/// Validation error types
#[derive(Debug, Clone)]
pub enum ValidationError {
    /// Request body too large
    BodyTooLarge { size: usize, max: usize },
    /// Query too deep
    DepthExceeded { depth: usize, max: usize },
    /// Too many aliases
    TooManyAliases { count: usize, max: usize },
    /// Too many root fields
    TooManyRootFields { count: usize, max: usize },
    /// Blocked field accessed
    BlockedField { field: String },
    /// Introspection not allowed
    IntrospectionBlocked,
    /// Invalid ID format
    InvalidIdFormat { id: String, expected: String },
    /// Invalid query syntax
    InvalidQuery { message: String },
    /// Dangerous pattern detected
    DangerousPattern { pattern: String },
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BodyTooLarge { size, max } => {
                write!(f, "Request body too large: {} bytes (max: {})", size, max)
            }
            Self::DepthExceeded { depth, max } => {
                write!(f, "Query depth {} exceeds maximum {}", depth, max)
            }
            Self::TooManyAliases { count, max } => {
                write!(f, "Too many aliases: {} (max: {})", count, max)
            }
            Self::TooManyRootFields { count, max } => {
                write!(f, "Too many root fields: {} (max: {})", count, max)
            }
            Self::BlockedField { field } => {
                write!(f, "Access to field '{}' is not allowed", field)
            }
            Self::IntrospectionBlocked => {
                write!(f, "Introspection is disabled")
            }
            Self::InvalidIdFormat { id, expected } => {
                write!(f, "Invalid ID format '{}', expected: {}", id, expected)
            }
            Self::InvalidQuery { message } => {
                write!(f, "Invalid query: {}", message)
            }
            Self::DangerousPattern { pattern } => {
                write!(f, "Dangerous pattern detected: {}", pattern)
            }
        }
    }
}

impl std::error::Error for ValidationError {}

/// GraphQL request for validation
#[derive(Debug, Deserialize)]
pub struct GraphQLRequest {
    pub query: String,
    #[serde(default)]
    pub operation_name: Option<String>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
}

/// Input validator
pub struct InputValidator {
    config: ValidationConfig,
}

impl InputValidator {
    pub fn new(config: ValidationConfig) -> Self {
        Self { config }
    }

    /// Validate a GraphQL request
    pub fn validate(&self, request: &GraphQLRequest) -> Result<(), ValidationError> {
        // Check query size
        if request.query.len() > self.config.max_body_size {
            return Err(ValidationError::BodyTooLarge {
                size: request.query.len(),
                max: self.config.max_body_size,
            });
        }

        // Parse the query
        let document = parse_query(&request.query).map_err(|e| ValidationError::InvalidQuery {
            message: e.to_string(),
        })?;

        // Check introspection
        if !self.config.allow_introspection && self.has_introspection(&document) {
            return Err(ValidationError::IntrospectionBlocked);
        }

        // Check depth
        let depth = self.calculate_depth(&document);
        if depth > self.config.max_depth {
            return Err(ValidationError::DepthExceeded {
                depth,
                max: self.config.max_depth,
            });
        }

        // Check aliases
        let alias_count = self.count_aliases(&document);
        if alias_count > self.config.max_aliases {
            return Err(ValidationError::TooManyAliases {
                count: alias_count,
                max: self.config.max_aliases,
            });
        }

        // Check root fields
        let root_fields = self.count_root_fields(&document);
        if root_fields > self.config.max_root_fields {
            return Err(ValidationError::TooManyRootFields {
                count: root_fields,
                max: self.config.max_root_fields,
            });
        }

        // Check blocked fields
        if let Some(blocked) = self.find_blocked_field(&document) {
            return Err(ValidationError::BlockedField { field: blocked });
        }

        // Check for dangerous patterns
        if let Some(pattern) = self.detect_dangerous_patterns(&request.query) {
            return Err(ValidationError::DangerousPattern { pattern });
        }

        // Validate variables if present
        if let Some(ref vars) = request.variables {
            self.validate_variables(vars)?;
        }

        Ok(())
    }

    /// Check if query contains introspection
    fn has_introspection(&self, doc: &ExecutableDocument) -> bool {
        // Check for __schema or __type queries
        for def in &doc.operations.iter().collect::<Vec<_>>() {
            for selection in &def.1.node.selection_set.node.items {
                if let async_graphql::parser::types::Selection::Field(field) = &selection.node {
                    let name = field.node.name.node.as_str();
                    if name == "__schema" || name == "__type" {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Calculate maximum query depth
    fn calculate_depth(&self, doc: &ExecutableDocument) -> usize {
        let mut max_depth = 0;

        for def in doc.operations.iter() {
            let depth = self.selection_set_depth(&def.1.node.selection_set.node, 0);
            max_depth = max_depth.max(depth);
        }

        max_depth
    }

    fn selection_set_depth(
        &self,
        selection_set: &async_graphql::parser::types::SelectionSet,
        current: usize,
    ) -> usize {
        let mut max = current;

        for selection in &selection_set.items {
            match &selection.node {
                async_graphql::parser::types::Selection::Field(field) => {
                    let nested_depth =
                        self.selection_set_depth(&field.node.selection_set.node, current + 1);
                    max = max.max(nested_depth);
                }
                async_graphql::parser::types::Selection::FragmentSpread(_) => {
                    // Would need fragment resolution for accurate depth
                    max = max.max(current + 1);
                }
                async_graphql::parser::types::Selection::InlineFragment(fragment) => {
                    let nested_depth =
                        self.selection_set_depth(&fragment.node.selection_set.node, current + 1);
                    max = max.max(nested_depth);
                }
            }
        }

        max
    }

    /// Count aliases in query
    fn count_aliases(&self, doc: &ExecutableDocument) -> usize {
        let mut count = 0;

        for def in doc.operations.iter() {
            count += self.count_aliases_in_selection(&def.1.node.selection_set.node);
        }

        count
    }

    fn count_aliases_in_selection(
        &self,
        selection_set: &async_graphql::parser::types::SelectionSet,
    ) -> usize {
        let mut count = 0;

        for selection in &selection_set.items {
            if let async_graphql::parser::types::Selection::Field(field) = &selection.node {
                if field.node.alias.is_some() {
                    count += 1;
                }
                count += self.count_aliases_in_selection(&field.node.selection_set.node);
            }
        }

        count
    }

    /// Count root-level fields
    fn count_root_fields(&self, doc: &ExecutableDocument) -> usize {
        let mut count = 0;

        for def in doc.operations.iter() {
            count += def.1.node.selection_set.node.items.len();
        }

        count
    }

    /// Find blocked field in query
    fn find_blocked_field(&self, doc: &ExecutableDocument) -> Option<String> {
        for def in doc.operations.iter() {
            if let Some(blocked) = self.find_blocked_in_selection(&def.1.node.selection_set.node) {
                return Some(blocked);
            }
        }
        None
    }

    fn find_blocked_in_selection(
        &self,
        selection_set: &async_graphql::parser::types::SelectionSet,
    ) -> Option<String> {
        for selection in &selection_set.items {
            if let async_graphql::parser::types::Selection::Field(field) = &selection.node {
                let name = field.node.name.node.as_str();
                if self.config.blocked_fields.contains(name) {
                    return Some(name.to_string());
                }
                if let Some(blocked) =
                    self.find_blocked_in_selection(&field.node.selection_set.node)
                {
                    return Some(blocked);
                }
            }
        }
        None
    }

    /// Detect dangerous patterns in query string
    fn detect_dangerous_patterns(&self, query: &str) -> Option<String> {
        let dangerous_patterns = [
            // Batch attack patterns
            (
                "query{",
                query.matches("query{").count() > 10,
                "multiple queries",
            ),
            // Directive abuse
            ("@", query.matches('@').count() > 50, "directive abuse"),
        ];

        for (_, is_dangerous, name) in dangerous_patterns {
            if is_dangerous {
                return Some(name.to_string());
            }
        }

        None
    }

    /// Validate variables
    fn validate_variables(&self, variables: &serde_json::Value) -> Result<(), ValidationError> {
        // Check for excessively large variables
        let vars_string = serde_json::to_string(variables).unwrap_or_default();
        if vars_string.len() > self.config.max_body_size / 2 {
            return Err(ValidationError::BodyTooLarge {
                size: vars_string.len(),
                max: self.config.max_body_size / 2,
            });
        }

        Ok(())
    }
}

/// Validate package ID format
pub fn validate_package_id(id: &str) -> Result<(), ValidationError> {
    // Format: ecosystem:name
    let parts: Vec<&str> = id.splitn(2, ':').collect();

    if parts.len() != 2 {
        return Err(ValidationError::InvalidIdFormat {
            id: id.to_string(),
            expected: "ecosystem:package_name".to_string(),
        });
    }

    let ecosystem = parts[0].to_lowercase();
    let valid_ecosystems = ["npm", "pypi", "cargo", "maven", "nuget", "go"];

    if !valid_ecosystems.contains(&ecosystem.as_str()) {
        return Err(ValidationError::InvalidIdFormat {
            id: id.to_string(),
            expected: format!("Valid ecosystems: {:?}", valid_ecosystems),
        });
    }

    let name = parts[1];
    if name.is_empty() || name.len() > 214 {
        return Err(ValidationError::InvalidIdFormat {
            id: id.to_string(),
            expected: "Package name must be 1-214 characters".to_string(),
        });
    }

    Ok(())
}

/// Validate version string
pub fn validate_version(version: &str) -> Result<(), ValidationError> {
    // Basic semver-like validation
    if version.is_empty() || version.len() > 256 {
        return Err(ValidationError::InvalidIdFormat {
            id: version.to_string(),
            expected: "Version must be 1-256 characters".to_string(),
        });
    }

    // Check for dangerous characters
    let forbidden = ['<', '>', '"', '\'', ';', '|', '&'];
    for c in forbidden {
        if version.contains(c) {
            return Err(ValidationError::DangerousPattern {
                pattern: format!("Forbidden character '{}' in version", c),
            });
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_id_validation() {
        assert!(validate_package_id("npm:lodash").is_ok());
        assert!(validate_package_id("pypi:django").is_ok());
        assert!(validate_package_id("invalid").is_err());
        assert!(validate_package_id("unknown:package").is_err());
    }

    #[test]
    fn test_version_validation() {
        assert!(validate_version("1.0.0").is_ok());
        assert!(validate_version("1.0.0-beta.1").is_ok());
        assert!(validate_version("").is_err());
        assert!(validate_version("<script>").is_err());
    }

    #[test]
    fn test_default_config() {
        let config = ValidationConfig::default();
        assert_eq!(config.max_depth, 15);
        assert!(config.allow_introspection);
    }

    #[test]
    fn test_production_config() {
        let config = ValidationConfig::production();
        assert_eq!(config.max_depth, 10);
        assert!(!config.allow_introspection);
    }
}

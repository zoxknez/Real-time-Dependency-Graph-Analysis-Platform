//! GraphQL Query Complexity Limiter
//!
//! Provides configuration for query complexity limits.
//! Actual enforcement is handled by async-graphql's built-in mechanisms.

#![allow(dead_code)]

use tracing::warn;

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/// Query complexity configuration
#[derive(Debug, Clone)]
pub struct ComplexityConfig {
    /// Maximum allowed query depth
    pub max_depth: usize,
    /// Maximum allowed complexity score
    pub max_complexity: usize,
    /// Base cost per field
    pub field_cost: usize,
    /// Cost multiplier for list fields
    pub list_multiplier: usize,
    /// Cost for connection/pagination fields
    pub connection_cost: usize,
}

impl Default for ComplexityConfig {
    fn default() -> Self {
        Self {
            max_depth: 10,
            max_complexity: 1000,
            field_cost: 1,
            list_multiplier: 10,
            connection_cost: 5,
        }
    }
}

impl ComplexityConfig {
    /// Create a new complexity configuration with custom values
    pub fn new(max_depth: usize, max_complexity: usize) -> Self {
        Self {
            max_depth,
            max_complexity,
            ..Default::default()
        }
    }

    /// Create a strict configuration for public API
    pub fn strict() -> Self {
        Self {
            max_depth: 5,
            max_complexity: 500,
            field_cost: 1,
            list_multiplier: 10,
            connection_cost: 5,
        }
    }

    /// Create a relaxed configuration for internal API
    pub fn relaxed() -> Self {
        Self {
            max_depth: 20,
            max_complexity: 5000,
            field_cost: 1,
            list_multiplier: 10,
            connection_cost: 5,
        }
    }

    /// Validate that query parameters are within limits
    pub fn validate_query_depth(&self, depth: usize) -> Result<(), ComplexityError> {
        if depth > self.max_depth {
            warn!(
                depth,
                max_depth = self.max_depth,
                "Query depth exceeds maximum"
            );
            return Err(ComplexityError::DepthExceeded {
                actual: depth,
                max: self.max_depth,
            });
        }
        Ok(())
    }

    /// Validate that complexity is within limits
    pub fn validate_complexity(&self, complexity: usize) -> Result<(), ComplexityError> {
        if complexity > self.max_complexity {
            warn!(
                complexity,
                max_complexity = self.max_complexity,
                "Query complexity exceeds maximum"
            );
            return Err(ComplexityError::ComplexityExceeded {
                actual: complexity,
                max: self.max_complexity,
            });
        }
        Ok(())
    }

    /// Calculate simple field cost
    pub fn calculate_field_cost(&self, is_list: bool, is_connection: bool) -> usize {
        let base = self.field_cost;
        if is_connection {
            base + self.connection_cost
        } else if is_list {
            base * self.list_multiplier
        } else {
            base
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════

/// Complexity validation errors
#[derive(Debug, Clone, thiserror::Error)]
pub enum ComplexityError {
    #[error("Query depth {actual} exceeds maximum allowed depth of {max}")]
    DepthExceeded { actual: usize, max: usize },

    #[error("Query complexity {actual} exceeds maximum allowed complexity of {max}")]
    ComplexityExceeded { actual: usize, max: usize },
}

// ═══════════════════════════════════════════════════════════════
// QUERY COMPLEXITY CALCULATOR
// ═══════════════════════════════════════════════════════════════

/// Simple query complexity calculator
/// Can be used to estimate complexity before execution
#[derive(Debug, Clone)]
pub struct ComplexityCalculator {
    config: ComplexityConfig,
}

impl ComplexityCalculator {
    pub fn new(config: ComplexityConfig) -> Self {
        Self { config }
    }

    /// Estimate complexity for a paginated query
    pub fn estimate_paginated_query(&self, page_size: usize, depth: usize) -> usize {
        let mut cost = 0;
        let mut multiplier = 1;

        for d in 0..depth {
            if d == 0 {
                // Root field
                cost += self.config.field_cost + self.config.connection_cost;
                multiplier = page_size;
            } else {
                // Nested fields
                cost += self.config.field_cost * multiplier;
            }
        }

        cost
    }

    /// Validate a query's estimated complexity
    pub fn validate(
        &self,
        estimated_complexity: usize,
        depth: usize,
    ) -> Result<(), ComplexityError> {
        self.config.validate_query_depth(depth)?;
        self.config.validate_complexity(estimated_complexity)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ComplexityConfig::default();
        assert_eq!(config.max_depth, 10);
        assert_eq!(config.max_complexity, 1000);
    }

    #[test]
    fn test_depth_validation() {
        let config = ComplexityConfig::default();
        assert!(config.validate_query_depth(5).is_ok());
        assert!(config.validate_query_depth(15).is_err());
    }

    #[test]
    fn test_complexity_validation() {
        let config = ComplexityConfig::default();
        assert!(config.validate_complexity(500).is_ok());
        assert!(config.validate_complexity(1500).is_err());
    }

    #[test]
    fn test_field_cost_calculation() {
        let config = ComplexityConfig::default();
        assert_eq!(config.calculate_field_cost(false, false), 1);
        assert_eq!(config.calculate_field_cost(true, false), 10);
        assert_eq!(config.calculate_field_cost(false, true), 6);
    }
}

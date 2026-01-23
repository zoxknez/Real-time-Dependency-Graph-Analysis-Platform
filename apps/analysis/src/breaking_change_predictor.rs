//! Breaking Change Prediction
//!
//! Predicts likelihood of breaking changes in new package versions based on:
//! - Semantic versioning analysis
//! - Changelog keyword detection  
//! - Historical breaking change patterns
//! - Dependency graph changes
//!
//! Uses a lightweight ML model (feature-based scoring) for fast inference.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Breaking change prediction result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakingChangePrediction {
    /// Package ID being analyzed
    pub package_id: String,
    /// Old version (if upgrade)
    pub old_version: Option<String>,
    /// New version
    pub new_version: String,
    /// Probability of breaking change (0.0 - 1.0)
    pub probability: f64,
    /// Risk level
    pub risk_level: RiskLevel,
    /// Detected signals
    pub signals: Vec<BreakingSignal>,
    /// Confidence in prediction (0.0 - 1.0)
    pub confidence: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

impl From<f64> for RiskLevel {
    fn from(probability: f64) -> Self {
        match probability {
            p if p < 0.2 => RiskLevel::Low,
            p if p < 0.5 => RiskLevel::Medium,
            p if p < 0.8 => RiskLevel::High,
            _ => RiskLevel::Critical,
        }
    }
}

/// Signal that indicates potential breaking change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakingSignal {
    pub signal_type: SignalType,
    pub weight: f64,
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalType {
    /// Major version bump (1.x -> 2.x)
    MajorVersionBump,
    /// Changelog contains breaking keywords
    BreakingKeywords,
    /// Dependencies removed
    DependenciesRemoved,
    /// Dependencies major updated
    DependenciesMajorUpdate,
    /// API surface reduced (exports removed)
    ApiSurfaceReduced,
    /// Author history of breaking changes
    AuthorHistory,
    /// Short time since last release
    RapidRelease,
    /// Pre-release version (alpha, beta, rc)
    PreRelease,
    /// Large diff in code
    LargeDiff,
    /// Type signature changes (for typed languages)
    TypeSignatureChange,
}

/// Breaking change predictor
pub struct BreakingChangePredictor {
    /// Keywords that indicate breaking changes
    breaking_keywords: HashSet<String>,
    /// Keywords that indicate deprecations
    deprecation_keywords: HashSet<String>,
    /// Feature weights for scoring
    weights: FeatureWeights,
}

/// Weights for different features
#[derive(Debug, Clone)]
struct FeatureWeights {
    major_version_bump: f64,
    breaking_keywords: f64,
    dependencies_removed: f64,
    dependencies_major_update: f64,
    api_surface_reduced: f64,
    author_history: f64,
    rapid_release: f64,
    pre_release: f64,
    large_diff: f64,
}

impl Default for FeatureWeights {
    fn default() -> Self {
        Self {
            major_version_bump: 0.40,      // Strong signal
            breaking_keywords: 0.30,       // Direct indication
            dependencies_removed: 0.15,    // May break dependents
            dependencies_major_update: 0.10,
            api_surface_reduced: 0.25,
            author_history: 0.10,
            rapid_release: 0.05,
            pre_release: 0.15,
            large_diff: 0.08,
        }
    }
}

/// Input features for prediction
#[derive(Debug, Clone, Default)]
pub struct PredictionInput {
    /// Old version string (optional for new packages)
    pub old_version: Option<String>,
    /// New version string  
    pub new_version: String,
    /// Changelog/release notes text
    pub changelog: Option<String>,
    /// Number of dependencies removed
    pub dependencies_removed: usize,
    /// Number of dependencies with major version updates
    pub dependencies_major_updates: usize,
    /// Number of exports/API surface items removed
    pub api_items_removed: usize,
    /// Author's historical breaking change rate (0.0 - 1.0)
    pub author_breaking_rate: Option<f64>,
    /// Days since last release
    pub days_since_last_release: Option<u32>,
    /// Lines of code changed
    pub lines_changed: Option<usize>,
    /// Is this a pre-release version
    pub is_pre_release: bool,
}

impl BreakingChangePredictor {
    pub fn new() -> Self {
        let breaking_keywords: HashSet<String> = [
            "breaking", "BREAKING", "breaking change", "breaking-change",
            "incompatible", "INCOMPATIBLE", "backwards-incompatible",
            "migration required", "migrate", "upgrade guide",
            "removed", "REMOVED", "deprecated and removed",
            "no longer supports", "dropped support",
            "renamed", "RENAMED", "moved to",
            "changed signature", "new api", "API change",
            "must update", "action required",
        ].iter().map(|s| s.to_lowercase()).collect();

        let deprecation_keywords: HashSet<String> = [
            "deprecated", "DEPRECATED", "deprecating",
            "will be removed", "scheduled for removal",
            "legacy", "obsolete",
        ].iter().map(|s| s.to_lowercase()).collect();

        Self {
            breaking_keywords,
            deprecation_keywords,
            weights: FeatureWeights::default(),
        }
    }

    /// Predict breaking change probability
    pub fn predict(&self, package_id: &str, input: &PredictionInput) -> BreakingChangePrediction {
        let mut signals = Vec::new();
        let mut total_weight = 0.0;
        let mut confidence = 0.5; // Base confidence

        // 1. Check semver major bump
        if let Some(ref old) = input.old_version {
            if let (Some(old_major), Some(new_major)) = (
                parse_major_version(old),
                parse_major_version(&input.new_version),
            ) {
                if new_major > old_major {
                    signals.push(BreakingSignal {
                        signal_type: SignalType::MajorVersionBump,
                        weight: self.weights.major_version_bump,
                        description: format!("Major version bump: {} -> {}", old, input.new_version),
                    });
                    total_weight += self.weights.major_version_bump;
                    confidence += 0.2;
                }
            }
        }

        // 2. Check changelog for breaking keywords
        if let Some(ref changelog) = input.changelog {
            let lowercase = changelog.to_lowercase();
            let breaking_found: Vec<_> = self.breaking_keywords
                .iter()
                .filter(|kw| lowercase.contains(kw.as_str()))
                .collect();

            if !breaking_found.is_empty() {
                signals.push(BreakingSignal {
                    signal_type: SignalType::BreakingKeywords,
                    weight: self.weights.breaking_keywords,
                    description: format!("Breaking keywords found: {:?}", breaking_found.iter().take(3).collect::<Vec<_>>()),
                });
                total_weight += self.weights.breaking_keywords;
                confidence += 0.15;
            }

            // Check for deprecation keywords (lower weight)
            let deprecation_found: Vec<_> = self.deprecation_keywords
                .iter()
                .filter(|kw| lowercase.contains(kw.as_str()))
                .collect();

            if !deprecation_found.is_empty() {
                signals.push(BreakingSignal {
                    signal_type: SignalType::BreakingKeywords,
                    weight: self.weights.breaking_keywords * 0.5,
                    description: format!("Deprecation warnings: {:?}", deprecation_found.iter().take(3).collect::<Vec<_>>()),
                });
                total_weight += self.weights.breaking_keywords * 0.5;
            }
        }

        // 3. Dependencies removed
        if input.dependencies_removed > 0 {
            let weight = (input.dependencies_removed as f64 * 0.1)
                .min(self.weights.dependencies_removed);
            signals.push(BreakingSignal {
                signal_type: SignalType::DependenciesRemoved,
                weight,
                description: format!("{} dependencies removed", input.dependencies_removed),
            });
            total_weight += weight;
        }

        // 4. Dependencies major updates
        if input.dependencies_major_updates > 0 {
            let weight = (input.dependencies_major_updates as f64 * 0.05)
                .min(self.weights.dependencies_major_update);
            signals.push(BreakingSignal {
                signal_type: SignalType::DependenciesMajorUpdate,
                weight,
                description: format!("{} dependencies with major version updates", input.dependencies_major_updates),
            });
            total_weight += weight;
        }

        // 5. API surface reduced
        if input.api_items_removed > 0 {
            let weight = (input.api_items_removed as f64 * 0.05)
                .min(self.weights.api_surface_reduced);
            signals.push(BreakingSignal {
                signal_type: SignalType::ApiSurfaceReduced,
                weight,
                description: format!("{} API items removed", input.api_items_removed),
            });
            total_weight += weight;
            confidence += 0.1;
        }

        // 6. Author breaking history
        if let Some(rate) = input.author_breaking_rate {
            if rate > 0.3 {
                signals.push(BreakingSignal {
                    signal_type: SignalType::AuthorHistory,
                    weight: self.weights.author_history * rate,
                    description: format!("Author has {:.0}% historical breaking change rate", rate * 100.0),
                });
                total_weight += self.weights.author_history * rate;
            }
        }

        // 7. Rapid release
        if let Some(days) = input.days_since_last_release {
            if days < 7 {
                signals.push(BreakingSignal {
                    signal_type: SignalType::RapidRelease,
                    weight: self.weights.rapid_release,
                    description: format!("Released {} days after previous version", days),
                });
                total_weight += self.weights.rapid_release;
            }
        }

        // 8. Pre-release version
        if input.is_pre_release || is_pre_release_version(&input.new_version) {
            signals.push(BreakingSignal {
                signal_type: SignalType::PreRelease,
                weight: self.weights.pre_release,
                description: "Pre-release version (alpha/beta/rc)".to_string(),
            });
            total_weight += self.weights.pre_release;
        }

        // 9. Large diff
        if let Some(lines) = input.lines_changed {
            if lines > 1000 {
                let weight = ((lines as f64 / 5000.0).min(1.0)) * self.weights.large_diff;
                signals.push(BreakingSignal {
                    signal_type: SignalType::LargeDiff,
                    weight,
                    description: format!("{} lines changed", lines),
                });
                total_weight += weight;
            }
        }

        // Calculate final probability (capped at 0.99)
        let probability = (total_weight).min(0.99);
        let risk_level = RiskLevel::from(probability);

        // Adjust confidence based on signal count
        confidence = (confidence + (signals.len() as f64 * 0.05)).min(0.95);

        BreakingChangePrediction {
            package_id: package_id.to_string(),
            old_version: input.old_version.clone(),
            new_version: input.new_version.clone(),
            probability,
            risk_level,
            signals,
            confidence,
        }
    }
}

impl Default for BreakingChangePredictor {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse major version from semver string
fn parse_major_version(version: &str) -> Option<u32> {
    let cleaned = version.trim_start_matches('v').trim_start_matches('V');
    cleaned.split('.').next()?.parse().ok()
}

/// Check if version string indicates pre-release
fn is_pre_release_version(version: &str) -> bool {
    let lower = version.to_lowercase();
    lower.contains("alpha")
        || lower.contains("beta")
        || lower.contains("rc")
        || lower.contains("pre")
        || lower.contains("dev")
        || lower.contains("snapshot")
        || lower.contains("-")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_major_version_bump_detection() {
        let predictor = BreakingChangePredictor::new();
        
        let input = PredictionInput {
            old_version: Some("1.5.3".to_string()),
            new_version: "2.0.0".to_string(),
            ..Default::default()
        };

        let result = predictor.predict("npm:some-package", &input);
        assert!(result.probability > 0.3);
        assert!(result.signals.iter().any(|s| s.signal_type == SignalType::MajorVersionBump));
    }

    #[test]
    fn test_breaking_keyword_detection() {
        let predictor = BreakingChangePredictor::new();
        
        let input = PredictionInput {
            old_version: Some("1.0.0".to_string()),
            new_version: "1.1.0".to_string(),
            changelog: Some("This release contains BREAKING CHANGES to the API.".to_string()),
            ..Default::default()
        };

        let result = predictor.predict("npm:some-package", &input);
        assert!(result.probability > 0.2);
        assert!(result.signals.iter().any(|s| s.signal_type == SignalType::BreakingKeywords));
    }

    #[test]
    fn test_pre_release_detection() {
        let predictor = BreakingChangePredictor::new();
        
        let input = PredictionInput {
            new_version: "2.0.0-beta.1".to_string(),
            ..Default::default()
        };

        let result = predictor.predict("npm:some-package", &input);
        assert!(result.signals.iter().any(|s| s.signal_type == SignalType::PreRelease));
    }

    #[test]
    fn test_low_risk_patch() {
        let predictor = BreakingChangePredictor::new();
        
        let input = PredictionInput {
            old_version: Some("1.5.3".to_string()),
            new_version: "1.5.4".to_string(),
            changelog: Some("Bug fixes and performance improvements.".to_string()),
            ..Default::default()
        };

        let result = predictor.predict("npm:some-package", &input);
        assert!(result.probability < 0.2);
        assert_eq!(result.risk_level, RiskLevel::Low);
    }
}

//! Feature Extraction for Breaking Change Prediction
//!
//! Extracts features from package versions for ML-based prediction:
//! - Semantic version analysis
//! - Changelog parsing
//! - Dependency diff analysis
//! - Historical patterns

use crate::breaking_change_predictor::PredictionInput;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Semver analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemverAnalysis {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub pre_release: Option<String>,
    pub build_metadata: Option<String>,
}

impl SemverAnalysis {
    pub fn parse(version: &str) -> Option<Self> {
        let cleaned = version.trim_start_matches('v').trim_start_matches('V');
        
        // Split off build metadata
        let (version_pre, build) = match cleaned.split_once('+') {
            Some((v, b)) => (v, Some(b.to_string())),
            None => (cleaned, None),
        };
        
        // Split off pre-release
        let (version, pre) = match version_pre.split_once('-') {
            Some((v, p)) => (v, Some(p.to_string())),
            None => (version_pre, None),
        };
        
        let parts: Vec<&str> = version.split('.').collect();
        if parts.is_empty() {
            return None;
        }
        
        Some(Self {
            major: parts.first().and_then(|s| s.parse().ok()).unwrap_or(0),
            minor: parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
            patch: parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
            pre_release: pre,
            build_metadata: build,
        })
    }
    
    /// Compare two versions and determine the type of bump
    pub fn compare(&self, other: &SemverAnalysis) -> VersionBump {
        if self.major != other.major {
            VersionBump::Major
        } else if self.minor != other.minor {
            VersionBump::Minor
        } else if self.patch != other.patch {
            VersionBump::Patch
        } else if self.pre_release != other.pre_release {
            VersionBump::PreRelease
        } else {
            VersionBump::None
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VersionBump {
    Major,
    Minor,
    Patch,
    PreRelease,
    None,
}

/// Dependency diff between versions
#[derive(Debug, Clone, Default)]
pub struct DependencyDiff {
    /// Dependencies that were added
    pub added: Vec<String>,
    /// Dependencies that were removed
    pub removed: Vec<String>,
    /// Dependencies with major version changes
    pub major_updates: Vec<(String, String, String)>, // (name, old_ver, new_ver)
    /// Dependencies with minor/patch version changes
    pub minor_updates: Vec<(String, String, String)>,
}

impl DependencyDiff {
    /// Compute diff between two sets of dependencies
    pub fn compute(
        old_deps: &HashMap<String, String>,
        new_deps: &HashMap<String, String>,
    ) -> Self {
        let old_keys: HashSet<_> = old_deps.keys().collect();
        let new_keys: HashSet<_> = new_deps.keys().collect();
        
        let added: Vec<String> = new_keys
            .difference(&old_keys)
            .map(|k| (*k).clone())
            .collect();
            
        let removed: Vec<String> = old_keys
            .difference(&new_keys)
            .map(|k| (*k).clone())
            .collect();
        
        let mut major_updates = Vec::new();
        let mut minor_updates = Vec::new();
        
        for name in old_keys.intersection(&new_keys) {
            let old_ver = &old_deps[*name];
            let new_ver = &new_deps[*name];
            
            if old_ver != new_ver {
                if let (Some(old_sem), Some(new_sem)) = (
                    SemverAnalysis::parse(old_ver),
                    SemverAnalysis::parse(new_ver),
                ) {
                    if new_sem.major > old_sem.major {
                        major_updates.push(((*name).clone(), old_ver.clone(), new_ver.clone()));
                    } else if new_sem.minor > old_sem.minor || new_sem.patch > old_sem.patch {
                        minor_updates.push(((*name).clone(), old_ver.clone(), new_ver.clone()));
                    }
                }
            }
        }
        
        Self {
            added,
            removed,
            major_updates,
            minor_updates,
        }
    }
}

/// Changelog analyzer for breaking change signals
pub struct ChangelogAnalyzer {
    breaking_patterns: Vec<BreakingPattern>,
}

#[derive(Debug, Clone)]
struct BreakingPattern {
    pattern: String,
    weight: f64,
    category: PatternCategory,
}

#[derive(Debug, Clone, Copy)]
enum PatternCategory {
    Breaking,
    Deprecation,
    Removal,
    Migration,
}

impl ChangelogAnalyzer {
    pub fn new() -> Self {
        let patterns = vec![
            // Breaking change indicators
            ("BREAKING CHANGE", 1.0, PatternCategory::Breaking),
            ("breaking change", 0.9, PatternCategory::Breaking),
            ("breaking:", 0.9, PatternCategory::Breaking),
            ("⚠️ BREAKING", 0.95, PatternCategory::Breaking),
            ("backwards-incompatible", 0.9, PatternCategory::Breaking),
            ("incompatible change", 0.85, PatternCategory::Breaking),
            
            // Removal indicators
            ("removed", 0.6, PatternCategory::Removal),
            ("deleted", 0.5, PatternCategory::Removal),
            ("dropped", 0.5, PatternCategory::Removal),
            ("no longer supports", 0.7, PatternCategory::Removal),
            
            // Deprecation
            ("deprecated", 0.3, PatternCategory::Deprecation),
            ("deprecating", 0.3, PatternCategory::Deprecation),
            ("will be removed", 0.4, PatternCategory::Deprecation),
            
            // Migration required
            ("migration required", 0.8, PatternCategory::Migration),
            ("upgrade guide", 0.6, PatternCategory::Migration),
            ("migrate from", 0.5, PatternCategory::Migration),
            ("action required", 0.7, PatternCategory::Migration),
        ];
        
        Self {
            breaking_patterns: patterns
                .into_iter()
                .map(|(p, w, c)| BreakingPattern {
                    pattern: p.to_lowercase(),
                    weight: w,
                    category: c,
                })
                .collect(),
        }
    }
    
    /// Analyze changelog and extract breaking change signals
    pub fn analyze(&self, changelog: &str) -> ChangelogAnalysis {
        let lower = changelog.to_lowercase();
        let mut total_weight = 0.0;
        let mut matches = Vec::new();
        
        for pattern in &self.breaking_patterns {
            let count = lower.matches(&pattern.pattern).count();
            if count > 0 {
                total_weight += pattern.weight * count.min(3) as f64;
                matches.push((pattern.pattern.clone(), count, pattern.weight));
            }
        }
        
        // Normalize weight to 0-1 range
        let breaking_score = (total_weight / 5.0).min(1.0);
        
        ChangelogAnalysis {
            breaking_score,
            matched_patterns: matches,
            has_migration_notes: lower.contains("migrate") || lower.contains("migration") || lower.contains("upgrade guide"),
            has_deprecations: lower.contains("deprecated"),
        }
    }
}

impl Default for ChangelogAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct ChangelogAnalysis {
    /// Overall breaking change score (0.0 - 1.0)
    pub breaking_score: f64,
    /// Matched patterns with count and weight
    pub matched_patterns: Vec<(String, usize, f64)>,
    /// Whether migration notes are present
    pub has_migration_notes: bool,
    /// Whether deprecation warnings are present
    pub has_deprecations: bool,
}

/// Feature extractor that builds PredictionInput from raw data
pub struct FeatureExtractor {
    changelog_analyzer: ChangelogAnalyzer,
}

impl FeatureExtractor {
    pub fn new() -> Self {
        Self {
            changelog_analyzer: ChangelogAnalyzer::new(),
        }
    }
    
    /// Extract features for prediction from package data
    pub fn extract(
        &self,
        old_version: Option<&str>,
        new_version: &str,
        changelog: Option<&str>,
        old_deps: Option<&HashMap<String, String>>,
        new_deps: Option<&HashMap<String, String>>,
    ) -> PredictionInput {
        let mut input = PredictionInput {
            old_version: old_version.map(String::from),
            new_version: new_version.to_string(),
            changelog: changelog.map(String::from),
            ..Default::default()
        };
        
        // Analyze dependencies if available
        if let (Some(old), Some(new)) = (old_deps, new_deps) {
            let diff = DependencyDiff::compute(old, new);
            input.dependencies_removed = diff.removed.len();
            input.dependencies_major_updates = diff.major_updates.len();
        }
        
        // Check pre-release status
        if let Some(semver) = SemverAnalysis::parse(new_version) {
            input.is_pre_release = semver.pre_release.is_some();
        }
        
        input
    }
}

impl Default for FeatureExtractor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_semver_parse() {
        let ver = SemverAnalysis::parse("1.2.3").unwrap();
        assert_eq!(ver.major, 1);
        assert_eq!(ver.minor, 2);
        assert_eq!(ver.patch, 3);
        
        let ver = SemverAnalysis::parse("v2.0.0-beta.1+build.123").unwrap();
        assert_eq!(ver.major, 2);
        assert_eq!(ver.pre_release, Some("beta.1".to_string()));
        assert_eq!(ver.build_metadata, Some("build.123".to_string()));
    }
    
    #[test]
    fn test_version_bump_detection() {
        let old = SemverAnalysis::parse("1.0.0").unwrap();
        let new = SemverAnalysis::parse("2.0.0").unwrap();
        assert_eq!(old.compare(&new), VersionBump::Major);
        
        let old = SemverAnalysis::parse("1.0.0").unwrap();
        let new = SemverAnalysis::parse("1.1.0").unwrap();
        assert_eq!(old.compare(&new), VersionBump::Minor);
    }
    
    #[test]
    fn test_dependency_diff() {
        let old: HashMap<String, String> = [
            ("lodash".to_string(), "4.17.0".to_string()),
            ("react".to_string(), "17.0.0".to_string()),
            ("old-dep".to_string(), "1.0.0".to_string()),
        ].into_iter().collect();
        
        let new: HashMap<String, String> = [
            ("lodash".to_string(), "4.18.0".to_string()),
            ("react".to_string(), "18.0.0".to_string()),
            ("new-dep".to_string(), "1.0.0".to_string()),
        ].into_iter().collect();
        
        let diff = DependencyDiff::compute(&old, &new);
        assert_eq!(diff.removed.len(), 1);
        assert!(diff.removed.contains(&"old-dep".to_string()));
        assert_eq!(diff.added.len(), 1);
        assert!(diff.added.contains(&"new-dep".to_string()));
        assert_eq!(diff.major_updates.len(), 1); // react 17->18
        assert_eq!(diff.minor_updates.len(), 1); // lodash 4.17->4.18
    }
    
    #[test]
    fn test_changelog_analysis() {
        let analyzer = ChangelogAnalyzer::new();
        
        let changelog = "## 2.0.0\n\nBREAKING CHANGE: Removed legacy API\nMigration required\n";
        let result = analyzer.analyze(changelog);
        assert!(result.breaking_score > 0.5);
        assert!(result.has_migration_notes);
        
        let safe_changelog = "## 1.0.1\n\nBug fixes and improvements\n";
        let result = analyzer.analyze(safe_changelog);
        assert!(result.breaking_score < 0.1);
    }
}

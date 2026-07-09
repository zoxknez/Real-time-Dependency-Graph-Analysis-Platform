//! PyPI Diff - Calculate differences between package states

use super::state::VersionInfo;
use std::collections::{HashMap, HashSet};

/// Result of comparing old and new version states
#[derive(Debug, Default)]
pub struct PypiDiff {
    /// Newly added versions
    pub added: Vec<String>,
    /// Removed versions
    pub removed: Vec<String>,
    /// Versions that were yanked
    pub yanked: Vec<String>,
    /// Versions that were unyanked
    pub unyanked: Vec<String>,
}

impl PypiDiff {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty()
            && self.removed.is_empty()
            && self.yanked.is_empty()
            && self.unyanked.is_empty()
    }
}

/// Calculate diff between old and new version states
pub fn calculate_diff(old: &[VersionInfo], new: &[VersionInfo]) -> PypiDiff {
    let old_map: HashMap<&str, bool> = old.iter().map(|v| (v.version.as_str(), v.yanked)).collect();

    let new_map: HashMap<&str, bool> = new.iter().map(|v| (v.version.as_str(), v.yanked)).collect();

    let old_versions: HashSet<&str> = old_map.keys().copied().collect();
    let new_versions: HashSet<&str> = new_map.keys().copied().collect();

    let mut diff = PypiDiff::default();

    // Added versions
    for v in new_versions.difference(&old_versions) {
        diff.added.push(v.to_string());
    }

    // Removed versions
    for v in old_versions.difference(&new_versions) {
        diff.removed.push(v.to_string());
    }

    // Yanked/Unyanked (versions that exist in both but changed yank status)
    for v in old_versions.intersection(&new_versions) {
        let old_yanked = old_map.get(*v).copied().unwrap_or(false);
        let new_yanked = new_map.get(*v).copied().unwrap_or(false);

        if !old_yanked && new_yanked {
            diff.yanked.push(v.to_string());
        } else if old_yanked && !new_yanked {
            diff.unyanked.push(v.to_string());
        }
    }

    diff
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_added_versions() {
        let old = vec![VersionInfo::new("1.0.0".to_string(), false)];
        let new = vec![
            VersionInfo::new("1.0.0".to_string(), false),
            VersionInfo::new("1.1.0".to_string(), false),
        ];

        let diff = calculate_diff(&old, &new);
        assert_eq!(diff.added, vec!["1.1.0"]);
        assert!(diff.removed.is_empty());
        assert!(diff.yanked.is_empty());
    }

    #[test]
    fn test_diff_yanked() {
        let old = vec![VersionInfo::new("1.0.0".to_string(), false)];
        let new = vec![VersionInfo::new("1.0.0".to_string(), true)];

        let diff = calculate_diff(&old, &new);
        assert!(diff.added.is_empty());
        assert_eq!(diff.yanked, vec!["1.0.0"]);
    }

    #[test]
    fn test_diff_unyanked() {
        let old = vec![VersionInfo::new("1.0.0".to_string(), true)];
        let new = vec![VersionInfo::new("1.0.0".to_string(), false)];

        let diff = calculate_diff(&old, &new);
        assert_eq!(diff.unyanked, vec!["1.0.0"]);
    }
}

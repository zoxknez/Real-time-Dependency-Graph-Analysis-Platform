//! Cargo Index Diff
//!
//! Calculates differences between old and new index state.
//! Detects: new versions, removed versions, yanked, unyanked.

use super::index::CrateIndexEntry;
use super::state::VersionState;
use std::collections::{HashMap, HashSet};

/// Result of diffing old state against new index entries
#[derive(Debug, Default)]
pub struct CargoDiff {
    /// New versions (not in previous state)
    pub added: Vec<CrateIndexEntry>,
    
    /// Versions no longer in index (rare, but possible)
    pub removed: Vec<String>,
    
    /// Versions that were yanked (yanked: false -> true)
    pub yanked: Vec<String>,
    
    /// Versions that were unyanked (yanked: true -> false)
    pub unyanked: Vec<String>,
    
    /// Versions with other changes (cksum, deps - very rare)
    pub modified: Vec<String>,
}

impl CargoDiff {
    /// Returns true if there are any changes
    pub fn has_changes(&self) -> bool {
        !self.added.is_empty()
            || !self.removed.is_empty()
            || !self.yanked.is_empty()
            || !self.unyanked.is_empty()
            || !self.modified.is_empty()
    }

    /// Total number of changes
    pub fn change_count(&self) -> usize {
        self.added.len()
            + self.removed.len()
            + self.yanked.len()
            + self.unyanked.len()
            + self.modified.len()
    }
}

/// Calculate diff between old state and new index entries
pub fn calculate_diff(
    old_state: &HashMap<String, VersionState>,
    new_entries: &[CrateIndexEntry],
) -> CargoDiff {
    let mut diff = CargoDiff::default();

    // Create map of new entries for lookup
    let _new_map: HashMap<&str, &CrateIndexEntry> = new_entries
        .iter()
        .map(|e| (e.version.as_str(), e))
        .collect();

    // Check for added, yanked, unyanked, modified
    for entry in new_entries {
        match old_state.get(&entry.version) {
            None => {
                // New version
                diff.added.push(entry.clone());
            }
            Some(old) => {
                // Existing version - check for changes
                if old.yanked != entry.yanked {
                    if entry.yanked {
                        diff.yanked.push(entry.version.clone());
                    } else {
                        diff.unyanked.push(entry.version.clone());
                    }
                } else if old.cksum != entry.cksum {
                    // Checksum changed (very unusual)
                    diff.modified.push(entry.version.clone());
                }
            }
        }
    }

    // Check for removed versions
    let new_versions: HashSet<&str> = new_entries.iter().map(|e| e.version.as_str()).collect();
    for old_version in old_state.keys() {
        if !new_versions.contains(old_version.as_str()) {
            diff.removed.push(old_version.clone());
        }
    }

    diff
}

/// Check if this is a first-time sync (no previous state)
pub fn is_initial_sync(old_state: &HashMap<String, VersionState>) -> bool {
    old_state.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_entry(version: &str, yanked: bool) -> CrateIndexEntry {
        CrateIndexEntry {
            name: "test".to_string(),
            version: version.to_string(),
            deps: vec![],
            cksum: format!("cksum_{}", version),
            features: Default::default(),
            yanked,
            links: None,
            rust_version: None,
            features2: Default::default(),
        }
    }

    fn make_state(version: &str, yanked: bool) -> VersionState {
        VersionState {
            version: version.to_string(),
            yanked,
            cksum: format!("cksum_{}", version),
            deps_count: 0,
        }
    }

    #[test]
    fn test_initial_sync() {
        let old_state = HashMap::new();
        let new_entries = vec![
            make_entry("1.0.0", false),
            make_entry("1.1.0", false),
        ];

        let diff = calculate_diff(&old_state, &new_entries);

        assert!(is_initial_sync(&old_state));
        assert_eq!(diff.added.len(), 2);
        assert!(diff.removed.is_empty());
        assert!(diff.yanked.is_empty());
    }

    #[test]
    fn test_new_version() {
        let mut old_state = HashMap::new();
        old_state.insert("1.0.0".to_string(), make_state("1.0.0", false));

        let new_entries = vec![
            make_entry("1.0.0", false),
            make_entry("1.1.0", false),
        ];

        let diff = calculate_diff(&old_state, &new_entries);

        assert_eq!(diff.added.len(), 1);
        assert_eq!(diff.added[0].version, "1.1.0");
    }

    #[test]
    fn test_yanked_version() {
        let mut old_state = HashMap::new();
        old_state.insert("1.0.0".to_string(), make_state("1.0.0", false));

        let new_entries = vec![make_entry("1.0.0", true)];

        let diff = calculate_diff(&old_state, &new_entries);

        assert_eq!(diff.yanked.len(), 1);
        assert_eq!(diff.yanked[0], "1.0.0");
    }

    #[test]
    fn test_unyanked_version() {
        let mut old_state = HashMap::new();
        old_state.insert("1.0.0".to_string(), make_state("1.0.0", true));

        let new_entries = vec![make_entry("1.0.0", false)];

        let diff = calculate_diff(&old_state, &new_entries);

        assert_eq!(diff.unyanked.len(), 1);
        assert_eq!(diff.unyanked[0], "1.0.0");
    }

    #[test]
    fn test_removed_version() {
        let mut old_state = HashMap::new();
        old_state.insert("1.0.0".to_string(), make_state("1.0.0", false));
        old_state.insert("0.9.0".to_string(), make_state("0.9.0", false));

        let new_entries = vec![make_entry("1.0.0", false)];

        let diff = calculate_diff(&old_state, &new_entries);

        assert_eq!(diff.removed.len(), 1);
        assert_eq!(diff.removed[0], "0.9.0");
    }
}

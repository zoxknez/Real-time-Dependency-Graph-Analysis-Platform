//! Crate index format parser
//!
//! The crates.io index stores one JSON object per line for each version.
//! See: https://doc.rust-lang.org/cargo/reference/registries.html#index-format

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A single version entry from the crate index file
/// Each line in the index file is one of these
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrateIndexEntry {
    /// Crate name
    pub name: String,

    /// Version string
    #[serde(rename = "vers")]
    pub version: String,

    /// Dependencies
    #[serde(default)]
    pub deps: Vec<CrateDependency>,

    /// SHA256 checksum of .crate file
    pub cksum: String,

    /// Features
    #[serde(default)]
    pub features: HashMap<String, Vec<String>>,

    /// Whether this version is yanked
    #[serde(default)]
    pub yanked: bool,

    /// Links to system library
    pub links: Option<String>,

    /// Rust version requirement
    pub rust_version: Option<String>,

    /// Features with version 2 format
    #[serde(default)]
    pub features2: HashMap<String, Vec<String>>,
}

/// Dependency specification in the index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrateDependency {
    /// Dependency crate name
    pub name: String,

    /// Version requirement (SemVer)
    pub req: String,

    /// Features to enable
    #[serde(default)]
    pub features: Vec<String>,

    /// Is this an optional dependency?
    #[serde(default)]
    pub optional: bool,

    /// Use default features?
    #[serde(default = "default_true")]
    pub default_features: bool,

    /// Target platform filter
    pub target: Option<String>,

    /// Dependency kind (normal, dev, build)
    #[serde(default)]
    pub kind: DependencyKind,

    /// Alternative registry
    pub registry: Option<String>,

    /// Package name if different from crate name  
    pub package: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DependencyKind {
    #[default]
    Normal,
    Dev,
    Build,
}

impl CrateIndexEntry {
    /// Parse multiple entries from index file content (JSON lines)
    pub fn parse_index_file(content: &str) -> Vec<CrateIndexEntry> {
        content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect()
    }

    /// Get the index path for a crate name
    ///
    /// Crates are stored in a directory hierarchy based on name length:
    /// - 1 char: 1/{name}
    /// - 2 chars: 2/{name}  
    /// - 3 chars: 3/{first_char}/{name}
    /// - 4+ chars: {first_two}/{next_two}/{name}
    pub fn index_path(name: &str) -> String {
        let name_lower = name.to_lowercase();
        match name_lower.len() {
            1 => format!("1/{}", name_lower),
            2 => format!("2/{}", name_lower),
            3 => format!("3/{}/{}", &name_lower[..1], name_lower),
            _ => format!("{}/{}/{}", &name_lower[..2], &name_lower[2..4], name_lower),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_index_entry() {
        let json = r#"{"name":"serde","vers":"1.0.0","deps":[{"name":"serde_derive","req":"^1.0","features":[],"optional":true,"default_features":true,"target":null,"kind":"normal"}],"cksum":"abc123","features":{"derive":["serde_derive"]},"yanked":false}"#;

        let entry: CrateIndexEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.name, "serde");
        assert_eq!(entry.version, "1.0.0");
        assert!(!entry.yanked);
        assert_eq!(entry.deps.len(), 1);
    }

    #[test]
    fn test_index_path() {
        assert_eq!(CrateIndexEntry::index_path("a"), "1/a");
        assert_eq!(CrateIndexEntry::index_path("ab"), "2/ab");
        assert_eq!(CrateIndexEntry::index_path("abc"), "3/a/abc");
        assert_eq!(CrateIndexEntry::index_path("serde"), "se/rd/serde");
        assert_eq!(CrateIndexEntry::index_path("tokio"), "to/ki/tokio");
    }

    #[test]
    fn test_parse_index_file() {
        let content = r#"{"name":"foo","vers":"1.0.0","deps":[],"cksum":"aaa","features":{},"yanked":false}
{"name":"foo","vers":"1.1.0","deps":[],"cksum":"bbb","features":{},"yanked":false}"#;

        let entries = CrateIndexEntry::parse_index_file(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].version, "1.0.0");
        assert_eq!(entries[1].version, "1.1.0");
    }
}

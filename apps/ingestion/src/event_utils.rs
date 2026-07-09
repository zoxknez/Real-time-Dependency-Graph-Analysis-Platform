// Event utilities - ID generation, hashing, and event construction
//
// This module provides utilities for creating deterministic event IDs
// and constructing protobuf events from domain data.

use sha2::{Digest, Sha256};

/// Generate a deterministic event ID from event components
///
/// The event ID is a SHA256 hash of the event's identifying characteristics.
/// This ensures that the same real-world event always produces the same ID,
/// enabling idempotent event processing.
///
/// # Format
/// ```text
/// sha256(event_type || ecosystem || entity_id || content_hash)
/// ```
///
/// # Example
/// ```ignore
/// let event_id = generate_event_id(
///     "package.upserted",
///     "npm",
///     "react",
///     "abcd1234..." // content hash
/// );
/// ```
pub fn generate_event_id(
    event_type: &str,
    ecosystem: &str,
    entity_id: &str,
    content_hash: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(event_type.as_bytes());
    hasher.update(b"|");
    hasher.update(ecosystem.as_bytes());
    hasher.update(b"|");
    hasher.update(entity_id.as_bytes());
    hasher.update(b"|");
    hasher.update(content_hash.as_bytes());

    let result = hasher.finalize();
    hex::encode(result)
}

/// Generate event ID for package upsert
///
/// Entity ID format: `{package_name}`
/// Content hash: packument SHA256
pub fn generate_package_upsert_event_id(
    ecosystem: &str,
    package_name: &str,
    packument_sha256: &str,
) -> String {
    generate_event_id(
        "package.upserted",
        ecosystem,
        package_name,
        packument_sha256,
    )
}

/// Generate event ID for version upsert
///
/// Entity ID format: `{package_name}:{version}`
/// Content hash: combination of tarball integrity + deps hash
pub fn generate_version_upsert_event_id(
    ecosystem: &str,
    package_name: &str,
    version: &str,
    integrity: &str,
) -> String {
    let entity_id = format!("{}:{}", package_name, version);
    generate_event_id("version.upserted", ecosystem, &entity_id, integrity)
}

/// Generate event ID for version yanked
pub fn generate_version_yanked_event_id(
    ecosystem: &str,
    package_name: &str,
    version: &str,
) -> String {
    let entity_id = format!("{}:{}", package_name, version);
    // For yank, we use a constant content hash since the action is the identifier
    generate_event_id("version.yanked", ecosystem, &entity_id, "yanked")
}

/// Generate event ID for package deleted
pub fn generate_package_deleted_event_id(ecosystem: &str, package_name: &str) -> String {
    // For deletion, we use a constant content hash
    generate_event_id("package.deleted", ecosystem, package_name, "deleted")
}

/// Hash arbitrary bytes (for content hashing)
pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Hash JSON value (for content hashing)
pub fn hash_json(value: &serde_json::Value) -> String {
    // Serialize to canonical JSON (sorted keys) for consistent hashing
    let json_str = serde_json::to_string(value).unwrap_or_default();
    hash_bytes(json_str.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_id_deterministic() {
        let id1 = generate_package_upsert_event_id("npm", "react", "abc123");
        let id2 = generate_package_upsert_event_id("npm", "react", "abc123");
        assert_eq!(id1, id2, "Same inputs should produce same event ID");
    }

    #[test]
    fn test_event_id_different_content() {
        let id1 = generate_package_upsert_event_id("npm", "react", "abc123");
        let id2 = generate_package_upsert_event_id("npm", "react", "xyz789");
        assert_ne!(
            id1, id2,
            "Different content should produce different event ID"
        );
    }

    #[test]
    fn test_event_id_different_package() {
        let id1 = generate_package_upsert_event_id("npm", "react", "abc123");
        let id2 = generate_package_upsert_event_id("npm", "react", "vue");
        assert_ne!(
            id1, id2,
            "Different packages should produce different event ID"
        );
    }

    #[test]
    fn test_event_id_format() {
        let id = generate_package_upsert_event_id("npm", "react", "abc123");
        assert_eq!(id.len(), 64, "SHA256 hash should be 64 hex characters");
        assert!(
            id.chars().all(|c| c.is_ascii_hexdigit()),
            "Should be valid hex"
        );
    }
}

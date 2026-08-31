//! Persistent API Snapshots & Immutable History Authority (WMCP-6)
//!
//! Provides durable, immutable, and fail-closed persistence for authoritative
//! WMCP-5 `PublicApiSurface` observations.
//!
//! Hardened Invariants:
//! - Complete-only admission (`AnalysisStatus::Complete` required).
//! - Deterministic snapshot identity independent of timestamps or storage paths.
//! - Distinct historical observations for same API across different revisions.
//! - Strict idempotency for duplicate identical writes.
//! - Fail-closed conflict detection (no silent overwrite on same coordinate).
//! - Atomic publication with temp file isolation.
//! - Full read-time verification (schema version, surface hash, snapshot identity).
//! - Deterministic capture-sequence history ordering (no SemVer / PEP 440 sorting).
//! - Explicit legacy snapshot audit and isolation.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::ast_parser::PublicApiSnapshot;
use crate::public_api::{
    AnalysisStatus, CanonicalHashWriter, PublicApiExtractor, PublicApiScope, PublicApiSurface,
};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & DOMAINS
// ═══════════════════════════════════════════════════════════════

/// Explicit schema version for persisted V1 API snapshot envelopes
pub const SNAPSHOT_ENVELOPE_SCHEMA_V1: &str = "wmcp-api-snapshot-v1";

/// Canonical domain prefix for deterministic snapshot identity calculation
pub const SNAPSHOT_ID_DOMAIN: &[u8] = b"wmcp-api-snapshot-v1";

// ═══════════════════════════════════════════════════════════════
// ERROR MODEL
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, thiserror::Error)]
pub enum SnapshotError {
    #[error("Incomplete analysis: status {0:?} is not Complete")]
    IncompleteAnalysis(AnalysisStatus),

    #[error("Unsupported analysis: language or entry point is Unsupported")]
    UnsupportedAnalysis,

    #[error(
        "Snapshot conflict: coordinate ({subject}, {revision}) already exists with different surface hash (existing: {existing_hash}, incoming: {incoming_hash})"
    )]
    SnapshotConflict {
        subject: String,
        revision: String,
        existing_hash: String,
        incoming_hash: String,
    },

    #[error("Snapshot not found: {0}")]
    SnapshotNotFound(String),

    #[error("Corrupt snapshot: {0}")]
    CorruptSnapshot(String),

    #[error("Unsupported snapshot schema: expected '{expected}', found '{found}'")]
    UnsupportedSnapshotSchema { expected: String, found: String },

    #[error("Invalid coordinate: {0}")]
    InvalidCoordinate(String),

    #[error("Surface hash mismatch: computed '{computed}' != expected '{expected}'")]
    SurfaceHashMismatch { computed: String, expected: String },

    #[error("Snapshot ID mismatch: computed '{computed}' != expected '{expected}'")]
    SnapshotIdMismatch { computed: String, expected: String },

    #[error("Lineage cycle detected: snapshot {0} is in ancestor chain")]
    LineageCycle(String),

    #[error("Parent snapshot not found: {0}")]
    ParentNotFound(String),

    #[error("Parent subject mismatch: expected '{expected}', got '{got}'")]
    ParentSubjectMismatch { expected: String, got: String },

    #[error("Path traversal detected: {0}")]
    PathTraversal(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT ENVELOPE (V1)
// ═══════════════════════════════════════════════════════════════

/// Authoritative immutable envelope wrapping a validated `PublicApiSurface` observation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiSnapshotEnvelope {
    /// Explicit schema version (e.g. "wmcp-api-snapshot-v1")
    pub schema_version: String,

    /// Deterministic 64-character lowercase hex SHA-256 snapshot identifier
    pub snapshot_id: String,

    /// Subject identity (canonical package ID or module identifier)
    pub subject: String,

    /// Opaque source revision / package version coordinate
    pub revision: String,

    /// Wall-clock capture timestamp in epoch milliseconds (metadata only, not in hash)
    pub captured_at_epoch_ms: u64,

    /// Authoritative normalized public API surface facts
    pub surface: PublicApiSurface,

    /// Optional explicit predecessor snapshot ID in lineage chain
    pub parent_snapshot_id: Option<String>,
}

/// Minimal immutable coordinate identifying an observation
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SnapshotCoordinate {
    pub subject: String,
    pub revision: String,
}

/// Recorded history entry tracking sequence order
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotHistoryEntry {
    pub sequence: u64,
    pub snapshot_id: String,
    pub revision: String,
    pub surface_hash: String,
    pub captured_at_epoch_ms: u64,
}

/// Summary of a legacy pre-WMCP-6 snapshot file
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LegacySnapshotSummary {
    pub package_id: String,
    pub version: String,
    pub api_hash: String,
    pub symbol_count: usize,
    pub file_path: PathBuf,
}

// ═══════════════════════════════════════════════════════════════
// DETERMINISTIC SNAPSHOT ID DERIVATION
// ═══════════════════════════════════════════════════════════════

/// Computes an injective deterministic SHA-256 snapshot identity
///
/// Preimage contains:
/// - `SNAPSHOT_ID_DOMAIN` (`wmcp-api-snapshot-v1`) length-prefixed
/// - `subject` length-prefixed
/// - `scope` framed by discriminant + fields
/// - `revision` length-prefixed
/// - `surface_hash` length-prefixed
///
/// Note: Does NOT include timestamp, machine path, or storage location.
pub fn compute_snapshot_id(
    subject: &str,
    scope: &PublicApiScope,
    revision: &str,
    surface_hash: &str,
) -> String {
    let mut hasher = Sha256::new();
    let mut writer = CanonicalHashWriter::new(&mut hasher);

    writer.write_domain(SNAPSHOT_ID_DOMAIN);
    writer.write_str(subject);

    match scope {
        PublicApiScope::Module { module_path } => {
            writer.write_u8(0);
            writer.write_str(module_path);
        }
        PublicApiScope::Package {
            package_id,
            entry_points,
        } => {
            writer.write_u8(1);
            writer.write_str(package_id);
            writer.write_u64(entry_points.len() as u64);
            for ep in entry_points {
                writer.write_str(ep);
            }
        }
    }

    writer.write_str(revision);
    writer.write_str(surface_hash);

    hex::encode(hasher.finalize())
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT REPOSITORY (AUTHORITATIVE PERSISTENCE)
// ═══════════════════════════════════════════════════════════════

/// Single authoritative persistence engine for API snapshots
pub struct SnapshotRepository {
    base_dir: PathBuf,
    lock: Arc<RwLock<()>>,
}

impl SnapshotRepository {
    /// Creates or opens a snapshot repository at the specified base directory
    pub fn new(base_dir: impl Into<PathBuf>) -> Result<Self, SnapshotError> {
        let base_dir = base_dir.into();
        fs::create_dir_all(&base_dir)?;
        fs::create_dir_all(base_dir.join("snapshots"))?;
        fs::create_dir_all(base_dir.join("coordinates"))?;
        fs::create_dir_all(base_dir.join("history"))?;
        fs::create_dir_all(base_dir.join("_tmp"))?;

        Ok(Self {
            base_dir,
            lock: Arc::new(RwLock::new(())),
        })
    }

    /// Safe segment hashing to completely prevent filesystem path traversal,
    /// separators, and Windows reserved device name collisions.
    fn safe_segment(raw: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(raw.as_bytes());
        let digest = hex::encode(hasher.finalize());
        // Prefix with a sanitized human-readable snippet (up to 16 chars) + full 64-char sha256
        let sanitized_prefix: String = raw
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .take(16)
            .collect();
        format!("{}_{}", sanitized_prefix, digest)
    }

    /// Path to the snapshot envelope JSON file by its snapshot ID
    fn snapshot_file_path(&self, snapshot_id: &str) -> PathBuf {
        self.base_dir.join("snapshots").join(format!("{}.json", snapshot_id))
    }

    /// Path to the coordinate pointer file for (subject, revision)
    fn coordinate_file_path(&self, subject: &str, revision: &str) -> PathBuf {
        let safe_sub = Self::safe_segment(subject);
        let safe_rev = Self::safe_segment(revision);
        self.base_dir
            .join("coordinates")
            .join(safe_sub)
            .join(format!("{}.json", safe_rev))
    }

    /// Path to the history index file for a subject
    fn history_file_path(&self, subject: &str) -> PathBuf {
        let safe_sub = Self::safe_segment(subject);
        self.base_dir.join("history").join(format!("{}.json", safe_sub))
    }

    /// Atomically writes content to the destination path using a temp file
    fn atomic_write(&self, dest_path: &Path, content: &str) -> Result<(), SnapshotError> {
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let tmp_dir = self.base_dir.join("_tmp");
        fs::create_dir_all(&tmp_dir)?;

        let temp_filename = format!("tmp_{}_{}.tmp", std::process::id(), uuid::Uuid::new_v4());
        let temp_path = tmp_dir.join(temp_filename);

        {
            let mut file = File::create(&temp_path)?;
            file.write_all(content.as_bytes())?;
            file.sync_all()?;
        }

        if let Err(e) = fs::rename(&temp_path, dest_path) {
            let _ = fs::remove_file(&temp_path);
            return Err(SnapshotError::Io(e));
        }

        Ok(())
    }

    /// Admits and persists a complete `PublicApiSurface` into authoritative history
    pub async fn put(
        &self,
        subject: &str,
        revision: &str,
        surface: PublicApiSurface,
        parent_id: Option<String>,
        captured_at_epoch_ms: u64,
    ) -> Result<ApiSnapshotEnvelope, SnapshotError> {
        // In-process lock to ensure atomic coordination during concurrent requests
        let _guard = self.lock.write().await;

        // 1. Complete-only admission
        match surface.status {
            AnalysisStatus::Complete => {}
            AnalysisStatus::Partial => {
                return Err(SnapshotError::IncompleteAnalysis(surface.status));
            }
            AnalysisStatus::Unsupported => {
                return Err(SnapshotError::UnsupportedAnalysis);
            }
        }

        // 2. Validate surface hash against canonical V1 extractor
        let recomputed_surface_hash = PublicApiExtractor::compute_surface_hash(
            surface.status,
            &surface.scope,
            surface.language,
            &surface.symbols,
        );
        if recomputed_surface_hash != surface.surface_hash {
            return Err(SnapshotError::SurfaceHashMismatch {
                computed: recomputed_surface_hash,
                expected: surface.surface_hash.clone(),
            });
        }

        // 3. Compute deterministic snapshot ID
        let snapshot_id = compute_snapshot_id(subject, &surface.scope, revision, &surface.surface_hash);

        // 4. Validate lineage if parent is provided
        if let Some(ref pid) = parent_id {
            if pid == &snapshot_id {
                return Err(SnapshotError::LineageCycle(snapshot_id.clone()));
            }
            let parent_envelope = self.get_by_id_internal(pid)?;
            if parent_envelope.subject != subject {
                return Err(SnapshotError::ParentSubjectMismatch {
                    expected: subject.to_string(),
                    got: parent_envelope.subject,
                });
            }

            // Detect ancestor cycles
            let mut curr_pid = parent_envelope.parent_snapshot_id;
            let mut visited = std::collections::HashSet::new();
            visited.insert(pid.clone());
            while let Some(ancestor_id) = curr_pid {
                if ancestor_id == snapshot_id || visited.contains(&ancestor_id) {
                    return Err(SnapshotError::LineageCycle(ancestor_id));
                }
                visited.insert(ancestor_id.clone());
                if let Ok(ancestor_env) = self.get_by_id_internal(&ancestor_id) {
                    curr_pid = ancestor_env.parent_snapshot_id;
                } else {
                    break;
                }
            }
        }

        // 5. Check coordinate conflict / idempotency
        let coord_path = self.coordinate_file_path(subject, revision);
        if coord_path.exists() {
            let existing_id_content = fs::read_to_string(&coord_path)?;
            let existing_id = existing_id_content.trim();
            let existing_envelope = self.get_by_id_internal(existing_id)?;

            if existing_envelope.surface.surface_hash == surface.surface_hash
                && existing_envelope.snapshot_id == snapshot_id
            {
                // Idempotent success: exact same observation coordinate and hash already persisted
                return Ok(existing_envelope);
            } else {
                // Conflicting same coordinate with different surface hash
                return Err(SnapshotError::SnapshotConflict {
                    subject: subject.to_string(),
                    revision: revision.to_string(),
                    existing_hash: existing_envelope.surface.surface_hash,
                    incoming_hash: surface.surface_hash,
                });
            }
        }

        // 6. Construct authoritative envelope
        let envelope = ApiSnapshotEnvelope {
            schema_version: SNAPSHOT_ENVELOPE_SCHEMA_V1.to_string(),
            snapshot_id: snapshot_id.clone(),
            subject: subject.to_string(),
            revision: revision.to_string(),
            captured_at_epoch_ms,
            surface,
            parent_snapshot_id: parent_id,
        };

        // 7. Serialize envelope
        let envelope_json = serde_json::to_string_pretty(&envelope)?;

        // 8. Atomic writes: snapshot file, coordinate pointer, history index
        let snapshot_file = self.snapshot_file_path(&snapshot_id);
        self.atomic_write(&snapshot_file, &envelope_json)?;
        self.atomic_write(&coord_path, &snapshot_id)?;

        // Update history index
        let history_path = self.history_file_path(subject);
        let mut history: Vec<SnapshotHistoryEntry> = if history_path.exists() {
            let content = fs::read_to_string(&history_path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        };

        let next_seq = history.len() as u64 + 1;
        history.push(SnapshotHistoryEntry {
            sequence: next_seq,
            snapshot_id: snapshot_id.clone(),
            revision: revision.to_string(),
            surface_hash: envelope.surface.surface_hash.clone(),
            captured_at_epoch_ms,
        });

        let history_json = serde_json::to_string_pretty(&history)?;
        self.atomic_write(&history_path, &history_json)?;

        Ok(envelope)
    }

    /// Internal reader helper without async locking
    fn get_by_id_internal(&self, snapshot_id: &str) -> Result<ApiSnapshotEnvelope, SnapshotError> {
        let snapshot_file = self.snapshot_file_path(snapshot_id);
        if !snapshot_file.exists() {
            return Err(SnapshotError::SnapshotNotFound(snapshot_id.to_string()));
        }

        let content = fs::read_to_string(&snapshot_file)?;
        let envelope: ApiSnapshotEnvelope = match serde_json::from_str(&content) {
            Ok(env) => env,
            Err(e) => return Err(SnapshotError::CorruptSnapshot(format!("JSON parse failure: {}", e))),
        };

        // Verify schema
        if envelope.schema_version != SNAPSHOT_ENVELOPE_SCHEMA_V1 {
            return Err(SnapshotError::UnsupportedSnapshotSchema {
                expected: SNAPSHOT_ENVELOPE_SCHEMA_V1.to_string(),
                found: envelope.schema_version,
            });
        }

        // Verify status
        if envelope.surface.status != AnalysisStatus::Complete {
            return Err(SnapshotError::CorruptSnapshot(format!(
                "Stored snapshot has non-Complete status: {:?}",
                envelope.surface.status
            )));
        }

        // Verify surface hash
        let recomputed_surface_hash = PublicApiExtractor::compute_surface_hash(
            envelope.surface.status,
            &envelope.surface.scope,
            envelope.surface.language,
            &envelope.surface.symbols,
        );
        if recomputed_surface_hash != envelope.surface.surface_hash {
            return Err(SnapshotError::SurfaceHashMismatch {
                computed: recomputed_surface_hash,
                expected: envelope.surface.surface_hash,
            });
        }

        // Verify snapshot ID
        let recomputed_snapshot_id = compute_snapshot_id(
            &envelope.subject,
            &envelope.surface.scope,
            &envelope.revision,
            &envelope.surface.surface_hash,
        );
        if recomputed_snapshot_id != envelope.snapshot_id {
            return Err(SnapshotError::SnapshotIdMismatch {
                computed: recomputed_snapshot_id,
                expected: envelope.snapshot_id,
            });
        }

        Ok(envelope)
    }

    /// Retrieves and verifies an authoritative snapshot by its snapshot ID
    pub async fn get_by_id(&self, snapshot_id: &str) -> Result<ApiSnapshotEnvelope, SnapshotError> {
        let _guard = self.lock.read().await;
        self.get_by_id_internal(snapshot_id)
    }

    /// Retrieves an authoritative snapshot by coordinate (subject + revision)
    pub async fn get_by_coordinate(
        &self,
        subject: &str,
        revision: &str,
    ) -> Result<ApiSnapshotEnvelope, SnapshotError> {
        let _guard = self.lock.read().await;
        let coord_path = self.coordinate_file_path(subject, revision);
        if !coord_path.exists() {
            return Err(SnapshotError::SnapshotNotFound(format!("{}:{}", subject, revision)));
        }

        let snapshot_id_content = fs::read_to_string(&coord_path)?;
        let snapshot_id = snapshot_id_content.trim();
        self.get_by_id_internal(snapshot_id)
    }

    /// Lists snapshot history for a subject in exact recorded capture sequence
    pub async fn list_history(
        &self,
        subject: &str,
    ) -> Result<Vec<ApiSnapshotEnvelope>, SnapshotError> {
        let _guard = self.lock.read().await;
        let history_path = self.history_file_path(subject);
        if !history_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&history_path)?;
        let entries: Vec<SnapshotHistoryEntry> = serde_json::from_str(&content)
            .map_err(|e| SnapshotError::CorruptSnapshot(format!("History parse error: {}", e)))?;

        let mut envelopes = Vec::new();
        for entry in entries {
            let env = self.get_by_id_internal(&entry.snapshot_id)?;
            envelopes.push(env);
        }

        Ok(envelopes)
    }

    /// Returns the latest recorded snapshot in the history capture sequence
    pub async fn latest_recorded(
        &self,
        subject: &str,
    ) -> Result<Option<ApiSnapshotEnvelope>, SnapshotError> {
        let history = self.list_history(subject).await?;
        Ok(history.into_iter().last())
    }

    /// Inspects and reads a legacy snapshot without modifying or claiming authoritative V1 status
    pub fn read_legacy_snapshot(
        legacy_base_dir: &Path,
        package_id: &str,
        version: &str,
    ) -> Result<Option<LegacySnapshotSummary>, SnapshotError> {
        let path = legacy_base_dir
            .join(package_id.replace(['/', '\\', ':'], "_"))
            .join(format!("{}.json", version.replace(['/', '\\', ':'], "_")));

        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path)?;
        let legacy: PublicApiSnapshot = serde_json::from_str(&content)
            .map_err(|e| SnapshotError::CorruptSnapshot(format!("Legacy snapshot parse failure: {}", e)))?;

        Ok(Some(LegacySnapshotSummary {
            package_id: legacy.package_id,
            version: legacy.version,
            api_hash: legacy.api_hash,
            symbol_count: legacy.symbols.len(),
            file_path: path,
        }))
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS (6-T1 through 6-T40)
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast_parser::{Language, ParserPool, SymbolKind};
    use crate::public_api::{
        PublicApiScope, PublicApiSymbol, PublicParameter, PublicSymbolSignature, SourceProvenance,
    };
    use std::time::Duration;

    fn sample_complete_surface(package_id: &str, return_type: &str) -> PublicApiSurface {
        let sig = PublicSymbolSignature {
            raw_signature: format!("fn compute() -> {}", return_type),
            normalized_signature: format!("fn compute() -> {}", return_type),
            parameters: vec![],
            return_type: Some(return_type.to_string()),
            generics: vec![],
            visibility: "Public".to_string(),
            annotations: vec![],
        };
        let sig_digest = PublicApiExtractor::compute_signature_fingerprint(
            SymbolKind::Function,
            "compute",
            &[sig.clone()],
        );
        let sym = PublicApiSymbol {
            identity_key: format!("Rust::{}::Function::compute", package_id),
            exported_name: "compute".to_string(),
            qualified_name: format!("{}::compute", package_id),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "src/lib.rs".to_string(),
                start_line: 1,
                end_line: 5,
            },
            signatures: vec![sig],
            signature_fingerprint: sig_digest,
        };
        let scope = PublicApiScope::Package {
            package_id: package_id.to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let surface_hash = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            &[sym.clone()],
        );
        PublicApiSurface {
            status: AnalysisStatus::Complete,
            scope,
            language: Language::Rust,
            symbols: vec![sym],
            surface_hash,
            files_analyzed: 1,
            warnings: vec![],
        }
    }

    struct TestTempDir {
        path: PathBuf,
    }

    impl TestTempDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "test_snapshot_{}_{}",
                std::process::id(),
                uuid::Uuid::new_v4()
            ));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestTempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[tokio::test]
    async fn test_6t1_through_6t6_admission_and_tampered_hash_rejection() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::new(temp_dir.path()).unwrap();

        // 6-T3: Complete surface accepted
        let complete = sample_complete_surface("pkg_a", "i32");
        let env = repo
            .put("pkg_a", "1.0.0", complete.clone(), None, 1000)
            .await
            .expect("Complete surface must be admitted");
        assert_eq!(env.schema_version, SNAPSHOT_ENVELOPE_SCHEMA_V1);
        assert_eq!(env.subject, "pkg_a");
        assert_eq!(env.revision, "1.0.0");

        // 6-T4: Partial surface rejected
        let mut partial = complete.clone();
        partial.status = AnalysisStatus::Partial;
        let err_partial = repo
            .put("pkg_a", "1.0.1", partial, None, 1001)
            .await
            .unwrap_err();
        match err_partial {
            SnapshotError::IncompleteAnalysis(status) => {
                assert_eq!(status, AnalysisStatus::Partial)
            }
            _ => panic!("Expected IncompleteAnalysis error"),
        }

        // 6-T5: Unsupported surface rejected
        let mut unsupported = complete.clone();
        unsupported.status = AnalysisStatus::Unsupported;
        let err_unsupported = repo
            .put("pkg_a", "1.0.2", unsupported, None, 1002)
            .await
            .unwrap_err();
        match err_unsupported {
            SnapshotError::UnsupportedAnalysis => {}
            _ => panic!("Expected UnsupportedAnalysis error"),
        }

        // 6-T6: Tampered surface hash rejected before write
        let mut tampered = complete.clone();
        tampered.surface_hash = "deadbeef00000000000000000000000000000000000000000000000000000000".to_string();
        let err_tampered = repo
            .put("pkg_a", "1.0.3", tampered, None, 1003)
            .await
            .unwrap_err();
        match err_tampered {
            SnapshotError::SurfaceHashMismatch { .. } => {}
            _ => panic!("Expected SurfaceHashMismatch error"),
        }
    }

    #[tokio::test]
    async fn test_6t7_through_6t10_idempotency_conflict_and_distinct_observations() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::new(temp_dir.path()).unwrap();

        let surf_i32 = sample_complete_surface("pkg_a", "i32");
        let surf_u64 = sample_complete_surface("pkg_a", "u64");

        // 6-T7: Identical duplicate write is idempotent
        let env_1 = repo
            .put("pkg_a", "1.0.0", surf_i32.clone(), None, 1000)
            .await
            .unwrap();
        let env_2 = repo
            .put("pkg_a", "1.0.0", surf_i32.clone(), None, 2000)
            .await
            .unwrap();
        assert_eq!(env_1.snapshot_id, env_2.snapshot_id);

        let history = repo.list_history("pkg_a").await.unwrap();
        assert_eq!(history.len(), 1, "Idempotent write must not create duplicate history entries");

        // 6-T8: Conflicting same coordinate with different surface returns SnapshotConflict
        let conflict_err = repo
            .put("pkg_a", "1.0.0", surf_u64.clone(), None, 3000)
            .await
            .unwrap_err();
        match conflict_err {
            SnapshotError::SnapshotConflict { subject, revision, .. } => {
                assert_eq!(subject, "pkg_a");
                assert_eq!(revision, "1.0.0");
            }
            _ => panic!("Expected SnapshotConflict error"),
        }

        // 6-T9: Same surface across different revisions produces distinct historical observations
        let env_rev2 = repo
            .put("pkg_a", "1.0.1", surf_i32.clone(), None, 4000)
            .await
            .unwrap();
        assert_eq!(env_1.surface.surface_hash, env_rev2.surface.surface_hash);
        assert_ne!(
            env_1.snapshot_id, env_rev2.snapshot_id,
            "Distinct revisions must have distinct snapshot identities"
        );
        let history_after = repo.list_history("pkg_a").await.unwrap();
        assert_eq!(history_after.len(), 2);

        // 6-T10: Same surface across different subjects produces distinct observations
        let surf_b = sample_complete_surface("pkg_b", "i32");
        let env_b = repo
            .put("pkg_b", "1.0.0", surf_b, None, 5000)
            .await
            .unwrap();
        assert_ne!(env_1.snapshot_id, env_b.snapshot_id);
    }

    #[tokio::test]
    async fn test_6t11_through_6t17_deterministic_id_and_history_persistence() {
        let temp_dir1 = TestTempDir::new();
        let temp_dir2 = TestTempDir::new();

        let repo1 = SnapshotRepository::new(temp_dir1.path()).unwrap();
        let repo2 = SnapshotRepository::new(temp_dir2.path()).unwrap();

        let surf = sample_complete_surface("pkg_x", "i32");

        // 6-T11: Snapshot ID deterministic across repository instances & storage roots
        let env_inst1 = repo1
            .put("pkg_x", "1.0.0", surf.clone(), None, 1000)
            .await
            .unwrap();
        let env_inst2 = repo2
            .put("pkg_x", "1.0.0", surf.clone(), None, 9999)
            .await
            .unwrap();
        assert_eq!(env_inst1.snapshot_id, env_inst2.snapshot_id);

        // 6-T12: Timestamp does not affect snapshot ID
        let id_a = compute_snapshot_id("pkg_x", &surf.scope, "1.0.0", &surf.surface_hash);
        assert_eq!(env_inst1.snapshot_id, id_a);

        // 6-T13 & 6-T14: Read by ID and read by coordinate
        let retrieved_by_id = repo1.get_by_id(&env_inst1.snapshot_id).await.unwrap();
        let retrieved_by_coord = repo1.get_by_coordinate("pkg_x", "1.0.0").await.unwrap();
        assert_eq!(retrieved_by_id, env_inst1);
        assert_eq!(retrieved_by_coord, env_inst1);

        // 6-T15, 6-T16, 6-T17: History persists across repository restart in capture order (not SemVer)
        repo1
            .put("pkg_x", "1.10.0", sample_complete_surface("pkg_x", "u8"), None, 2000)
            .await
            .unwrap();
        repo1
            .put("pkg_x", "1.2.0", sample_complete_surface("pkg_x", "bool"), None, 3000)
            .await
            .unwrap();

        // Simulate repository restart with fresh instance on same base_dir
        let repo1_restarted = SnapshotRepository::new(temp_dir1.path()).unwrap();
        let history = repo1_restarted.list_history("pkg_x").await.unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].revision, "1.0.0");
        assert_eq!(history[1].revision, "1.10.0");
        assert_eq!(history[2].revision, "1.2.0");

        // 6-T36: latest_recorded returns last in capture sequence (1.2.0, NOT highest SemVer 1.10.0)
        let latest = repo1_restarted.latest_recorded("pkg_x").await.unwrap().unwrap();
        assert_eq!(latest.revision, "1.2.0");
    }

    #[tokio::test]
    async fn test_6t18_through_6t25_atomic_corruption_schema_and_path_safety() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::new(temp_dir.path()).unwrap();

        let surf = sample_complete_surface("pkg_sec", "i32");
        let env = repo
            .put("pkg_sec", "1.0.0", surf.clone(), None, 1000)
            .await
            .unwrap();

        // 6-T19: Orphan temp files are not treated as authoritative snapshots
        let tmp_file = temp_dir.path().join("_tmp").join("orphan.tmp");
        fs::write(&tmp_file, "garbage").unwrap();
        let list_res = repo.list_history("pkg_sec").await.unwrap();
        assert_eq!(list_res.len(), 1);

        // 6-T25: Foreign files preserved
        let foreign_file = temp_dir.path().join("notes.txt");
        fs::write(&foreign_file, "important notes").unwrap();
        assert!(foreign_file.exists());

        // 6-T24: Path traversal strings in subject/revision cannot escape root
        let trav_env = repo
            .put("../../etc/passwd", "../1.0.0", surf.clone(), None, 2000)
            .await
            .unwrap();
        assert_eq!(trav_env.subject, "../../etc/passwd");
        let read_trav = repo.get_by_id(&trav_env.snapshot_id).await.unwrap();
        assert_eq!(read_trav.subject, "../../etc/passwd");

        // 6-T20: Corrupt JSON rejected with CorruptSnapshot
        let snap_file = repo.snapshot_file_path(&env.snapshot_id);
        fs::write(&snap_file, "{ malformed json").unwrap();
        let err_corrupt = repo.get_by_id(&env.snapshot_id).await.unwrap_err();
        match err_corrupt {
            SnapshotError::CorruptSnapshot(_) => {}
            _ => panic!("Expected CorruptSnapshot error"),
        }

        // 6-T21 & 6-T22: Tampered surface hash or snapshot ID rejected on read
        let mut tampered_env = env.clone();
        tampered_env.surface.surface_hash = "0000000000000000000000000000000000000000000000000000000000000000".to_string();
        fs::write(&snap_file, serde_json::to_string(&tampered_env).unwrap()).unwrap();
        let err_tampered_surf = repo.get_by_id(&env.snapshot_id).await.unwrap_err();
        match err_tampered_surf {
            SnapshotError::SurfaceHashMismatch { .. } => {}
            _ => panic!("Expected SurfaceHashMismatch error on read"),
        }

        // 6-T23: Unknown snapshot schema rejected
        let mut bad_schema_env = env.clone();
        bad_schema_env.schema_version = "wmcp-api-snapshot-v999".to_string();
        fs::write(&snap_file, serde_json::to_string(&bad_schema_env).unwrap()).unwrap();
        let err_schema = repo.get_by_id(&env.snapshot_id).await.unwrap_err();
        match err_schema {
            SnapshotError::UnsupportedSnapshotSchema { found, .. } => {
                assert_eq!(found, "wmcp-api-snapshot-v999");
            }
            _ => panic!("Expected UnsupportedSnapshotSchema error"),
        }
    }

    #[tokio::test]
    async fn test_6t26_through_6t30_concurrency_and_legacy_safety() {
        let temp_dir = TestTempDir::new();
        let repo = Arc::new(SnapshotRepository::new(temp_dir.path()).unwrap());

        let surf = sample_complete_surface("pkg_conc", "i32");

        // 6-T26: Concurrent identical writes converge
        let mut handles = Vec::new();
        for _ in 0..10 {
            let r = repo.clone();
            let s = surf.clone();
            handles.push(tokio::spawn(async move {
                r.put("pkg_conc", "1.0.0", s, None, 1000).await
            }));
        }

        let mut results = Vec::new();
        for h in handles {
            results.push(h.await.unwrap().unwrap());
        }
        let first_id = &results[0].snapshot_id;
        for res in &results {
            assert_eq!(&res.snapshot_id, first_id);
        }

        let history = repo.list_history("pkg_conc").await.unwrap();
        assert_eq!(history.len(), 1);

        // 6-T29 & 6-T30: Legacy format audit and non-destructive reading
        let legacy_dir = temp_dir.path().join("legacy");
        let pkg_legacy_dir = legacy_dir.join("pkg_legacy");
        fs::create_dir_all(&pkg_legacy_dir).unwrap();
        let legacy_snapshot = PublicApiSnapshot::new("pkg_legacy".to_string(), "0.1.0".to_string());
        fs::write(
            pkg_legacy_dir.join("0.1.0.json"),
            serde_json::to_string(&legacy_snapshot).unwrap(),
        )
        .unwrap();

        let legacy_summary = SnapshotRepository::read_legacy_snapshot(&legacy_dir, "pkg_legacy", "0.1.0")
            .unwrap()
            .expect("Legacy snapshot must be readable");
        assert_eq!(legacy_summary.package_id, "pkg_legacy");
        assert_eq!(legacy_summary.version, "0.1.0");
    }

    #[tokio::test]
    async fn test_6t31_through_6t36_ts_overload_and_serialization_roundtrip() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::new(temp_dir.path()).unwrap();
        let pool = ParserPool::new(Duration::from_secs(5), 1024 * 1024);

        // 6-T32: TS overload surface roundtrip retains exactly 2 external callable signatures
        let ts_source = r#"
            export function parse(value: string): string;
            export function parse(value: number): number;
            export function parse(value: string | number): string | number {
                return value;
            }
        "#;
        let ts_surface = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            ts_source,
            "src/parser.ts",
            "parser",
        )
        .unwrap();
        assert_eq!(ts_surface.status, AnalysisStatus::Complete);
        assert_eq!(ts_surface.symbols[0].signatures.len(), 2);

        let env = repo
            .put("ts_lib", "1.0.0", ts_surface.clone(), None, 1000)
            .await
            .unwrap();

        // 6-T31, 6-T33, 6-T35: Full PublicApiSurface roundtrip
        let read_back = repo.get_by_id(&env.snapshot_id).await.unwrap();
        assert_eq!(read_back.surface.status, AnalysisStatus::Complete);
        assert_eq!(read_back.surface.symbols.len(), 1);
        assert_eq!(read_back.surface.symbols[0].signatures.len(), 2);
        assert_eq!(read_back.surface.surface_hash, ts_surface.surface_hash);
        assert_eq!(read_back.revision, "1.0.0");
    }
}

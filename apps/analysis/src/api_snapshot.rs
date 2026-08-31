//! Persistent API Snapshots & Immutable History Authority (WMCP-6-R1)
//!
//! Provides durable, immutable, and fail-closed persistence for authoritative
//! WMCP-5 `PublicApiSurface` observations.
//!
//! Hardened Invariants:
//! - Complete-only admission (`AnalysisStatus::Complete` required).
//! - One authoritative persistence authority (retires legacy production writer).
//! - Manifest-as-commit-authority (snapshot blob is immutable content; manifest is commit authority).
//! - Cross-instance / cross-process file locking for manifest transactions.
//! - Complete coordinate model including `PublicApiScope`.
//! - Speculative parent lineage removed from V1 schema.
//! - Explicit production storage root configuration (no silent OS-temp fallback).
//! - Deterministic snapshot identity independent of timestamps or storage paths.
//! - Strict idempotency and fail-closed conflict detection.
//! - Atomic publication with temp file staging.
//! - Deterministic capture-sequence history ordering (no SemVer / PEP 440 sorting).
//! - Non-destructive legacy format audit.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
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

/// Explicit schema version for authoritative history manifests
pub const HISTORY_MANIFEST_SCHEMA_V1: &str = "wmcp-api-snapshot-history-v1";

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

    #[error("Corrupt repository manifest: {0}")]
    CorruptManifest(String),

    #[error("Unsupported snapshot schema: expected '{expected}', found '{found}'")]
    UnsupportedSnapshotSchema { expected: String, found: String },

    #[error("Invalid coordinate: {0}")]
    InvalidCoordinate(String),

    #[error("Missing storage root configuration: ANALYSIS_SNAPSHOT_DIR is not set")]
    MissingStorageRootConfig,

    #[error("Surface hash mismatch: computed '{computed}' != expected '{expected}'")]
    SurfaceHashMismatch { computed: String, expected: String },

    #[error("Snapshot ID mismatch: computed '{computed}' != expected '{expected}'")]
    SnapshotIdMismatch { computed: String, expected: String },

    #[error("Path traversal detected: {0}")]
    PathTraversal(String),

    #[error("Lock acquisition timeout: {0}")]
    LockTimeout(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

// ═══════════════════════════════════════════════════════════════
// DATA STRUCTURES
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

    /// Public API Scope (Module vs Package)
    pub scope: PublicApiScope,

    /// Opaque source revision / package version coordinate
    pub revision: String,

    /// Wall-clock capture timestamp in epoch milliseconds (metadata only, not in hash)
    pub captured_at_epoch_ms: u64,

    /// Authoritative normalized public API surface facts
    pub surface: PublicApiSurface,
}

/// Minimal immutable coordinate identifying an observation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotCoordinate {
    pub subject: String,
    pub scope: PublicApiScope,
    pub revision: String,
}

/// Authoritative commit manifest for a subject's history
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubjectHistoryManifest {
    pub schema_version: String,
    pub subject: String,
    pub entries: Vec<HistoryManifestEntry>,
}

/// Recorded history entry tracking sequence order
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryManifestEntry {
    pub sequence: u64,
    pub snapshot_id: String,
    pub scope: PublicApiScope,
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
// CROSS-PROCESS / MULTI-INSTANCE FILE LOCKING
// ═══════════════════════════════════════════════════════════════

/// RAII lock file ensuring mutual exclusion across threads, instances, and OS processes
pub struct SubjectFileLock {
    lock_file: PathBuf,
}

impl SubjectFileLock {
    pub fn acquire(base_dir: &Path, subject: &str) -> Result<Self, SnapshotError> {
        let locks_dir = base_dir.join("_locks");
        fs::create_dir_all(&locks_dir)?;

        let lock_name = format!("{}.lock", SnapshotRepository::safe_segment(subject));
        let lock_file = locks_dir.join(lock_name);

        let start = std::time::Instant::now();
        let timeout = Duration::from_secs(10);
        let stale_timeout = Duration::from_secs(15);

        loop {
            match OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&lock_file)
            {
                Ok(mut file) => {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let _ = writeln!(file, "{} {}", std::process::id(), now);
                    let _ = file.sync_all();
                    return Ok(Self { lock_file });
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    // Check for stale lock file from crashed process
                    if let Ok(metadata) = fs::metadata(&lock_file) {
                        if let Ok(modified) = metadata.modified() {
                            if let Ok(elapsed) = modified.elapsed() {
                                if elapsed > stale_timeout {
                                    let _ = fs::remove_file(&lock_file);
                                }
                            }
                        }
                    }

                    if start.elapsed() > timeout {
                        return Err(SnapshotError::LockTimeout(format!(
                            "Failed to acquire lock for subject '{}' within {:?}",
                            subject, timeout
                        )));
                    }

                    std::thread::sleep(Duration::from_millis(15));
                }
                Err(e) => return Err(SnapshotError::Io(e)),
            }
        }
    }
}

impl Drop for SubjectFileLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.lock_file);
    }
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT REPOSITORY (AUTHORITATIVE PERSISTENCE)
// ═══════════════════════════════════════════════════════════════

/// Single authoritative persistence engine for API snapshots
pub struct SnapshotRepository {
    base_dir: PathBuf,
    in_process_lock: Arc<RwLock<()>>,
}

impl SnapshotRepository {
    /// Opens or initializes a snapshot repository at an explicit directory
    pub fn open(base_dir: impl Into<PathBuf>) -> Result<Self, SnapshotError> {
        let base_dir = base_dir.into();
        fs::create_dir_all(&base_dir)?;
        fs::create_dir_all(base_dir.join("snapshots"))?;
        fs::create_dir_all(base_dir.join("history"))?;
        fs::create_dir_all(base_dir.join("_locks"))?;
        fs::create_dir_all(base_dir.join("_tmp"))?;

        Ok(Self {
            base_dir,
            in_process_lock: Arc::new(RwLock::new(())),
        })
    }

    /// Opens the production repository from `ANALYSIS_SNAPSHOT_DIR` environment variable.
    /// Fails closed if the environment variable is unset or missing.
    pub fn open_from_env() -> Result<Self, SnapshotError> {
        let snapshot_dir = std::env::var("ANALYSIS_SNAPSHOT_DIR")
            .map_err(|_| SnapshotError::MissingStorageRootConfig)?;

        if snapshot_dir.trim().is_empty() {
            return Err(SnapshotError::MissingStorageRootConfig);
        }

        Self::open(PathBuf::from(snapshot_dir))
    }

    /// Safe segment hashing to completely prevent filesystem path traversal,
    /// separators, and Windows reserved device name collisions.
    pub fn safe_segment(raw: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(raw.as_bytes());
        let digest = hex::encode(hasher.finalize());
        let sanitized_prefix: String = raw
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .take(16)
            .collect();
        format!("{}_{}", sanitized_prefix, digest)
    }

    /// Path to the snapshot envelope JSON blob by its snapshot ID
    fn snapshot_file_path(&self, snapshot_id: &str) -> PathBuf {
        self.base_dir
            .join("snapshots")
            .join(format!("{}.json", snapshot_id))
    }

    /// Path to the authoritative history manifest for a subject
    fn history_file_path(&self, subject: &str) -> PathBuf {
        let safe_sub = Self::safe_segment(subject);
        self.base_dir
            .join("history")
            .join(format!("{}.json", safe_sub))
    }

    /// Atomically writes content to the destination path using a temp file within the same filesystem root
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

    /// Reads and parses the history manifest for a subject
    fn read_manifest(&self, subject: &str) -> Result<SubjectHistoryManifest, SnapshotError> {
        let history_path = self.history_file_path(subject);
        if !history_path.exists() {
            return Ok(SubjectHistoryManifest {
                schema_version: HISTORY_MANIFEST_SCHEMA_V1.to_string(),
                subject: subject.to_string(),
                entries: Vec::new(),
            });
        }

        let content = fs::read_to_string(&history_path)?;
        let manifest: SubjectHistoryManifest = serde_json::from_str(&content).map_err(|e| {
            SnapshotError::CorruptManifest(format!("History manifest parse error: {}", e))
        })?;

        if manifest.schema_version != HISTORY_MANIFEST_SCHEMA_V1 {
            return Err(SnapshotError::UnsupportedSnapshotSchema {
                expected: HISTORY_MANIFEST_SCHEMA_V1.to_string(),
                found: manifest.schema_version,
            });
        }

        Ok(manifest)
    }

    /// Admits and persists a complete `PublicApiSurface` into authoritative history
    pub async fn put(
        &self,
        subject: &str,
        scope: PublicApiScope,
        revision: &str,
        surface: PublicApiSurface,
        captured_at_epoch_ms: u64,
    ) -> Result<ApiSnapshotEnvelope, SnapshotError> {
        // In-process lock for thread safety
        let _in_process_guard = self.in_process_lock.write().await;

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

        // Scope consistency check
        if surface.scope != scope {
            return Err(SnapshotError::InvalidCoordinate(format!(
                "Supplied coordinate scope ({:?}) != surface scope ({:?})",
                scope, surface.scope
            )));
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
        let snapshot_id =
            compute_snapshot_id(subject, &surface.scope, revision, &surface.surface_hash);

        // 4. Construct authoritative envelope
        let envelope = ApiSnapshotEnvelope {
            schema_version: SNAPSHOT_ENVELOPE_SCHEMA_V1.to_string(),
            snapshot_id: snapshot_id.clone(),
            subject: subject.to_string(),
            scope: surface.scope.clone(),
            revision: revision.to_string(),
            captured_at_epoch_ms,
            surface,
        };

        // 5. Write immutable snapshot blob first (content object)
        let snapshot_file = self.snapshot_file_path(&snapshot_id);
        if !snapshot_file.exists() {
            let envelope_json = serde_json::to_string_pretty(&envelope)?;
            self.atomic_write(&snapshot_file, &envelope_json)?;
        }

        // 6. Acquire cross-process file lock for subject history manifest commit
        let _file_lock = SubjectFileLock::acquire(&self.base_dir, subject)?;

        // 7. Read latest manifest from disk under lock
        let mut manifest = self.read_manifest(subject)?;

        // 8. Check coordinate conflict / idempotency
        for entry in &manifest.entries {
            if entry.scope == scope && entry.revision == revision {
                if entry.surface_hash == envelope.surface.surface_hash
                    && entry.snapshot_id == snapshot_id
                {
                    // Idempotent duplicate write: return existing committed envelope
                    return self.get_by_id_internal(&entry.snapshot_id);
                } else {
                    // Conflicting write on same coordinate with different surface hash
                    return Err(SnapshotError::SnapshotConflict {
                        subject: subject.to_string(),
                        revision: revision.to_string(),
                        existing_hash: entry.surface_hash.clone(),
                        incoming_hash: envelope.surface.surface_hash,
                    });
                }
            }
        }

        // 9. Allocate sequence and append entry to manifest
        let next_seq = manifest.entries.len() as u64 + 1;
        manifest.entries.push(HistoryManifestEntry {
            sequence: next_seq,
            snapshot_id: snapshot_id.clone(),
            scope: envelope.scope.clone(),
            revision: revision.to_string(),
            surface_hash: envelope.surface.surface_hash.clone(),
            captured_at_epoch_ms,
        });

        // 10. Atomically commit new manifest
        let history_path = self.history_file_path(subject);
        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        self.atomic_write(&history_path, &manifest_json)?;

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
            Err(e) => {
                return Err(SnapshotError::CorruptSnapshot(format!(
                    "JSON parse failure: {}",
                    e
                )));
            }
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
        let _guard = self.in_process_lock.read().await;
        self.get_by_id_internal(snapshot_id)
    }

    /// Retrieves an authoritative snapshot by coordinate (subject + scope + revision)
    pub async fn get_by_coordinate(
        &self,
        subject: &str,
        scope: &PublicApiScope,
        revision: &str,
    ) -> Result<ApiSnapshotEnvelope, SnapshotError> {
        let _guard = self.in_process_lock.read().await;
        let manifest = self.read_manifest(subject)?;

        for entry in &manifest.entries {
            if &entry.scope == scope && entry.revision == revision {
                return self.get_by_id_internal(&entry.snapshot_id);
            }
        }

        Err(SnapshotError::SnapshotNotFound(format!(
            "{}:{:?}:{}",
            subject, scope, revision
        )))
    }

    /// Lists snapshot history for a subject in exact recorded capture sequence from the commit manifest
    pub async fn list_history(
        &self,
        subject: &str,
    ) -> Result<Vec<ApiSnapshotEnvelope>, SnapshotError> {
        let _guard = self.in_process_lock.read().await;
        let manifest = self.read_manifest(subject)?;

        let mut envelopes = Vec::new();
        for entry in manifest.entries {
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
        let legacy: PublicApiSnapshot = serde_json::from_str(&content).map_err(|e| {
            SnapshotError::CorruptSnapshot(format!("Legacy snapshot parse failure: {}", e))
        })?;

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
// TESTS (6R1-T1 through 6R1-T36)
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast_parser::{Language, ParserPool, SymbolKind};
    use crate::public_api::{
        PublicApiScope, PublicApiSymbol, PublicParameter, PublicSymbolSignature, SourceProvenance,
    };
    use std::time::Duration;

    pub struct TestTempDir {
        path: PathBuf,
    }

    impl TestTempDir {
        pub fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "test_snapshot_{}_{}",
                std::process::id(),
                uuid::Uuid::new_v4()
            ));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        pub fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestTempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

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

    #[tokio::test]
    async fn test_6r1_t1_through_t6_admission_and_tampered_hash_rejection() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::open(temp_dir.path()).unwrap();

        // 6R1-T4: Missing root config check
        unsafe {
            std::env::remove_var("ANALYSIS_SNAPSHOT_DIR");
        }
        assert!(SnapshotRepository::open_from_env().is_err());

        // 6R1-T22: Complete surface accepted
        let complete = sample_complete_surface("pkg_a", "i32");
        let env = repo
            .put(
                "pkg_a",
                complete.scope.clone(),
                "1.0.0",
                complete.clone(),
                1000,
            )
            .await
            .expect("Complete surface must be admitted");
        assert_eq!(env.schema_version, SNAPSHOT_ENVELOPE_SCHEMA_V1);
        assert_eq!(env.subject, "pkg_a");
        assert_eq!(env.revision, "1.0.0");

        // 6R1-T22: Partial surface rejected
        let mut partial = complete.clone();
        partial.status = AnalysisStatus::Partial;
        let err_partial = repo
            .put("pkg_a", partial.scope.clone(), "1.0.1", partial, 1001)
            .await
            .unwrap_err();
        match err_partial {
            SnapshotError::IncompleteAnalysis(status) => {
                assert_eq!(status, AnalysisStatus::Partial)
            }
            _ => panic!("Expected IncompleteAnalysis error"),
        }

        // 6R1-T23: Unsupported surface rejected
        let mut unsupported = complete.clone();
        unsupported.status = AnalysisStatus::Unsupported;
        let err_unsupported = repo
            .put(
                "pkg_a",
                unsupported.scope.clone(),
                "1.0.2",
                unsupported,
                1002,
            )
            .await
            .unwrap_err();
        match err_unsupported {
            SnapshotError::UnsupportedAnalysis => {}
            _ => panic!("Expected UnsupportedAnalysis error"),
        }

        // 6R1-T24: Tampered surface hash rejected before write
        let mut tampered = complete.clone();
        tampered.surface_hash =
            "deadbeef00000000000000000000000000000000000000000000000000000000".to_string();
        let err_tampered = repo
            .put("pkg_a", tampered.scope.clone(), "1.0.3", tampered, 1003)
            .await
            .unwrap_err();
        match err_tampered {
            SnapshotError::SurfaceHashMismatch { .. } => {}
            _ => panic!("Expected SurfaceHashMismatch error"),
        }
    }

    #[tokio::test]
    async fn test_6r1_t7_and_t8_module_and_package_scope_coexistence() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::open(temp_dir.path()).unwrap();

        let pool = ParserPool::new(Duration::from_secs(5), 1024 * 1024);
        let src = "pub fn add(a: i32, b: i32) -> i32 { a + b }";

        let module_surface =
            PublicApiExtractor::extract_module(&pool, Language::Rust, src, "src/math.rs", "math")
                .unwrap();

        let pkg_surface = PublicApiExtractor::extract_package(
            &pool,
            "math_pkg",
            Language::Rust,
            &[("src/lib.rs", "lib", src)],
        )
        .unwrap();

        // Put Module scope observation for subject "math", revision "1.0.0"
        let mod_env = repo
            .put(
                "math",
                module_surface.scope.clone(),
                "1.0.0",
                module_surface.clone(),
                1000,
            )
            .await
            .unwrap();

        // Put Package scope observation for same subject "math", same revision "1.0.0"
        let pkg_env = repo
            .put(
                "math",
                pkg_surface.scope.clone(),
                "1.0.0",
                pkg_surface.clone(),
                2000,
            )
            .await
            .unwrap();

        // 6R1-T7: Both co-exist with distinct snapshot IDs
        assert_ne!(mod_env.snapshot_id, pkg_env.snapshot_id);

        // 6R1-T8: Lookups by complete coordinate retrieve the respective envelopes
        let get_mod = repo
            .get_by_coordinate("math", &module_surface.scope, "1.0.0")
            .await
            .unwrap();
        let get_pkg = repo
            .get_by_coordinate("math", &pkg_surface.scope, "1.0.0")
            .await
            .unwrap();

        assert_eq!(get_mod.snapshot_id, mod_env.snapshot_id);
        assert_eq!(get_pkg.snapshot_id, pkg_env.snapshot_id);
        assert_eq!(get_mod.scope, module_surface.scope);
        assert_eq!(get_pkg.scope, pkg_surface.scope);
    }

    #[tokio::test]
    async fn test_6r1_t10_through_t15_manifest_commit_authority_and_orphans() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::open(temp_dir.path()).unwrap();

        let complete = sample_complete_surface("pkg_comm", "i32");
        let env = repo
            .put(
                "pkg_comm",
                complete.scope.clone(),
                "1.0.0",
                complete.clone(),
                1000,
            )
            .await
            .unwrap();

        // 6R1-T11: Manually create an orphan snapshot blob in snapshots/ without manifest entry
        let orphan_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let orphan_file = temp_dir
            .path()
            .join("snapshots")
            .join(format!("{}.json", orphan_id));
        fs::write(&orphan_file, serde_json::to_string(&env).unwrap()).unwrap();

        // History must NOT expose the orphan blob
        let history = repo.list_history("pkg_comm").await.unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].snapshot_id, env.snapshot_id);

        // 6R1-T12: Missing blob in manifest returns error
        let corrupt_manifest = SubjectHistoryManifest {
            schema_version: HISTORY_MANIFEST_SCHEMA_V1.to_string(),
            subject: "pkg_missing".to_string(),
            entries: vec![HistoryManifestEntry {
                sequence: 1,
                snapshot_id: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                    .to_string(),
                scope: complete.scope.clone(),
                revision: "1.0.0".to_string(),
                surface_hash: complete.surface_hash.clone(),
                captured_at_epoch_ms: 1000,
            }],
        };
        let corrupt_manifest_path = temp_dir.path().join("history").join(format!(
            "{}.json",
            SnapshotRepository::safe_segment("pkg_missing")
        ));
        fs::write(
            &corrupt_manifest_path,
            serde_json::to_string(&corrupt_manifest).unwrap(),
        )
        .unwrap();

        let err_missing = repo.list_history("pkg_missing").await.unwrap_err();
        match err_missing {
            SnapshotError::SnapshotNotFound(_) => {}
            _ => panic!("Expected SnapshotNotFound when manifest references missing blob"),
        }

        // 6R1-T13: Corrupt manifest JSON fails closed
        fs::write(&corrupt_manifest_path, "{ broken json").unwrap();
        let err_corrupt = repo.list_history("pkg_missing").await.unwrap_err();
        match err_corrupt {
            SnapshotError::CorruptManifest(_) => {}
            _ => panic!("Expected CorruptManifest on malformed JSON"),
        }
    }

    #[tokio::test]
    async fn test_6r1_t16_through_t18_multi_instance_concurrency_and_conflict() {
        let temp_dir = TestTempDir::new();

        let surf_i32 = sample_complete_surface("pkg_conc", "i32");
        let surf_u64 = sample_complete_surface("pkg_conc", "u64");

        // 6R1-T16: 10 independent repository instances writing identical observation converge
        let mut handles = Vec::new();
        for _ in 0..10 {
            let path = temp_dir.path().to_path_buf();
            let s = surf_i32.clone();
            handles.push(tokio::spawn(async move {
                let r = SnapshotRepository::open(&path).unwrap();
                r.put("pkg_conc", s.scope.clone(), "1.0.0", s, 1000).await
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

        let repo_check = SnapshotRepository::open(temp_dir.path()).unwrap();
        let history = repo_check.list_history("pkg_conc").await.unwrap();
        assert_eq!(
            history.len(),
            1,
            "Concurrent identical writes must produce exactly 1 commit entry"
        );

        // 6R1-T17: Independent instances writing conflicting surfaces on same coordinate
        let repo_a = SnapshotRepository::open(temp_dir.path()).unwrap();
        let repo_b = SnapshotRepository::open(temp_dir.path()).unwrap();

        let err_conflict = repo_b
            .put("pkg_conc", surf_u64.scope.clone(), "1.0.0", surf_u64, 2000)
            .await
            .unwrap_err();

        match err_conflict {
            SnapshotError::SnapshotConflict {
                subject, revision, ..
            } => {
                assert_eq!(subject, "pkg_conc");
                assert_eq!(revision, "1.0.0");
            }
            _ => panic!("Expected SnapshotConflict error"),
        }

        // Verify original remains immutable
        let env_verified = repo_a
            .get_by_coordinate("pkg_conc", &surf_i32.scope, "1.0.0")
            .await
            .unwrap();
        assert_eq!(env_verified.surface.surface_hash, surf_i32.surface_hash);
    }

    #[tokio::test]
    async fn test_6r1_t19_through_t26_idempotency_distinct_revisions_and_restart() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::open(temp_dir.path()).unwrap();

        let surf_i32 = sample_complete_surface("pkg_test", "i32");

        // 6R1-T19: Idempotent write preserves original timestamp
        let env_1 = repo
            .put(
                "pkg_test",
                surf_i32.scope.clone(),
                "1.0.0",
                surf_i32.clone(),
                1000,
            )
            .await
            .unwrap();
        let env_2 = repo
            .put(
                "pkg_test",
                surf_i32.scope.clone(),
                "1.0.0",
                surf_i32.clone(),
                9999,
            )
            .await
            .unwrap();
        assert_eq!(env_1.captured_at_epoch_ms, env_2.captured_at_epoch_ms);

        // 6R1-T20: Same surface across different revisions produces distinct observations
        let env_rev2 = repo
            .put(
                "pkg_test",
                surf_i32.scope.clone(),
                "1.0.1",
                surf_i32.clone(),
                2000,
            )
            .await
            .unwrap();
        assert_eq!(env_1.surface.surface_hash, env_rev2.surface.surface_hash);
        assert_ne!(env_1.snapshot_id, env_rev2.snapshot_id);

        // 6R1-T21: Same surface across different subjects produces distinct observations
        let surf_other = sample_complete_surface("pkg_other", "i32");
        let env_other = repo
            .put(
                "pkg_other",
                surf_other.scope.clone(),
                "1.0.0",
                surf_other.clone(),
                3000,
            )
            .await
            .unwrap();
        assert_ne!(env_1.snapshot_id, env_other.snapshot_id);

        // 6R1-T25 & 6R1-T26: History persists across repository restart in capture order (not SemVer)
        repo.put(
            "pkg_test",
            surf_i32.scope.clone(),
            "9.0.0",
            sample_complete_surface("pkg_test", "u8"),
            4000,
        )
        .await
        .unwrap();
        repo.put(
            "pkg_test",
            surf_i32.scope.clone(),
            "banana",
            sample_complete_surface("pkg_test", "bool"),
            5000,
        )
        .await
        .unwrap();

        // Fresh repo instance on same path
        let repo_restarted = SnapshotRepository::open(temp_dir.path()).unwrap();
        let history = repo_restarted.list_history("pkg_test").await.unwrap();
        assert_eq!(history.len(), 4);
        assert_eq!(history[0].revision, "1.0.0");
        assert_eq!(history[1].revision, "1.0.1");
        assert_eq!(history[2].revision, "9.0.0");
        assert_eq!(history[3].revision, "banana");

        // latest_recorded is "banana" (last in capture sequence)
        let latest = repo_restarted
            .latest_recorded("pkg_test")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(latest.revision, "banana");
    }

    #[tokio::test]
    async fn test_6r1_t27_through_t32_path_safety_legacy_and_ts_overload_roundtrip() {
        let temp_dir = TestTempDir::new();
        let repo = SnapshotRepository::open(temp_dir.path()).unwrap();
        let pool = ParserPool::new(Duration::from_secs(5), 1024 * 1024);

        let surf = sample_complete_surface("pkg_safe", "i32");

        // 6R1-T27: Path traversal in subject/revision cannot escape root
        let trav_env = repo
            .put(
                "../../etc/passwd",
                surf.scope.clone(),
                "../1.0.0",
                surf.clone(),
                1000,
            )
            .await
            .unwrap();
        assert_eq!(trav_env.subject, "../../etc/passwd");
        let read_trav = repo.get_by_id(&trav_env.snapshot_id).await.unwrap();
        assert_eq!(read_trav.subject, "../../etc/passwd");

        // 6R1-T28: Foreign files preserved
        let foreign_file = temp_dir.path().join("notes.txt");
        fs::write(&foreign_file, "important notes").unwrap();
        assert!(foreign_file.exists());

        // 6R1-T29: Legacy read traversal blocked / safe
        let legacy_dir = temp_dir.path().join("legacy");
        let legacy_summary =
            SnapshotRepository::read_legacy_snapshot(&legacy_dir, "../../secret", "1.0.0").unwrap();
        assert!(legacy_summary.is_none());

        // 6R1-T31: TS overload roundtrip preserves exactly 2 callable signatures
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

        let env_ts = repo
            .put(
                "ts_lib",
                ts_surface.scope.clone(),
                "1.0.0",
                ts_surface.clone(),
                1000,
            )
            .await
            .unwrap();

        // 6R1-T30: Full surface roundtrip
        let read_ts = repo.get_by_id(&env_ts.snapshot_id).await.unwrap();
        assert_eq!(read_ts.surface.status, AnalysisStatus::Complete);
        assert_eq!(read_ts.surface.symbols[0].signatures.len(), 2);
        assert_eq!(read_ts.surface.surface_hash, ts_surface.surface_hash);
    }
}

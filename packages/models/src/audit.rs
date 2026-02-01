//! Audit Trail for Security Event Logging
//!
//! Comprehensive audit logging for compliance and security monitoring.
//! Supports structured logging, tamper detection, and compliance reporting.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use std::sync::atomic::{AtomicU64, Ordering};

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/// Categories of audit events
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditEventCategory {
    /// Security-related events
    Security,
    /// Access control events
    Access,
    /// Data modification events
    DataChange,
    /// Configuration changes
    Configuration,
    /// Policy evaluation events
    Policy,
    /// Authentication events
    Authentication,
    /// Authorization events
    Authorization,
    /// System events
    System,
    /// Compliance events
    Compliance,
}

/// Specific audit event types
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    // Security events
    VulnerabilityDetected,
    VulnerabilityResolved,
    VexAssessmentCreated,
    VexAssessmentUpdated,
    SecurityScanInitiated,
    SecurityScanCompleted,
    
    // Access events
    PackageAccessed,
    SbomGenerated,
    SbomExported,
    ReportGenerated,
    
    // Data change events
    PackageCreated,
    PackageUpdated,
    PackageDeleted,
    DependencyAdded,
    DependencyRemoved,
    
    // Configuration events
    PolicyCreated,
    PolicyUpdated,
    PolicyDeleted,
    PolicyActivated,
    PolicyDeactivated,
    SettingChanged,
    
    // Policy events
    PolicyEvaluated,
    PolicyViolation,
    PolicyException,
    
    // Authentication events
    UserLogin,
    UserLogout,
    UserLoginFailed,
    TokenIssued,
    TokenRevoked,
    ApiKeyCreated,
    ApiKeyRevoked,
    
    // Authorization events
    PermissionGranted,
    PermissionRevoked,
    AccessDenied,
    
    // System events
    SystemStartup,
    SystemShutdown,
    ServiceHealthCheck,
    BackupCreated,
    BackupRestored,
    
    // Compliance events
    ComplianceCheckRun,
    ComplianceViolation,
    ComplianceReportGenerated,
    LicenseScanCompleted,
    ScorecardAssessment,
    ProvenanceVerified,
    
    // Custom events
    Custom(String),
}

impl AuditEventType {
    pub fn category(&self) -> AuditEventCategory {
        match self {
            AuditEventType::VulnerabilityDetected |
            AuditEventType::VulnerabilityResolved |
            AuditEventType::VexAssessmentCreated |
            AuditEventType::VexAssessmentUpdated |
            AuditEventType::SecurityScanInitiated |
            AuditEventType::SecurityScanCompleted => AuditEventCategory::Security,

            AuditEventType::PackageAccessed |
            AuditEventType::SbomGenerated |
            AuditEventType::SbomExported |
            AuditEventType::ReportGenerated => AuditEventCategory::Access,

            AuditEventType::PackageCreated |
            AuditEventType::PackageUpdated |
            AuditEventType::PackageDeleted |
            AuditEventType::DependencyAdded |
            AuditEventType::DependencyRemoved => AuditEventCategory::DataChange,

            AuditEventType::PolicyCreated |
            AuditEventType::PolicyUpdated |
            AuditEventType::PolicyDeleted |
            AuditEventType::PolicyActivated |
            AuditEventType::PolicyDeactivated |
            AuditEventType::SettingChanged => AuditEventCategory::Configuration,

            AuditEventType::PolicyEvaluated |
            AuditEventType::PolicyViolation |
            AuditEventType::PolicyException => AuditEventCategory::Policy,

            AuditEventType::UserLogin |
            AuditEventType::UserLogout |
            AuditEventType::UserLoginFailed |
            AuditEventType::TokenIssued |
            AuditEventType::TokenRevoked |
            AuditEventType::ApiKeyCreated |
            AuditEventType::ApiKeyRevoked => AuditEventCategory::Authentication,

            AuditEventType::PermissionGranted |
            AuditEventType::PermissionRevoked |
            AuditEventType::AccessDenied => AuditEventCategory::Authorization,

            AuditEventType::SystemStartup |
            AuditEventType::SystemShutdown |
            AuditEventType::ServiceHealthCheck |
            AuditEventType::BackupCreated |
            AuditEventType::BackupRestored => AuditEventCategory::System,

            AuditEventType::ComplianceCheckRun |
            AuditEventType::ComplianceViolation |
            AuditEventType::ComplianceReportGenerated |
            AuditEventType::LicenseScanCompleted |
            AuditEventType::ScorecardAssessment |
            AuditEventType::ProvenanceVerified => AuditEventCategory::Compliance,

            AuditEventType::Custom(_) => AuditEventCategory::System,
        }
    }
}

/// Severity level for audit events
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditSeverity {
    Debug,
    Info,
    Notice,
    Warning,
    Error,
    Critical,
    Alert,
    Emergency,
}

impl AuditSeverity {
    pub fn as_syslog_level(&self) -> u8 {
        match self {
            AuditSeverity::Debug => 7,
            AuditSeverity::Info => 6,
            AuditSeverity::Notice => 5,
            AuditSeverity::Warning => 4,
            AuditSeverity::Error => 3,
            AuditSeverity::Critical => 2,
            AuditSeverity::Alert => 1,
            AuditSeverity::Emergency => 0,
        }
    }
}

/// Outcome of the audited action
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditOutcome {
    Success,
    Failure,
    Partial,
    Unknown,
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT EVENT
// ═══════════════════════════════════════════════════════════════════════════

/// A single audit event record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    /// Unique event ID
    pub id: String,
    /// Sequence number for ordering
    pub sequence: u64,
    /// Event timestamp
    pub timestamp: DateTime<Utc>,
    /// Event type
    pub event_type: AuditEventType,
    /// Event category
    pub category: AuditEventCategory,
    /// Severity level
    pub severity: AuditSeverity,
    /// Action outcome
    pub outcome: AuditOutcome,
    /// Human-readable message
    pub message: String,
    /// Actor information (who performed the action)
    pub actor: AuditActor,
    /// Target of the action (what was affected)
    pub target: Option<AuditTarget>,
    /// Request context
    pub request: Option<AuditRequest>,
    /// Additional structured data
    pub data: HashMap<String, serde_json::Value>,
    /// Tenant ID for multi-tenant systems
    pub tenant_id: Option<String>,
    /// Correlation ID for tracing
    pub correlation_id: Option<String>,
    /// Hash of previous event (for tamper detection)
    pub previous_hash: Option<String>,
    /// Hash of this event
    pub hash: Option<String>,
}

/// Information about who performed the action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditActor {
    /// Actor type
    pub actor_type: ActorType,
    /// Actor identifier
    pub id: Option<String>,
    /// Actor name
    pub name: Option<String>,
    /// Email if applicable
    pub email: Option<String>,
    /// IP address
    pub ip_address: Option<String>,
    /// User agent
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActorType {
    User,
    Service,
    System,
    Anonymous,
    ApiKey,
}

/// Target of the audited action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditTarget {
    /// Target type
    pub target_type: String,
    /// Target identifier
    pub id: String,
    /// Target name
    pub name: Option<String>,
    /// Before state (for changes)
    pub before: Option<serde_json::Value>,
    /// After state (for changes)
    pub after: Option<serde_json::Value>,
}

/// Request context for the audit event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditRequest {
    /// Request ID
    pub request_id: Option<String>,
    /// HTTP method
    pub method: Option<String>,
    /// Request path
    pub path: Option<String>,
    /// Query parameters
    pub query: Option<String>,
    /// Request duration in milliseconds
    pub duration_ms: Option<u64>,
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT EVENT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

static SEQUENCE_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Builder for creating audit events
pub struct AuditEventBuilder {
    event_type: AuditEventType,
    severity: AuditSeverity,
    outcome: AuditOutcome,
    message: String,
    actor: AuditActor,
    target: Option<AuditTarget>,
    request: Option<AuditRequest>,
    data: HashMap<String, serde_json::Value>,
    tenant_id: Option<String>,
    correlation_id: Option<String>,
}

impl AuditEventBuilder {
    pub fn new(event_type: AuditEventType, message: impl Into<String>) -> Self {
        Self {
            event_type,
            severity: AuditSeverity::Info,
            outcome: AuditOutcome::Success,
            message: message.into(),
            actor: AuditActor {
                actor_type: ActorType::System,
                id: None,
                name: None,
                email: None,
                ip_address: None,
                user_agent: None,
            },
            target: None,
            request: None,
            data: HashMap::new(),
            tenant_id: None,
            correlation_id: None,
        }
    }

    pub fn severity(mut self, severity: AuditSeverity) -> Self {
        self.severity = severity;
        self
    }

    pub fn outcome(mut self, outcome: AuditOutcome) -> Self {
        self.outcome = outcome;
        self
    }

    pub fn actor_user(mut self, id: impl Into<String>, name: impl Into<String>) -> Self {
        self.actor = AuditActor {
            actor_type: ActorType::User,
            id: Some(id.into()),
            name: Some(name.into()),
            email: None,
            ip_address: None,
            user_agent: None,
        };
        self
    }

    pub fn actor_service(mut self, service_name: impl Into<String>) -> Self {
        self.actor = AuditActor {
            actor_type: ActorType::Service,
            id: None,
            name: Some(service_name.into()),
            email: None,
            ip_address: None,
            user_agent: None,
        };
        self
    }

    pub fn actor_ip(mut self, ip: impl Into<String>) -> Self {
        self.actor.ip_address = Some(ip.into());
        self
    }

    pub fn actor_user_agent(mut self, ua: impl Into<String>) -> Self {
        self.actor.user_agent = Some(ua.into());
        self
    }

    pub fn target(mut self, target_type: impl Into<String>, id: impl Into<String>) -> Self {
        self.target = Some(AuditTarget {
            target_type: target_type.into(),
            id: id.into(),
            name: None,
            before: None,
            after: None,
        });
        self
    }

    pub fn target_with_change(
        mut self,
        target_type: impl Into<String>,
        id: impl Into<String>,
        before: Option<serde_json::Value>,
        after: Option<serde_json::Value>,
    ) -> Self {
        self.target = Some(AuditTarget {
            target_type: target_type.into(),
            id: id.into(),
            name: None,
            before,
            after,
        });
        self
    }

    pub fn request(mut self, request: AuditRequest) -> Self {
        self.request = Some(request);
        self
    }

    pub fn data<T: Serialize>(mut self, key: impl Into<String>, value: T) -> Self {
        if let Ok(v) = serde_json::to_value(value) {
            self.data.insert(key.into(), v);
        }
        self
    }

    pub fn tenant(mut self, tenant_id: impl Into<String>) -> Self {
        self.tenant_id = Some(tenant_id.into());
        self
    }

    pub fn correlation(mut self, correlation_id: impl Into<String>) -> Self {
        self.correlation_id = Some(correlation_id.into());
        self
    }

    pub fn build(self) -> AuditEvent {
        let sequence = SEQUENCE_COUNTER.fetch_add(1, Ordering::SeqCst);
        let category = self.event_type.category();
        
        AuditEvent {
            id: uuid::Uuid::new_v4().to_string(),
            sequence,
            timestamp: Utc::now(),
            event_type: self.event_type,
            category,
            severity: self.severity,
            outcome: self.outcome,
            message: self.message,
            actor: self.actor,
            target: self.target,
            request: self.request,
            data: self.data,
            tenant_id: self.tenant_id,
            correlation_id: self.correlation_id,
            previous_hash: None,
            hash: None,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG (In-Memory for Testing)
// ═══════════════════════════════════════════════════════════════════════════

use std::sync::{Arc, RwLock};

/// In-memory audit log for testing and development
pub struct AuditLog {
    events: Arc<RwLock<Vec<AuditEvent>>>,
    max_size: usize,
}

impl AuditLog {
    pub fn new(max_size: usize) -> Self {
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            max_size,
        }
    }

    /// Record an audit event
    pub fn record(&self, event: AuditEvent) {
        let mut events = self.events.write().unwrap();
        
        // Maintain max size
        while events.len() >= self.max_size {
            events.remove(0);
        }
        
        events.push(event);
    }

    /// Get all events
    pub fn get_all(&self) -> Vec<AuditEvent> {
        self.events.read().unwrap().clone()
    }

    /// Query events by category
    pub fn by_category(&self, category: AuditEventCategory) -> Vec<AuditEvent> {
        self.events
            .read()
            .unwrap()
            .iter()
            .filter(|e| e.category == category)
            .cloned()
            .collect()
    }

    /// Query events by severity
    pub fn by_severity(&self, min_severity: AuditSeverity) -> Vec<AuditEvent> {
        self.events
            .read()
            .unwrap()
            .iter()
            .filter(|e| e.severity >= min_severity)
            .cloned()
            .collect()
    }

    /// Query events by time range
    pub fn by_time_range(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> Vec<AuditEvent> {
        self.events
            .read()
            .unwrap()
            .iter()
            .filter(|e| e.timestamp >= start && e.timestamp <= end)
            .cloned()
            .collect()
    }

    /// Query events by actor
    pub fn by_actor(&self, actor_id: &str) -> Vec<AuditEvent> {
        self.events
            .read()
            .unwrap()
            .iter()
            .filter(|e| e.actor.id.as_deref() == Some(actor_id))
            .cloned()
            .collect()
    }

    /// Query events by target
    pub fn by_target(&self, target_type: &str, target_id: &str) -> Vec<AuditEvent> {
        self.events
            .read()
            .unwrap()
            .iter()
            .filter(|e| {
                e.target.as_ref().map_or(false, |t| {
                    t.target_type == target_type && t.id == target_id
                })
            })
            .cloned()
            .collect()
    }

    /// Get event count
    pub fn count(&self) -> usize {
        self.events.read().unwrap().len()
    }

    /// Clear all events
    pub fn clear(&self) {
        self.events.write().unwrap().clear();
    }

    /// Generate compliance report
    pub fn compliance_report(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> ComplianceReport {
        let events = self.by_time_range(start, end);
        
        let mut by_category: HashMap<AuditEventCategory, usize> = HashMap::new();
        let mut by_severity: HashMap<AuditSeverity, usize> = HashMap::new();
        let mut violations = 0;
        let mut policy_evaluations = 0;

        for event in &events {
            *by_category.entry(event.category).or_insert(0) += 1;
            *by_severity.entry(event.severity).or_insert(0) += 1;
            
            if matches!(event.event_type, AuditEventType::PolicyViolation | AuditEventType::ComplianceViolation) {
                violations += 1;
            }
            if matches!(event.event_type, AuditEventType::PolicyEvaluated) {
                policy_evaluations += 1;
            }
        }

        ComplianceReport {
            period_start: start,
            period_end: end,
            total_events: events.len(),
            events_by_category: by_category,
            events_by_severity: by_severity,
            total_violations: violations,
            total_policy_evaluations: policy_evaluations,
            generated_at: Utc::now(),
        }
    }
}

impl Default for AuditLog {
    fn default() -> Self {
        Self::new(10000)
    }
}

/// Compliance report summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceReport {
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub total_events: usize,
    pub events_by_category: HashMap<AuditEventCategory, usize>,
    pub events_by_severity: HashMap<AuditSeverity, usize>,
    pub total_violations: usize,
    pub total_policy_evaluations: usize,
    pub generated_at: DateTime<Utc>,
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audit_event_creation() {
        let event = AuditEventBuilder::new(
            AuditEventType::PackageCreated,
            "Created package lodash@4.17.21",
        )
        .severity(AuditSeverity::Info)
        .outcome(AuditOutcome::Success)
        .actor_user("user-123", "John Doe")
        .actor_ip("192.168.1.1")
        .target("package", "pkg:npm/lodash@4.17.21")
        .data("ecosystem", "npm")
        .build();

        assert_eq!(event.category, AuditEventCategory::DataChange);
        assert_eq!(event.severity, AuditSeverity::Info);
        assert_eq!(event.actor.actor_type, ActorType::User);
        assert!(event.target.is_some());
    }

    #[test]
    fn test_audit_log() {
        let log = AuditLog::new(100);

        // Record some events
        log.record(
            AuditEventBuilder::new(AuditEventType::PolicyEvaluated, "Policy evaluated")
                .actor_service("policy-engine")
                .build(),
        );

        log.record(
            AuditEventBuilder::new(AuditEventType::PolicyViolation, "Policy violated")
                .severity(AuditSeverity::Warning)
                .actor_service("policy-engine")
                .build(),
        );

        assert_eq!(log.count(), 2);
        
        let policy_events = log.by_category(AuditEventCategory::Policy);
        assert_eq!(policy_events.len(), 2);
    }

    #[test]
    fn test_compliance_report() {
        let log = AuditLog::new(100);

        for _ in 0..5 {
            log.record(
                AuditEventBuilder::new(AuditEventType::PolicyEvaluated, "Policy evaluated")
                    .build(),
            );
        }
        log.record(
            AuditEventBuilder::new(AuditEventType::PolicyViolation, "Violation")
                .severity(AuditSeverity::Warning)
                .build(),
        );

        let start = Utc::now() - chrono::Duration::hours(1);
        let end = Utc::now() + chrono::Duration::hours(1);
        
        let report = log.compliance_report(start, end);
        
        assert_eq!(report.total_events, 6);
        assert_eq!(report.total_violations, 1);
        assert_eq!(report.total_policy_evaluations, 5);
    }

    #[test]
    fn test_event_type_categories() {
        assert_eq!(
            AuditEventType::VulnerabilityDetected.category(),
            AuditEventCategory::Security
        );
        assert_eq!(
            AuditEventType::UserLogin.category(),
            AuditEventCategory::Authentication
        );
        assert_eq!(
            AuditEventType::PolicyEvaluated.category(),
            AuditEventCategory::Policy
        );
    }

    #[test]
    fn test_max_size_eviction() {
        let log = AuditLog::new(3);

        for i in 0..5 {
            log.record(
                AuditEventBuilder::new(AuditEventType::PackageAccessed, format!("Event {}", i))
                    .build(),
            );
        }

        assert_eq!(log.count(), 3);
        
        let events = log.get_all();
        assert!(events[0].message.contains("2")); // First 2 events evicted
    }
}

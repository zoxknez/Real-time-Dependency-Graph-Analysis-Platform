/**
 * Audit Trail Hook
 * 
 * React hooks for querying audit events and compliance reports.
 */

import { useQuery, useLazyQuery } from "@apollo/client";
import { useMemo, useCallback } from "react";
import {
  GET_AUDIT_EVENTS,
  GET_COMPLIANCE_REPORT,
} from "../graphql/queries";
import type {
  AuditEventCategory,
  AuditSeverity,
  AuditOutcome,
  ActorType,
  AuditEvent,
  AuditFilterInput,
  AuditEventsResponse,
  ComplianceReportResponse,
} from "../graphql/types";

// ═══════════════════════════════════════════════════════════════
// AUDIT EVENTS HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseAuditEventsOptions {
  filter?: AuditFilterInput;
  first?: number;
  after?: string;
  skip?: boolean;
}

export function useAuditEvents(options: UseAuditEventsOptions = {}) {
  const { filter, first = 20, after, skip } = options;

  const { data, loading, error, refetch, fetchMore } = useQuery<AuditEventsResponse>(
    GET_AUDIT_EVENTS,
    {
      variables: { filter, first, after },
      skip,
    }
  );

  const connection = data?.auditEvents;
  const events = useMemo(
    () => connection?.edges?.map((e) => e.node) ?? [],
    [connection?.edges]
  );

  // Group events by category
  const eventsByCategory = useMemo(() => {
    const grouped: Record<AuditEventCategory, AuditEvent[]> = {
      SECURITY: [],
      ACCESS: [],
      DATA_CHANGE: [],
      CONFIGURATION: [],
      POLICY: [],
      AUTHENTICATION: [],
      AUTHORIZATION: [],
      SYSTEM: [],
      COMPLIANCE: [],
    };
    for (const event of events) {
      grouped[event.category].push(event);
    }
    return grouped;
  }, [events]);

  // Load more function
  const loadMore = useCallback(() => {
    if (!connection?.pageInfo.hasNextPage) return;
    return fetchMore({
      variables: {
        after: connection.pageInfo.endCursor,
      },
    });
  }, [connection?.pageInfo, fetchMore]);

  return {
    events,
    connection,
    totalCount: connection?.totalCount ?? 0,
    pageInfo: connection?.pageInfo,
    eventsByCategory,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
    loadMore,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// COMPLIANCE REPORT HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseComplianceReportOptions {
  startDate: string;
  endDate: string;
  tenantId?: string;
  skip?: boolean;
}

export function useComplianceReport(options: UseComplianceReportOptions) {
  const { startDate, endDate, tenantId, skip } = options;

  const { data, loading, error, refetch } = useQuery<ComplianceReportResponse>(
    GET_COMPLIANCE_REPORT,
    {
      variables: { startDate, endDate, tenantId },
      skip: skip || !startDate || !endDate,
    }
  );

  const report = data?.complianceReport;

  // Calculate violation rate
  const violationRate = useMemo(() => {
    if (!report || report.totalPolicyEvaluations === 0) return 0;
    return Math.round(
      (report.totalViolations / report.totalPolicyEvaluations) * 100
    );
  }, [report]);

  return {
    report,
    totalEvents: report?.totalEvents ?? 0,
    securityEvents: report?.securityEvents ?? 0,
    policyEvents: report?.policyEvents ?? 0,
    complianceEvents: report?.complianceEvents ?? 0,
    totalViolations: report?.totalViolations ?? 0,
    totalPolicyEvaluations: report?.totalPolicyEvaluations ?? 0,
    violationRate,
    loading,
    error,
    refetch,
  };
}

// ═══════════════════════════════════════════════════════════════
// LAZY AUDIT HOOKS
// ═══════════════════════════════════════════════════════════════

export function useLazyAuditEvents() {
  const [query, { data, loading, error }] = useLazyQuery<AuditEventsResponse>(
    GET_AUDIT_EVENTS,
    { fetchPolicy: "network-only" }
  );

  const queryEvents = useCallback(
    (filter?: AuditFilterInput, first?: number, after?: string) => {
      return query({ variables: { filter, first, after } });
    },
    [query]
  );

  return {
    queryEvents,
    events: data?.auditEvents?.edges?.map((e) => e.node) ?? [],
    connection: data?.auditEvents,
    loading,
    error,
  };
}

export function useLazyComplianceReport() {
  const [query, { data, loading, error }] = useLazyQuery<ComplianceReportResponse>(
    GET_COMPLIANCE_REPORT,
    { fetchPolicy: "network-only" }
  );

  const generateReport = useCallback(
    (startDate: string, endDate: string, tenantId?: string) => {
      return query({ variables: { startDate, endDate, tenantId } });
    },
    [query]
  );

  return {
    generateReport,
    report: data?.complianceReport,
    loading,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════
// AUDIT UTILITIES
// ═══════════════════════════════════════════════════════════════

export const AuditUtils = {
  /**
   * Get display name for event category
   */
  getCategoryDisplayName(category: AuditEventCategory): string {
    const names: Record<AuditEventCategory, string> = {
      SECURITY: "Security",
      ACCESS: "Access",
      DATA_CHANGE: "Data Change",
      CONFIGURATION: "Configuration",
      POLICY: "Policy",
      AUTHENTICATION: "Authentication",
      AUTHORIZATION: "Authorization",
      SYSTEM: "System",
      COMPLIANCE: "Compliance",
    };
    return names[category] ?? category;
  },

  /**
   * Get icon for event category
   */
  getCategoryIcon(category: AuditEventCategory): string {
    const icons: Record<AuditEventCategory, string> = {
      SECURITY: "🔒",
      ACCESS: "👁️",
      DATA_CHANGE: "✏️",
      CONFIGURATION: "⚙️",
      POLICY: "📋",
      AUTHENTICATION: "🔑",
      AUTHORIZATION: "🛡️",
      SYSTEM: "🖥️",
      COMPLIANCE: "✅",
    };
    return icons[category] ?? "📄";
  },

  /**
   * Get display name for severity
   */
  getSeverityDisplayName(severity: AuditSeverity): string {
    const names: Record<AuditSeverity, string> = {
      DEBUG: "Debug",
      INFO: "Info",
      NOTICE: "Notice",
      WARNING: "Warning",
      ERROR: "Error",
      CRITICAL: "Critical",
      ALERT: "Alert",
      EMERGENCY: "Emergency",
    };
    return names[severity] ?? severity;
  },

  /**
   * Get color for severity
   */
  getSeverityColor(severity: AuditSeverity): string {
    const colors: Record<AuditSeverity, string> = {
      DEBUG: "gray",
      INFO: "blue",
      NOTICE: "cyan",
      WARNING: "yellow",
      ERROR: "orange",
      CRITICAL: "red",
      ALERT: "red",
      EMERGENCY: "red",
    };
    return colors[severity] ?? "gray";
  },

  /**
   * Get syslog level for severity
   */
  getSeveritySyslogLevel(severity: AuditSeverity): number {
    const levels: Record<AuditSeverity, number> = {
      DEBUG: 7,
      INFO: 6,
      NOTICE: 5,
      WARNING: 4,
      ERROR: 3,
      CRITICAL: 2,
      ALERT: 1,
      EMERGENCY: 0,
    };
    return levels[severity] ?? 6;
  },

  /**
   * Get display name for outcome
   */
  getOutcomeDisplayName(outcome: AuditOutcome): string {
    const names: Record<AuditOutcome, string> = {
      SUCCESS: "Success",
      FAILURE: "Failure",
      PARTIAL: "Partial",
      UNKNOWN: "Unknown",
    };
    return names[outcome] ?? outcome;
  },

  /**
   * Get icon for outcome
   */
  getOutcomeIcon(outcome: AuditOutcome): string {
    const icons: Record<AuditOutcome, string> = {
      SUCCESS: "✓",
      FAILURE: "✗",
      PARTIAL: "◐",
      UNKNOWN: "?",
    };
    return icons[outcome] ?? "?";
  },

  /**
   * Get color for outcome
   */
  getOutcomeColor(outcome: AuditOutcome): string {
    const colors: Record<AuditOutcome, string> = {
      SUCCESS: "green",
      FAILURE: "red",
      PARTIAL: "yellow",
      UNKNOWN: "gray",
    };
    return colors[outcome] ?? "gray";
  },

  /**
   * Get display name for actor type
   */
  getActorTypeDisplayName(actorType: ActorType): string {
    const names: Record<ActorType, string> = {
      USER: "User",
      SERVICE: "Service",
      SYSTEM: "System",
      ANONYMOUS: "Anonymous",
      API_KEY: "API Key",
    };
    return names[actorType] ?? actorType;
  },

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  },

  /**
   * Format relative time
   */
  formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = now.getTime() - then.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  },

  /**
   * Filter events by minimum severity
   */
  filterByMinSeverity(
    events: AuditEvent[],
    minSeverity: AuditSeverity
  ): AuditEvent[] {
    const minLevel = this.getSeveritySyslogLevel(minSeverity);
    return events.filter(
      (e) => this.getSeveritySyslogLevel(e.severity) <= minLevel
    );
  },

  /**
   * Group events by date
   */
  groupByDate(events: AuditEvent[]): Record<string, AuditEvent[]> {
    const grouped: Record<string, AuditEvent[]> = {};
    for (const event of events) {
      const date = new Date(event.timestamp).toLocaleDateString();
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(event);
    }
    return grouped;
  },
};

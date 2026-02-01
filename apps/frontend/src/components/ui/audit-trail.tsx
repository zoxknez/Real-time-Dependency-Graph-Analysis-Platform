/**
 * Audit Trail Component
 * 
 * Displays audit events and compliance reports with filtering
 * and timeline visualization.
 */

"use client";

import React, { useMemo } from "react";
import {
  useAuditEvents,
  useComplianceReport,
  AuditUtils,
} from "@/lib/hooks";
import type {
  AuditEvent,
  AuditEventCategory,
  AuditSeverity,
  AuditOutcome,
  AuditFilterInput,
} from "@/lib/graphql/types";

// ═══════════════════════════════════════════════════════════════
// AUDIT EVENT CARD
// ═══════════════════════════════════════════════════════════════

interface AuditEventCardProps {
  event: AuditEvent;
  compact?: boolean;
  className?: string;
}

export function AuditEventCard({
  event,
  compact = false,
  className = "",
}: AuditEventCardProps) {
  const categoryIcon = AuditUtils.getCategoryIcon(event.category);
  const outcomeIcon = AuditUtils.getOutcomeIcon(event.outcome);
  const outcomeColor = AuditUtils.getOutcomeColor(event.outcome);

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded ${className}`}
      >
        <span className="text-lg">{categoryIcon}</span>
        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
          {event.eventType}
        </span>
        <span className={`text-${outcomeColor}-500`}>{outcomeIcon}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {AuditUtils.formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <span className="text-2xl">{categoryIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">
              {event.eventType}
            </h4>
            <AuditSeverityBadge severity={event.severity} size="sm" />
            <AuditOutcomeBadge outcome={event.outcome} size="sm" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {AuditUtils.getCategoryDisplayName(event.category)}
          </p>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {AuditUtils.formatTimestamp(event.timestamp)}
        </span>
      </div>

      {/* Message */}
      {event.message && (
        <div className="px-4 pb-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {event.message}
          </p>
        </div>
      )}

      {/* Actor & Target */}
      <div className="px-4 pb-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {event.actor && (
          <span>
            By: {event.actor.name ?? event.actor.id} ({AuditUtils.getActorTypeDisplayName(event.actor.actorType)})
          </span>
        )}
        {event.target && (
          <span>
            Target: {event.target.targetType}/{event.target.id}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUDIT SEVERITY BADGE
// ═══════════════════════════════════════════════════════════════

interface AuditSeverityBadgeProps {
  severity: AuditSeverity;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AuditSeverityBadge({
  severity,
  size = "md",
  className = "",
}: AuditSeverityBadgeProps) {
  const color = AuditUtils.getSeverityColor(severity);
  
  const colorClasses: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md ${colorClasses[color]} ${sizeClasses[size]} ${className}`}
    >
      {AuditUtils.getSeverityDisplayName(severity)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUDIT OUTCOME BADGE
// ═══════════════════════════════════════════════════════════════

interface AuditOutcomeBadgeProps {
  outcome: AuditOutcome;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function AuditOutcomeBadge({
  outcome,
  size = "md",
  showIcon = true,
  className = "",
}: AuditOutcomeBadgeProps) {
  const color = AuditUtils.getOutcomeColor(outcome);
  const icon = AuditUtils.getOutcomeIcon(outcome);

  const colorClasses: Record<string, string> = {
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md ${colorClasses[color]} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && <span>{icon}</span>}
      <span>{AuditUtils.getOutcomeDisplayName(outcome)}</span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUDIT EVENTS LIST
// ═══════════════════════════════════════════════════════════════

interface AuditEventsListProps {
  filter?: AuditFilterInput;
  pageSize?: number;
  className?: string;
}

export function AuditEventsList({
  filter,
  pageSize = 20,
  className = "",
}: AuditEventsListProps) {
  const { events, loading, error, hasNextPage, loadMore } = useAuditEvents({
    filter,
    first: pageSize,
  });

  if (loading && events.length === 0) {
    return (
      <div className={`space-y-3 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse h-24 bg-gray-100 dark:bg-gray-800 rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-sm text-red-600 dark:text-red-400 ${className}`}>
        Error loading audit events: {error.message}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
        No audit events found
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {events.map((event) => (
          <AuditEventCard key={event.id} event={event} />
        ))}
      </div>
      
      {hasNextPage && (
        <button
          onClick={() => loadMore()}
          disabled={loading}
          className="w-full mt-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUDIT TIMELINE
// ═══════════════════════════════════════════════════════════════

interface AuditTimelineProps {
  events: AuditEvent[];
  className?: string;
}

export function AuditTimeline({ events, className = "" }: AuditTimelineProps) {
  const groupedEvents = useMemo(
    () => AuditUtils.groupByDate(events),
    [events]
  );

  return (
    <div className={className}>
      {Object.entries(groupedEvents).map(([date, dateEvents]) => (
        <div key={date} className="mb-6">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 sticky top-0 bg-white dark:bg-gray-900 py-1">
            {date}
          </h4>
          <div className="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
            {dateEvents.map((event) => (
              <div key={event.id} className="relative">
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[25px] w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 ${
                    event.outcome === "SUCCESS"
                      ? "bg-green-500"
                      : event.outcome === "FAILURE"
                      ? "bg-red-500"
                      : "bg-gray-400"
                  }`}
                />
                <AuditEventCard event={event} compact />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPLIANCE REPORT CARD
// ═══════════════════════════════════════════════════════════════

interface ComplianceReportCardProps {
  startDate: string;
  endDate: string;
  tenantId?: string;
  className?: string;
}

export function ComplianceReportCard({
  startDate,
  endDate,
  tenantId,
  className = "",
}: ComplianceReportCardProps) {
  const { report, loading, error, violationRate } = useComplianceReport({
    startDate,
    endDate,
    tenantId,
  });

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg p-6 ${className}`}>
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={`bg-red-50 dark:bg-red-900/20 rounded-lg p-4 ${className}`}>
        <p className="text-sm text-red-600 dark:text-red-400">
          Error generating compliance report
        </p>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">
          Compliance Report
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Events"
          value={report.totalEvents}
          icon="📊"
        />
        <StatCard
          label="Security Events"
          value={report.securityEvents}
          icon="🔒"
          color="blue"
        />
        <StatCard
          label="Policy Evaluations"
          value={report.totalPolicyEvaluations}
          icon="📋"
          color="purple"
        />
        <StatCard
          label="Violations"
          value={report.totalViolations}
          icon="⚠️"
          color="red"
        />
      </div>

      {/* Violation Rate */}
      <div className="px-4 pb-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Violation Rate
            </span>
            <span
              className={`text-lg font-bold ${
                violationRate < 10
                  ? "text-green-600"
                  : violationRate < 30
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {violationRate}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                violationRate < 10
                  ? "bg-green-500"
                  : violationRate < 30
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${Math.min(violationRate, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 text-xs text-gray-500 dark:text-gray-400">
        Report generated: {new Date().toLocaleString()}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STAT CARD HELPER
// ═══════════════════════════════════════════════════════════════

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color?: "default" | "blue" | "green" | "red" | "purple" | "yellow";
}

function StatCard({ label, value, icon, color = "default" }: StatCardProps) {
  const colorClasses = {
    default: "text-gray-900 dark:text-gray-100",
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    purple: "text-purple-600 dark:text-purple-400",
    yellow: "text-yellow-600 dark:text-yellow-400",
  };

  return (
    <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {label}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUDIT FILTER PANEL
// ═══════════════════════════════════════════════════════════════

interface AuditFilterPanelProps {
  filter: AuditFilterInput;
  onChange: (filter: AuditFilterInput) => void;
  className?: string;
}

export function AuditFilterPanel({
  filter,
  onChange,
  className = "",
}: AuditFilterPanelProps) {
  const categories: AuditEventCategory[] = [
    "SECURITY",
    "ACCESS",
    "DATA_CHANGE",
    "CONFIGURATION",
    "POLICY",
    "AUTHENTICATION",
    "AUTHORIZATION",
    "SYSTEM",
    "COMPLIANCE",
  ];

  const severities: AuditSeverity[] = [
    "DEBUG",
    "INFO",
    "NOTICE",
    "WARNING",
    "ERROR",
    "CRITICAL",
    "ALERT",
    "EMERGENCY",
  ];

  // Note: outcomes filter removed as AuditFilterInput doesn't support it directly

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Category Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Category
        </label>
        <select
          value={filter.category ?? ""}
          onChange={(e) =>
            onChange({
              ...filter,
              category: e.target.value ? (e.target.value as AuditEventCategory) : undefined,
            })
          }
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {AuditUtils.getCategoryIcon(cat)} {AuditUtils.getCategoryDisplayName(cat)}
            </option>
          ))}
        </select>
      </div>

      {/* Severity Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Min Severity
        </label>
        <select
          value={filter.minSeverity ?? ""}
          onChange={(e) =>
            onChange({
              ...filter,
              minSeverity: e.target.value ? (e.target.value as AuditSeverity) : undefined,
            })
          }
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="">All Severities</option>
          {severities.map((sev) => (
            <option key={sev} value={sev}>
              {AuditUtils.getSeverityDisplayName(sev)}
            </option>
          ))}
        </select>
      </div>

      {/* Actor ID Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Actor ID
        </label>
        <input
          type="text"
          placeholder="Filter by actor ID..."
          value={filter.actorId ?? ""}
          onChange={(e) =>
            onChange({
              ...filter,
              actorId: e.target.value || undefined,
            })
          }
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Start Time
          </label>
          <input
            type="datetime-local"
            value={filter.startTime ?? ""}
            onChange={(e) =>
              onChange({
                ...filter,
                startTime: e.target.value || undefined,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            End Time
          </label>
          <input
            type="datetime-local"
            value={filter.endTime ?? ""}
            onChange={(e) =>
              onChange({
                ...filter,
                endTime: e.target.value || undefined,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
    </div>
  );
}

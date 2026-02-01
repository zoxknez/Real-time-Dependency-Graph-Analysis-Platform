'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type CopyleftType = 'NONE' | 'WEAK' | 'STRONG' | 'NETWORK';
type LicenseCategory = 'PERMISSIVE' | 'COPYLEFT' | 'PROPRIETARY' | 'PUBLIC_DOMAIN' | 'UNKNOWN';
type ViolationSeverity = 'ERROR' | 'WARNING' | 'INFO';

interface LicenseInfo {
  id: string;
  name: string;
  osiApproved: boolean;
  fsfLibre: boolean;
  copyleft: CopyleftType;
  category: LicenseCategory;
  referenceUrl: string;
  deprecated: boolean;
}

interface LicenseViolation {
  violationType: string;
  licenseId: string;
  reason: string;
  severity: ViolationSeverity;
}

interface LicenseValidationResult {
  compliant: boolean;
  policyName: string;
  detectedLicense: string | null;
  violations: LicenseViolation[];
  warnings: string[];
}

interface PackageLicense {
  packageName: string;
  packageVersion: string;
  ecosystem: string;
  license: string;
  licenseInfo?: LicenseInfo;
  validation?: LicenseValidationResult;
}

// ═══════════════════════════════════════════════════════════════
// LICENSE BADGE
// ═══════════════════════════════════════════════════════════════

interface LicenseBadgeProps {
  license: string;
  licenseInfo?: LicenseInfo;
  size?: 'sm' | 'md';
  showDetails?: boolean;
  className?: string;
}

function getCategoryColor(category: LicenseCategory): string {
  switch (category) {
    case 'PERMISSIVE': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'COPYLEFT': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'PROPRIETARY': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'PUBLIC_DOMAIN': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
}

function getCopyleftLabel(copyleft: CopyleftType): string {
  switch (copyleft) {
    case 'NONE': return 'No Copyleft';
    case 'WEAK': return 'Weak Copyleft';
    case 'STRONG': return 'Strong Copyleft';
    case 'NETWORK': return 'Network Copyleft';
    default: return 'Unknown';
  }
}

export function LicenseBadge({ 
  license, 
  licenseInfo, 
  size = 'md',
  showDetails = false,
  className 
}: LicenseBadgeProps) {
  const category = licenseInfo?.category || 'UNKNOWN';
  
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        getCategoryColor(category)
      )}>
        {license}
      </span>
      {showDetails && licenseInfo && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {licenseInfo.osiApproved && (
            <span title="OSI Approved" className="text-green-600">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          {licenseInfo.copyleft !== 'NONE' && (
            <span className="text-yellow-600" title={getCopyleftLabel(licenseInfo.copyleft)}>
              ©
            </span>
          )}
          {licenseInfo.deprecated && (
            <span className="text-red-600" title="Deprecated">
              ⚠
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LICENSE EXPRESSION DISPLAY
// ═══════════════════════════════════════════════════════════════

interface LicenseExpressionProps {
  expression: string;
  className?: string;
}

export function LicenseExpression({ expression, className }: LicenseExpressionProps) {
  // Parse and display SPDX expression with highlighting
  const parts = expression.split(/(\s+AND\s+|\s+OR\s+|\s+WITH\s+|\(|\))/i);
  
  return (
    <code className={cn('text-sm', className)}>
      {parts.map((part, i) => {
        const upper = part.toUpperCase().trim();
        if (upper === 'AND' || upper === 'OR' || upper === 'WITH') {
          return (
            <span key={i} className="font-bold text-purple-600 dark:text-purple-400">
              {' '}{upper}{' '}
            </span>
          );
        }
        if (part === '(' || part === ')') {
          return <span key={i} className="text-muted-foreground">{part}</span>;
        }
        if (part.trim()) {
          return (
            <span key={i} className="rounded bg-muted px-1 py-0.5">
              {part.trim()}
            </span>
          );
        }
        return null;
      })}
    </code>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPLIANCE STATUS
// ═══════════════════════════════════════════════════════════════

interface ComplianceStatusProps {
  compliant: boolean;
  violationCount: number;
  warningCount: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ComplianceStatus({ 
  compliant, 
  violationCount, 
  warningCount,
  size = 'md',
  className 
}: ComplianceStatusProps) {
  const sizeClasses = {
    sm: 'gap-1 text-xs',
    md: 'gap-2 text-sm',
    lg: 'gap-3 text-base',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  if (compliant) {
    return (
      <div className={cn('flex items-center', sizeClasses[size], className)}>
        <div className={cn(
          'flex items-center justify-center rounded-full bg-green-100 p-1 dark:bg-green-900/30',
          iconSizes[size]
        )}>
          <svg className="h-full w-full text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="font-medium text-green-600 dark:text-green-400">
          Compliant
          {warningCount > 0 && (
            <span className="ml-1 text-yellow-600 dark:text-yellow-400">
              ({warningCount} warning{warningCount > 1 ? 's' : ''})
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center', sizeClasses[size], className)}>
      <div className={cn(
        'flex items-center justify-center rounded-full bg-red-100 p-1 dark:bg-red-900/30',
        iconSizes[size]
      )}>
        <svg className="h-full w-full text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <span className="font-medium text-red-600 dark:text-red-400">
        {violationCount} Violation{violationCount > 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIOLATION LIST
// ═══════════════════════════════════════════════════════════════

interface ViolationListProps {
  violations: LicenseViolation[];
  warnings?: string[];
  className?: string;
}

function getViolationTypeLabel(type: string): string {
  switch (type) {
    case 'DeniedLicense': return 'Denied License';
    case 'DeniedCategory': return 'Denied Category';
    case 'CopyleftNotAllowed': return 'Copyleft Not Allowed';
    case 'NetworkCopyleftNotAllowed': return 'Network Copyleft';
    case 'NotOsiApproved': return 'Not OSI Approved';
    case 'UnknownLicense': return 'Unknown License';
    case 'DeprecatedLicense': return 'Deprecated License';
    default: return type;
  }
}

function getSeverityColor(severity: ViolationSeverity): string {
  switch (severity) {
    case 'ERROR': return 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
    case 'WARNING': return 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20';
    case 'INFO': return 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20';
    default: return 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50';
  }
}

function getSeverityIcon(severity: ViolationSeverity): React.ReactNode {
  switch (severity) {
    case 'ERROR':
      return (
        <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'WARNING':
      return (
        <svg className="h-4 w-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    default:
      return (
        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

export function ViolationList({ violations, warnings = [], className }: ViolationListProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {violations.map((violation, i) => (
        <div 
          key={i}
          className={cn('rounded-lg border p-3', getSeverityColor(violation.severity))}
        >
          <div className="flex items-start gap-2">
            {getSeverityIcon(violation.severity)}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {getViolationTypeLabel(violation.violationType)}
                </span>
                <LicenseBadge license={violation.licenseId} size="sm" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{violation.reason}</p>
            </div>
          </div>
        </div>
      ))}
      
      {warnings.map((warning, i) => (
        <div 
          key={`warn-${i}`}
          className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20"
        >
          <div className="flex items-start gap-2">
            <svg className="h-4 w-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-yellow-700 dark:text-yellow-400">{warning}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LICENSE SCAN SUMMARY
// ═══════════════════════════════════════════════════════════════

interface LicenseScanSummaryProps {
  totalPackages: number;
  licensesDetected: string[];
  copyleftCount: number;
  permissiveCount: number;
  unknownCount: number;
  complianceStatus: boolean;
  violations: LicenseViolation[];
  className?: string;
}

export function LicenseScanSummary({
  totalPackages,
  licensesDetected,
  copyleftCount,
  permissiveCount,
  unknownCount,
  complianceStatus,
  violations,
  className,
}: LicenseScanSummaryProps) {
  const [showViolations, setShowViolations] = useState(false);
  
  return (
    <div className={cn('rounded-lg border p-4', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">License Scan</h3>
        <ComplianceStatus 
          compliant={complianceStatus} 
          violationCount={violations.length}
          warningCount={0}
        />
      </div>
      
      {/* Stats Grid */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <div className="text-center">
          <div className="text-2xl font-bold">{totalPackages}</div>
          <div className="text-xs text-muted-foreground">Packages</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{permissiveCount}</div>
          <div className="text-xs text-muted-foreground">Permissive</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{copyleftCount}</div>
          <div className="text-xs text-muted-foreground">Copyleft</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-600">{unknownCount}</div>
          <div className="text-xs text-muted-foreground">Unknown</div>
        </div>
      </div>
      
      {/* License List */}
      <div className="mb-4">
        <div className="mb-2 text-sm font-medium text-muted-foreground">
          Detected Licenses ({licensesDetected.length})
        </div>
        <div className="flex flex-wrap gap-1">
          {licensesDetected.slice(0, 10).map((license) => (
            <LicenseBadge key={license} license={license} size="sm" />
          ))}
          {licensesDetected.length > 10 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              +{licensesDetected.length - 10} more
            </span>
          )}
        </div>
      </div>
      
      {/* Violations */}
      {violations.length > 0 && (
        <div>
          <button
            onClick={() => setShowViolations(!showViolations)}
            className="flex w-full items-center justify-between rounded-md bg-red-50 p-2 text-left text-sm font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
          >
            <span>{violations.length} Policy Violation{violations.length > 1 ? 's' : ''}</span>
            <svg 
              className={cn('h-4 w-4 transition-transform', showViolations && 'rotate-180')} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showViolations && (
            <div className="mt-2">
              <ViolationList violations={violations} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POLICY SELECTOR
// ═══════════════════════════════════════════════════════════════

type PolicyPreset = 'DEFAULT' | 'PERMISSIVE_ONLY' | 'ENTERPRISE' | 'CUSTOM';

interface PolicySelectorProps {
  selected: PolicyPreset;
  onSelect: (policy: PolicyPreset) => void;
  className?: string;
}

const policyDescriptions: Record<PolicyPreset, { name: string; description: string }> = {
  DEFAULT: {
    name: 'Default',
    description: 'Allow permissive and weak copyleft licenses',
  },
  PERMISSIVE_ONLY: {
    name: 'Permissive Only',
    description: 'Only MIT, Apache, BSD, and similar licenses',
  },
  ENTERPRISE: {
    name: 'Enterprise',
    description: 'Block AGPL, GPL-3, and source-available licenses',
  },
  CUSTOM: {
    name: 'Custom',
    description: 'Define your own license policy',
  },
};

export function PolicySelector({ selected, onSelect, className }: PolicySelectorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium">License Policy</label>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(policyDescriptions) as PolicyPreset[]).map((policy) => (
          <button
            key={policy}
            onClick={() => onSelect(policy)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              selected === policy 
                ? 'border-primary bg-primary/5' 
                : 'hover:bg-accent'
            )}
          >
            <div className="font-medium">{policyDescriptions[policy].name}</div>
            <div className="text-xs text-muted-foreground">
              {policyDescriptions[policy].description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PACKAGE LICENSE LIST
// ═══════════════════════════════════════════════════════════════

interface PackageLicenseListProps {
  packages: PackageLicense[];
  className?: string;
}

export function PackageLicenseList({ packages, className }: PackageLicenseListProps) {
  const [filter, setFilter] = useState<'all' | 'violations' | 'copyleft' | 'unknown'>('all');
  
  const filteredPackages = packages.filter((pkg) => {
    switch (filter) {
      case 'violations':
        return pkg.validation && !pkg.validation.compliant;
      case 'copyleft':
        return pkg.licenseInfo?.copyleft && pkg.licenseInfo.copyleft !== 'NONE';
      case 'unknown':
        return !pkg.licenseInfo || pkg.licenseInfo.category === 'UNKNOWN';
      default:
        return true;
    }
  });
  
  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        {(['all', 'violations', 'copyleft', 'unknown'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              filter === tab 
                ? 'border-primary text-primary' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="ml-1 text-xs">
              ({packages.filter((p) => {
                switch (tab) {
                  case 'violations': return p.validation && !p.validation.compliant;
                  case 'copyleft': return p.licenseInfo?.copyleft && p.licenseInfo.copyleft !== 'NONE';
                  case 'unknown': return !p.licenseInfo || p.licenseInfo.category === 'UNKNOWN';
                  default: return true;
                }
              }).length})
            </span>
          </button>
        ))}
      </div>
      
      {/* Package List */}
      <div className="space-y-2">
        {filteredPackages.map((pkg, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium">{pkg.packageName}</div>
              <div className="text-xs text-muted-foreground">
                {pkg.ecosystem} • {pkg.packageVersion}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LicenseBadge 
                license={pkg.license} 
                licenseInfo={pkg.licenseInfo}
                showDetails 
              />
              {pkg.validation && !pkg.validation.compliant && (
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
          </div>
        ))}
        
        {filteredPackages.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No packages match the selected filter
          </div>
        )}
      </div>
    </div>
  );
}

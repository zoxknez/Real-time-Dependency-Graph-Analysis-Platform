'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
type RiskCategory = 'HOLISTIC_SECURITY' | 'SOURCE_RISK' | 'BUILD_RISK';

interface ScorecardCheck {
  name: string;
  score: number;
  reason: string;
  riskCategory: RiskCategory;
  riskLevel: RiskLevel;
  documentationUrl?: string;
}

interface ScorecardData {
  target: string;
  aggregateScore: number;
  checks: ScorecardCheck[];
  generatedAt: string;
  scorecardVersion: string;
  commitSha?: string;
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD BADGE
// ═══════════════════════════════════════════════════════════════

interface ScorecardBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-green-600 dark:text-green-400';
  if (score >= 6) return 'text-yellow-600 dark:text-yellow-400';
  if (score >= 4) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 6) return 'bg-yellow-100 dark:bg-yellow-900/30';
  if (score >= 4) return 'bg-orange-100 dark:bg-orange-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

function getScoreLabel(score: number): string {
  if (score >= 8) return 'Low Risk';
  if (score >= 6) return 'Medium Risk';
  if (score >= 4) return 'High Risk';
  return 'Critical Risk';
}

export function ScorecardBadge({ 
  score, 
  size = 'md', 
  showLabel = true,
  className 
}: ScorecardBadgeProps) {
  const sizeClasses = {
    sm: 'h-10 w-10 text-sm',
    md: 'h-14 w-14 text-lg',
    lg: 'h-20 w-20 text-2xl',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full font-bold',
          sizeClasses[size],
          getScoreBgColor(score),
          getScoreColor(score)
        )}
      >
        {score.toFixed(1)}
      </div>
      {showLabel && (
        <div className="flex flex-col">
          <span className={cn('font-semibold', getScoreColor(score))}>
            {getScoreLabel(score)}
          </span>
          <span className="text-xs text-muted-foreground">OpenSSF Score</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD CHECK ITEM
// ═══════════════════════════════════════════════════════════════

interface ScorecardCheckItemProps {
  check: ScorecardCheck;
  expanded?: boolean;
  onToggle?: () => void;
}

const checkIcons: Record<string, React.ReactNode> = {
  'Binary-Artifacts': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'Branch-Protection': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  'Vulnerabilities': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  'Maintained': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'SAST': (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
};

function getCheckIcon(name: string): React.ReactNode {
  return checkIcons[name] || (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function ScorecardCheckItem({ check, expanded = false, onToggle }: ScorecardCheckItemProps) {
  const passed = check.score >= 5;
  
  return (
    <div 
      className={cn(
        'rounded-lg border p-3 transition-colors',
        passed ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
               : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
      )}
    >
      <div 
        className="flex cursor-pointer items-center justify-between"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            passed ? 'bg-green-200 text-green-700 dark:bg-green-800 dark:text-green-300'
                   : 'bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-300'
          )}>
            {getCheckIcon(check.name)}
          </div>
          <div>
            <div className="font-medium">{check.name}</div>
            <div className="text-xs text-muted-foreground">
              {getCategoryLabel(check.riskCategory)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            'rounded-full px-2 py-1 text-sm font-bold',
            getScoreBgColor(check.score),
            getScoreColor(check.score)
          )}>
            {check.score}/10
          </div>
          <svg 
            className={cn(
              'h-4 w-4 transition-transform',
              expanded && 'rotate-180'
            )} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-3 border-t pt-3 text-sm">
          <p className="text-muted-foreground">{check.reason}</p>
          {check.documentationUrl && (
            <a
              href={check.documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Learn more
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD CATEGORY SECTION
// ═══════════════════════════════════════════════════════════════

function getCategoryLabel(category: RiskCategory): string {
  switch (category) {
    case 'HOLISTIC_SECURITY': return 'Holistic Security';
    case 'SOURCE_RISK': return 'Source Risk';
    case 'BUILD_RISK': return 'Build Risk';
    default: return 'Unknown';
  }
}

function getCategoryDescription(category: RiskCategory): string {
  switch (category) {
    case 'HOLISTIC_SECURITY': return 'Overall security practices and policies';
    case 'SOURCE_RISK': return 'Source code and repository security';
    case 'BUILD_RISK': return 'Build and supply chain security';
    default: return '';
  }
}

interface ScorecardCategoryProps {
  category: RiskCategory;
  checks: ScorecardCheck[];
}

export function ScorecardCategory({ category, checks }: ScorecardCategoryProps) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  
  const passedCount = checks.filter(c => c.score >= 5).length;
  const avgScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{getCategoryLabel(category)}</h3>
          <p className="text-sm text-muted-foreground">
            {getCategoryDescription(category)}
          </p>
        </div>
        <div className="text-right">
          <div className={cn('text-lg font-bold', getScoreColor(avgScore))}>
            {avgScore.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground">
            {passedCount}/{checks.length} passed
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        {checks.map((check) => (
          <ScorecardCheckItem
            key={check.name}
            check={check}
            expanded={expandedCheck === check.name}
            onToggle={() => setExpandedCheck(
              expandedCheck === check.name ? null : check.name
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FULL SCORECARD DISPLAY
// ═══════════════════════════════════════════════════════════════

interface ScorecardDisplayProps {
  data: ScorecardData;
  className?: string;
}

export function ScorecardDisplay({ data, className }: ScorecardDisplayProps) {
  const holisticChecks = data.checks.filter(c => c.riskCategory === 'HOLISTIC_SECURITY');
  const sourceChecks = data.checks.filter(c => c.riskCategory === 'SOURCE_RISK');
  const buildChecks = data.checks.filter(c => c.riskCategory === 'BUILD_RISK');
  
  const failedChecks = data.checks.filter(c => c.score < 5);
  const criticalChecks = data.checks.filter(c => c.riskLevel === 'CRITICAL' || c.riskLevel === 'HIGH');
  
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">OpenSSF Scorecard</h2>
          <p className="text-sm text-muted-foreground">{data.target}</p>
          {data.commitSha && (
            <code className="mt-1 text-xs text-muted-foreground">
              {data.commitSha.slice(0, 7)}
            </code>
          )}
        </div>
        <ScorecardBadge score={data.aggregateScore} size="lg" />
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {data.checks.filter(c => c.score >= 5).length}
          </div>
          <div className="text-sm text-muted-foreground">Passed Checks</div>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            {failedChecks.length}
          </div>
          <div className="text-sm text-muted-foreground">Failed Checks</div>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">
            {criticalChecks.length}
          </div>
          <div className="text-sm text-muted-foreground">Critical/High</div>
        </div>
      </div>
      
      {/* Critical Issues Alert */}
      {criticalChecks.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {criticalChecks.length} Critical/High Risk Issue{criticalChecks.length > 1 ? 's' : ''}
          </div>
          <ul className="mt-2 list-inside list-disc text-sm text-red-700 dark:text-red-400">
            {criticalChecks.slice(0, 3).map(c => (
              <li key={c.name}>{c.name}: {c.reason}</li>
            ))}
            {criticalChecks.length > 3 && (
              <li>...and {criticalChecks.length - 3} more</li>
            )}
          </ul>
        </div>
      )}
      
      {/* Category Sections */}
      <div className="space-y-4">
        {holisticChecks.length > 0 && (
          <ScorecardCategory category="HOLISTIC_SECURITY" checks={holisticChecks} />
        )}
        {sourceChecks.length > 0 && (
          <ScorecardCategory category="SOURCE_RISK" checks={sourceChecks} />
        )}
        {buildChecks.length > 0 && (
          <ScorecardCategory category="BUILD_RISK" checks={buildChecks} />
        )}
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Scorecard v{data.scorecardVersion}</span>
        <span>Generated: {new Date(data.generatedAt).toLocaleString()}</span>
      </div>
      
      {/* Learn More */}
      <div className="flex justify-center">
        <a
          href="https://scorecard.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Learn about OpenSSF Scorecard
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPACT SCORECARD WIDGET
// ═══════════════════════════════════════════════════════════════

interface ScorecardWidgetProps {
  score: number;
  passedChecks: number;
  totalChecks: number;
  criticalIssues: number;
  className?: string;
  onClick?: () => void;
}

export function ScorecardWidget({ 
  score, 
  passedChecks, 
  totalChecks, 
  criticalIssues,
  className,
  onClick
}: ScorecardWidgetProps) {
  return (
    <div 
      className={cn(
        'flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent',
        className
      )}
      onClick={onClick}
    >
      <ScorecardBadge score={score} size="md" showLabel={false} />
      <div className="flex-1">
        <div className="font-semibold">OpenSSF Scorecard</div>
        <div className="text-sm text-muted-foreground">
          {passedChecks}/{totalChecks} checks passed
        </div>
      </div>
      {criticalIssues > 0 && (
        <div className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
          </svg>
          {criticalIssues} critical
        </div>
      )}
      <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

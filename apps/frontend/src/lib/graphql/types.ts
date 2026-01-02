// GraphQL Types (generated from schema)

export type Ecosystem = "NPM" | "PY_PI" | "CARGO" | "MAVEN" | "NU_GET" | "GO";

export interface Package {
  id: string;
  name: string;
  ecosystem: Ecosystem;
}

export interface Version {
  id: string;
  packageId: string;
  version: string;
  publishedAt?: string;
  yanked: boolean;
}

export interface PackageEdge {
  node: Package;
  cursor: string;
  depth?: number;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface PackageConnection {
  edges: PackageEdge[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface DependencyPathResult {
  found: boolean;
  hops: number;
  packages: Package[];
}

export interface ImpactNode {
  package: Package;
  depth: number;
  estimatedAffectedVersions?: number;
}

export interface ImpactRadiusResult {
  packageId: string;
  vulnerableVersionRange?: string;
  maxDepth: number;
  impactedPackages: number;
  impactedVersions: number;
  topImpacted: ImpactNode[];
}

export interface EcosystemCount {
  ecosystem: Ecosystem;
  count: number;
}

export interface GraphStats {
  totalPackages: number;
  totalVersions: number;
  totalDependencies: number;
  totalPackageDependencies: number;
  ecosystemBreakdown?: EcosystemCount[];
}

export interface EventMeta {
  eventId: string;
  occurredAt: string;
  source: string;
}

export interface VersionEvent {
  meta: EventMeta;
  package: Package;
  version: Version;
}

// Query Variables Types
export interface GetPackageVariables {
  id: string;
}

export interface GetReverseDependentsVariables {
  packageId: string;
  maxDepth?: number;
  first?: number;
  after?: string;
}

export interface GetDependencyPathVariables {
  fromPackageId: string;
  toPackageId: string;
  maxHops?: number;
}

export interface GetImpactRadiusVariables {
  packageId: string;
  vulnerableVersionRange?: string;
  maxDepth?: number;
  limit?: number;
}

// Query Response Types
export interface GetPackageResponse {
  package: Package | null;
}

export interface GetReverseDependentsResponse {
  reverseDependents: PackageConnection;
}

export interface GetDependencyPathResponse {
  dependencyPath: DependencyPathResult;
}

export interface GetImpactRadiusResponse {
  impactRadius: ImpactRadiusResult;
}

export interface GetGraphStatsResponse {
  graphStats: GraphStats;
}

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION TYPES
// ═══════════════════════════════════════════════════════════════

export type EventType = "PUBLISH" | "UPDATE" | "YANK" | "DEPRECATE";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BreakingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ChangeType = "BREAKING" | "FEATURE" | "FIX" | "DEPRECATION";

export interface LivePackageEvent {
  id: string;
  type: EventType;
  timestamp: string;
  package: Package;
  version: string;
  metadata?: {
    previousVersion?: string;
    downloadCount?: number;
    isPrerelease?: boolean;
  };
}

// Breaking change types (matches backend)
export interface BreakingChange {
  changeType: string;
  description: string;
  path?: string;
  oldSignature?: string;
  newSignature?: string;
}

export interface BreakingChangeEvent {
  timestamp: string;
  package: Package;
  fromVersion: string;
  toVersion: string;
  severity: BreakingSeverity;
  changes: BreakingChange[];
  affectedDependents: number;
}

// Live stats types (matches backend)
export interface EcosystemActivity {
  ecosystem: Ecosystem;
  count: number;
  change24h: number;
}

export interface LiveStats {
  timestamp: string;
  packagesIndexed: number;
  versionsIndexed: number;
  dependenciesTracked: number;
  eventsPerMinute: number;
  activeConnections: number;
  topEcosystems: EcosystemActivity[];
}

// Dependency impact types (matches backend)
export interface DependencyImpactEvent {
  timestamp: string;
  package: Package;
  version: string;
  impactScore: number;
  affectedPackages: number;
  affectedVersions: number;
  criticalPath: string[];
}

// Legacy aliases for backwards compatibility
export interface BreakingChangeInfo {
  type: ChangeType;
  description: string;
  path?: string;
  breaking: boolean;
}

export interface EcosystemStat {
  ecosystem: Ecosystem;
  packagesIndexed: number;
  versionsIndexed: number;
  recentActivity: number;
}

export interface TrendingPackage {
  package: Package;
  score: number;
  trend: "UP" | "DOWN" | "STABLE";
}

export interface WatchedPackageEvent {
  id: string;
  event: EventType;
  package: Package;
  version: string;
  timestamp: string;
  details?: string;
}

export interface DependencyGraphUpdate {
  type: "ADD" | "REMOVE" | "UPDATE";
  affectedPackage: Package;
  newVersion?: string;
  addedDependencies?: Package[];
  removedDependencies?: Package[];
  timestamp: string;
}

// Subscription Variable Types
export interface NewVersionVariables {
  ecosystem?: Ecosystem;
  packageId?: string;
}

export interface BreakingChangeVariables {
  ecosystem?: Ecosystem;
  packageId?: string;
  minSeverity?: BreakingSeverity;
}

export interface DependencyImpactVariables {
  ecosystem?: Ecosystem;
  minImpactScore?: number;
}

// Legacy variable types for backwards compatibility
export interface LivePackageActivityVariables {
  ecosystems?: Ecosystem[];
  eventTypes?: EventType[];
}

export interface WatchPackagesVariables {
  packageIds: string[];
}

export interface DependencyGraphUpdateVariables {
  rootPackageId: string;
  maxDepth?: number;
}

// Subscription Response Types
export interface NewVersionResponse {
  newVersion: VersionEvent;
}

export interface BreakingChangeDetectedResponse {
  breakingChangeDetected: BreakingChangeEvent;
}

export interface LiveStatsResponse {
  liveStats: LiveStats;
}

export interface DependencyImpactResponse {
  dependencyImpact: DependencyImpactEvent;
}

// Legacy response types
export interface LivePackageActivityResponse {
  livePackageActivity: LivePackageEvent;
}

export interface WatchPackagesResponse {
  watchPackages: WatchedPackageEvent;
}

export interface DependencyGraphUpdateResponse {
  dependencyGraphUpdate: DependencyGraphUpdate;
}

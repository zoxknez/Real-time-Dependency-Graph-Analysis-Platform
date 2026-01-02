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

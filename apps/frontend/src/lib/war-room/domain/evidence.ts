/**
 * Canonical Security & Package Evidence Domain Model (WMCP-9)
 *
 * Framework-independent domain types for real external package evidence.
 * Grounded in source-backed OSV vulnerability facts.
 * Never fabricates synthetic risk scores, probabilities, or severity heuristics.
 * Follows WMCP-INV-002, WMCP-INV-021, and WMCP-9 specification.
 */

import { PackageEcosystem } from "./types";

export interface PackageAdvisoryFact {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly summary?: string;
  readonly details?: string;
  readonly published?: string;
  readonly modified?: string;
  readonly references?: readonly string[];
}

export type PackageEvidenceStatus =
  | "AVAILABLE"
  | "NO_KNOWN_ADVISORIES"
  | "UNAVAILABLE"
  | "UNSUPPORTED_ECOSYSTEM"
  | "INVALID_COORDINATE";

export interface PackageEvidenceCoordinate {
  readonly ecosystem: PackageEcosystem;
  readonly packageName: string;
  readonly packageVersion?: string;
}

export interface PackageEvidence {
  readonly coordinate: PackageEvidenceCoordinate;
  readonly status: PackageEvidenceStatus;
  readonly provider: string;
  readonly fetchedAt: string;
  readonly advisoriesTotal: number;
  readonly advisoriesReturned: number;
  readonly truncated: boolean;
  readonly advisories: readonly PackageAdvisoryFact[];
}

/**
 * Maps canonical War Room ecosystem to external OSV ecosystem identifier.
 * Returns null if ecosystem is not supported by OSV.
 */
export function mapEcosystemToOsv(ecosystem: PackageEcosystem): string | null {
  switch (ecosystem) {
    case "NPM":
      return "npm";
    case "PY_PI":
      return "PyPI";
    case "CARGO":
      return "crates.io";
    default:
      return null;
  }
}

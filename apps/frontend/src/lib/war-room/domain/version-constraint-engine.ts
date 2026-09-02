/**
 * Deterministic Version Constraint Engine (WMCP-8)
 *
 * Evaluates declared dependency constraints against a proposed package version.
 *
 * Invariants:
 * - Direct-edge evaluation only; no transitive version claims.
 * - Fails closed: invalid versions or requirements produce typed unknown/error statuses, never false booleans.
 * - Distinct dialects: NPM SemVer, Cargo SemVer, and PEP 440 are never falsely conflated.
 * - Missing requirements are treated as UNKNOWN_MISSING_REQUIREMENT (never synthesized as '*').
 */

import * as semver from "semver";
import { PackageEcosystem } from "./types";

export type VersionConstraintStatus =
  | "SATISFIES"
  | "DOES_NOT_SATISFY"
  | "UNKNOWN_MISSING_REQUIREMENT"
  | "UNSUPPORTED_ECOSYSTEM"
  | "INVALID_REQUIREMENT"
  | "INVALID_VERSION";

export interface VersionConstraintEvaluation {
  readonly status: VersionConstraintStatus;
  readonly reason: string;
}

export class VersionConstraintEngine {
  /**
   * Evaluates whether a proposed version satisfies a declared raw dependency requirement.
   */
  public static evaluate(
    ecosystem: PackageEcosystem,
    rawRequirement: string | undefined | null,
    proposedVersion: string | undefined | null
  ): VersionConstraintEvaluation {
    // 1. Missing requirement
    if (!rawRequirement || rawRequirement.trim().length === 0) {
      return {
        status: "UNKNOWN_MISSING_REQUIREMENT",
        reason: "Declared dependency requirement is missing or empty",
      };
    }

    const trimmedReq = rawRequirement.trim();

    // 2. Missing proposed version
    if (!proposedVersion || proposedVersion.trim().length === 0) {
      return {
        status: "INVALID_VERSION",
        reason: "Proposed version cannot be empty",
      };
    }

    const trimmedVersion = proposedVersion.trim();

    // 3. Dispatch to ecosystem dialect
    switch (ecosystem) {
      case "NPM":
        return this.evaluateNpm(trimmedReq, trimmedVersion);
      case "CARGO":
        return this.evaluateCargo(trimmedReq, trimmedVersion);
      case "PY_PI":
        return this.evaluatePep440(trimmedReq, trimmedVersion);
      default:
        return {
          status: "UNSUPPORTED_ECOSYSTEM",
          reason: `Version constraint evaluation is not supported for ecosystem '${ecosystem}'`,
        };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. NPM SEMVER DIALECT
  // ─────────────────────────────────────────────────────────────

  private static evaluateNpm(
    rawReq: string,
    proposedVer: string
  ): VersionConstraintEvaluation {
    if (!semver.valid(proposedVer)) {
      return {
        status: "INVALID_VERSION",
        reason: `Proposed version '${proposedVer}' is not a valid SemVer string`,
      };
    }

    if (!semver.validRange(rawReq)) {
      return {
        status: "INVALID_REQUIREMENT",
        reason: `Declared requirement '${rawReq}' is not a valid npm SemVer range`,
      };
    }

    try {
      const satisfies = semver.satisfies(proposedVer, rawReq);

      return {
        status: satisfies ? "SATISFIES" : "DOES_NOT_SATISFY",
        reason: satisfies
          ? `Version '${proposedVer}' satisfies npm range '${rawReq}'`
          : `Version '${proposedVer}' does not satisfy npm range '${rawReq}'`,
      };
    } catch (e) {
      return {
        status: "INVALID_REQUIREMENT",
        reason: `Failed to evaluate npm range '${rawReq}': ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. CARGO SEMVER DIALECT
  // ─────────────────────────────────────────────────────────────

  /**
   * Evaluates Cargo dependency requirements:
   * - Bare versions (e.g. `1.2.3` or `1.2`) are caret requirements (`^1.2.3` or `^1.2.0`).
   * - Operators: `=`, `>`, `<`, `>=`, `<=`, `~`, `^`, `*`.
   * - Multiple clauses separated by commas: `>= 1.2, < 1.5`.
   */
  private static evaluateCargo(
    rawReq: string,
    proposedVer: string
  ): VersionConstraintEvaluation {
    if (!semver.valid(proposedVer)) {
      return {
        status: "INVALID_VERSION",
        reason: `Proposed version '${proposedVer}' is not a valid SemVer string`,
      };
    }

    const clauses = rawReq.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
    if (clauses.length === 0) {
      return {
        status: "INVALID_REQUIREMENT",
        reason: "Cargo requirement clause list cannot be empty",
      };
    }

    // Convert Cargo clauses to npm-compatible range format
    const convertedClauses: string[] = [];
    for (const clause of clauses) {
      if (clause === "*") {
        convertedClauses.push("*");
      } else if (clause.startsWith("^") || clause.startsWith("~") || clause.startsWith(">=") || clause.startsWith("<=") || clause.startsWith(">") || clause.startsWith("<") || clause.startsWith("=")) {
        convertedClauses.push(clause);
      } else if (/^[0-9]+(\.[0-9]+)*$/.test(clause)) {
        // Bare version in Cargo implies caret requirement
        convertedClauses.push(`^${clause}`);
      } else {
        return {
          status: "INVALID_REQUIREMENT",
          reason: `Unrecognized Cargo requirement syntax in clause '${clause}'`,
        };
      }
    }

    const normalizedRange = convertedClauses.join(" ");
    if (!semver.validRange(normalizedRange)) {
      return {
        status: "INVALID_REQUIREMENT",
        reason: `Normalized Cargo requirement '${normalizedRange}' is not a valid range`,
      };
    }

    try {
      const satisfies = semver.satisfies(proposedVer, normalizedRange);

      return {
        status: satisfies ? "SATISFIES" : "DOES_NOT_SATISFY",
        reason: satisfies
          ? `Version '${proposedVer}' satisfies Cargo requirement '${rawReq}'`
          : `Version '${proposedVer}' does not satisfy Cargo requirement '${rawReq}'`,
      };
    } catch (e) {
      return {
        status: "INVALID_REQUIREMENT",
        reason: `Failed to evaluate Cargo requirement '${rawReq}': ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PEP 440 PYTHON DIALECT
  // ─────────────────────────────────────────────────────────────

  /**
   * Evaluates PEP 440 Python version specifiers:
   * - Operators: `==`, `!=`, `<=`, `>=`, `<`, `>`, `~=`, `===`.
   * - Wildcard prefix matches: `== 1.4.*`, `!= 1.4.*`.
   * - Compatible release: `~= 1.4` (>= 1.4, == 1.*), `~= 1.4.5` (>= 1.4.5, == 1.4.*).
   * - Multiple clauses separated by commas: `>=1.0, <2.0`.
   */
  private static evaluatePep440(
    rawReq: string,
    proposedVer: string
  ): VersionConstraintEvaluation {
    const parsedVer = this.parsePep440Version(proposedVer);
    if (!parsedVer) {
      return {
        status: "INVALID_VERSION",
        reason: `Proposed version '${proposedVer}' is not a valid PEP 440 version`,
      };
    }

    const clauses = rawReq.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
    if (clauses.length === 0) {
      return {
        status: "INVALID_REQUIREMENT",
        reason: "PEP 440 requirement clause list cannot be empty",
      };
    }

    for (const clause of clauses) {
      const match = clause.match(/^(==|!=|<=|>=|<|>|~=|===)\s*(.+)$/);
      if (!match) {
        return {
          status: "INVALID_REQUIREMENT",
          reason: `Invalid PEP 440 operator or clause syntax in '${clause}'`,
        };
      }

      const op = match[1]!;
      const spec = match[2]!.trim();

      // Wildcard prefix match
      if (spec.endsWith(".*")) {
        const prefix = spec.slice(0, -2);
        const satisfiesPrefix = this.matchesPep440Prefix(parsedVer, prefix);
        if (op === "==" && !satisfiesPrefix) {
          return {
            status: "DOES_NOT_SATISFY",
            reason: `Version '${proposedVer}' does not match prefix '${spec}'`,
          };
        }
        if (op === "!=" && satisfiesPrefix) {
          return {
            status: "DOES_NOT_SATISFY",
            reason: `Version '${proposedVer}' is excluded by prefix '${spec}'`,
          };
        }
        continue;
      }

      // Compatible release (~=)
      if (op === "~=") {
        const targetVer = this.parsePep440Version(spec);
        if (!targetVer) {
          return {
            status: "INVALID_REQUIREMENT",
            reason: `Invalid target version in PEP 440 compatible release clause '${clause}'`,
          };
        }

        // ~= X.Y -> >= X.Y, == X.*
        // ~= X.Y.Z -> >= X.Y.Z, == X.Y.*
        const cmp = this.comparePep440(parsedVer, targetVer);
        if (cmp < 0) {
          return {
            status: "DOES_NOT_SATISFY",
            reason: `Version '${proposedVer}' is less than compatible release floor '${spec}'`,
          };
        }

        const prefixTokens = targetVer.parts.slice(0, targetVer.parts.length - 1);
        const prefixStr = prefixTokens.length > 0 ? prefixTokens.join(".") : (targetVer.parts[0]?.toString() ?? "0");
        if (!this.matchesPep440Prefix(parsedVer, prefixStr)) {
          return {
            status: "DOES_NOT_SATISFY",
            reason: `Version '${proposedVer}' exceeds compatible release upper bound for '${spec}'`,
          };
        }
        continue;
      }

      // Standard comparison operators
      const targetVer = this.parsePep440Version(spec);
      if (!targetVer) {
        return {
          status: "INVALID_REQUIREMENT",
          reason: `Invalid target version in PEP 440 clause '${clause}'`,
        };
      }

      const cmp = this.comparePep440(parsedVer, targetVer);

      let satisfies = false;
      switch (op) {
        case "==":
        case "===":
          satisfies = cmp === 0;
          break;
        case "!=":
          satisfies = cmp !== 0;
          break;
        case ">=":
          satisfies = cmp >= 0;
          break;
        case "<=":
          satisfies = cmp <= 0;
          break;
        case ">":
          satisfies = cmp > 0;
          break;
        case "<":
          satisfies = cmp < 0;
          break;
      }

      if (!satisfies) {
        return {
          status: "DOES_NOT_SATISFY",
          reason: `Version '${proposedVer}' does not satisfy PEP 440 clause '${clause}'`,
        };
      }
    }

    return {
      status: "SATISFIES",
      reason: `Version '${proposedVer}' satisfies PEP 440 requirement '${rawReq}'`,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PEP 440 HELPER UTILITIES
  // ─────────────────────────────────────────────────────────────

  private static parsePep440Version(raw: string): {
    parts: number[];
    pre?: { type: "a" | "b" | "rc"; num: number };
    post?: number;
    dev?: number;
  } | null {
    const clean = raw.trim();
    if (clean.length === 0) return null;

    // Normalize v-prefix
    const withoutV = clean.startsWith("v") ? clean.slice(1) : clean;

    const regex = /^([0-9]+(?:\.[0-9]+)*)(?:(a|b|rc)([0-9]+)?)?(?:\.post([0-9]+))?(?:\.dev([0-9]+))?$/;
    const match = withoutV.match(regex);
    if (!match) return null;

    const parts = match[1]!.split(".").map((p) => parseInt(p, 10));
    const pre = match[2]
      ? {
          type: match[2] as "a" | "b" | "rc",
          num: match[3] ? parseInt(match[3], 10) : 0,
        }
      : undefined;
    const post = match[4] ? parseInt(match[4], 10) : undefined;
    const dev = match[5] ? parseInt(match[5], 10) : undefined;

    return { parts, pre, post, dev };
  }

  private static comparePep440(
    a: { parts: number[]; pre?: { type: "a" | "b" | "rc"; num: number }; post?: number; dev?: number },
    b: { parts: number[]; pre?: { type: "a" | "b" | "rc"; num: number }; post?: number; dev?: number }
  ): number {
    const maxLen = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < maxLen; i++) {
      const partA = a.parts[i] ?? 0;
      const partB = b.parts[i] ?? 0;
      if (partA !== partB) {
        return partA - partB;
      }
    }

    // Pre-release: pre-releases sort BEFORE final releases
    const hasPreA = a.pre !== undefined;
    const hasPreB = b.pre !== undefined;
    if (hasPreA && !hasPreB) return -1;
    if (!hasPreA && hasPreB) return 1;
    if (hasPreA && hasPreB && a.pre && b.pre) {
      const typeRank = { a: 1, b: 2, rc: 3 };
      if (typeRank[a.pre.type] !== typeRank[b.pre.type]) {
        return typeRank[a.pre.type] - typeRank[b.pre.type];
      }
      if (a.pre.num !== b.pre.num) {
        return a.pre.num - b.pre.num;
      }
    }

    // Post-release: post-releases sort AFTER final releases
    const postA = a.post ?? -1;
    const postB = b.post ?? -1;
    if (postA !== postB) {
      return postA - postB;
    }

    return 0;
  }

  private static matchesPep440Prefix(
    ver: { parts: number[] },
    prefixStr: string
  ): boolean {
    const prefixTokens = prefixStr
      .split(".")
      .map((p) => parseInt(p, 10))
      .filter((p) => !isNaN(p));
    for (let i = 0; i < prefixTokens.length; i++) {
      if ((ver.parts[i] ?? 0) !== prefixTokens[i]) {
        return false;
      }
    }
    return true;
  }
}

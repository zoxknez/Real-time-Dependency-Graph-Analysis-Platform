/**
 * WebMCP Runtime Input Validation (WMCP-3B)
 *
 * Strict validation enforcing product-specific schema constraints, rejecting
 * caller-controlled security identities, tenant parameters, and context revision parameters.
 */

import { PackageEcosystem } from "../../war-room/domain/types";
import {
  OpenPackageGraphRequest,
  SearchPackagesRequest,
} from "../../war-room/application/types";

const CANONICAL_ECOSYSTEMS = new Set<string>([
  "NPM",
  "PY_PI",
  "CARGO",
  "MAVEN",
  "NU_GET",
  "GO",
]);

export interface ValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly error?: string;
}

export function validateSearchPackagesInput(
  raw: unknown
): ValidationResult<SearchPackagesRequest> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      valid: false,
      error: "Input must be a non-null object",
    };
  }

  const record = raw as Record<string, unknown>;
  const allowedKeys = new Set(["query", "ecosystem", "limit"]);

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return {
        valid: false,
        error: `Unexpected parameter '${key}'. Parameter is not allowed.`,
      };
    }
  }

  if (typeof record.query !== "string") {
    return {
      valid: false,
      error: "Parameter 'query' is required and must be a string",
    };
  }

  const trimmedQuery = record.query.trim();
  if (trimmedQuery.length === 0) {
    return {
      valid: false,
      error: "Parameter 'query' cannot be empty or whitespace",
    };
  }

  if (trimmedQuery.length > 120) {
    return {
      valid: false,
      error: "Parameter 'query' exceeds maximum length of 120 characters",
    };
  }

  let ecosystem: PackageEcosystem | undefined = undefined;
  if (record.ecosystem !== undefined) {
    if (typeof record.ecosystem !== "string" || !CANONICAL_ECOSYSTEMS.has(record.ecosystem)) {
      return {
        valid: false,
        error: `Parameter 'ecosystem' must be one of: ${Array.from(CANONICAL_ECOSYSTEMS).join(", ")}`,
      };
    }
    ecosystem = record.ecosystem as PackageEcosystem;
  }

  let limit = 5;
  if (record.limit !== undefined) {
    if (
      typeof record.limit !== "number" ||
      !Number.isInteger(record.limit) ||
      record.limit < 1 ||
      record.limit > 8
    ) {
      return {
        valid: false,
        error: "Parameter 'limit' must be an integer between 1 and 8",
      };
    }
    limit = record.limit;
  }

  return {
    valid: true,
    value: {
      query: trimmedQuery,
      ecosystem,
      limit,
    },
  };
}

export function validateOpenPackageGraphInput(
  raw: unknown
): ValidationResult<OpenPackageGraphRequest> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      valid: false,
      error: "Input must be a non-null object",
    };
  }

  const record = raw as Record<string, unknown>;
  const allowedKeys = new Set(["rootPackageId", "depth"]);

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return {
        valid: false,
        error: `Unexpected parameter '${key}'. Parameter is not allowed.`,
      };
    }
  }

  if (typeof record.rootPackageId !== "string") {
    return {
      valid: false,
      error: "Parameter 'rootPackageId' is required and must be a string",
    };
  }

  const trimmedRootId = record.rootPackageId.trim();
  if (trimmedRootId.length === 0) {
    return {
      valid: false,
      error: "Parameter 'rootPackageId' cannot be empty or whitespace",
    };
  }

  if (trimmedRootId.length > 256) {
    return {
      valid: false,
      error: "Parameter 'rootPackageId' exceeds maximum length of 256 characters",
    };
  }

  let depth = 2;
  if (record.depth !== undefined) {
    if (
      typeof record.depth !== "number" ||
      !Number.isInteger(record.depth) ||
      record.depth < 1 ||
      record.depth > 4
    ) {
      return {
        valid: false,
        error: "Parameter 'depth' must be an integer between 1 and 4",
      };
    }
    depth = record.depth;
  }

  return {
    valid: true,
    value: {
      rootPackageId: trimmedRootId,
      depth,
    },
  };
}

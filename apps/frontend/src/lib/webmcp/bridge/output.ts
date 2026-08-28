/**
 * WebMCP Output Envelope & Budget Formatter (WMCP-3B / WMCP-3B-R1 / WMCP-INV-011)
 *
 * Enforces strict hard character budgeting (<= 1500 characters, target <= 1400),
 * whole-record package truncation, and clean error sanitization without leaking
 * stacks, causes, raw DOMExceptions, or internal details.
 */

import { WarRoomErrorCode, WarRoomPackageRef } from "../../war-room";
import {
  WebMcpOpenGraphResultData,
  WebMcpSearchPackagesResultData,
  WebMcpToolFailureEnvelope,
  WebMcpToolOutputEnvelope,
  WebMcpToolSuccessEnvelope,
} from "./types";

export const MAX_TOTAL_OUTPUT_CHARS = 1500;
export const TARGET_INTERNAL_BUDGET_CHARS = 1400;
export const MAX_ERROR_MESSAGE_CHARS = 240;

export function sanitizeErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= MAX_ERROR_MESSAGE_CHARS) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_ERROR_MESSAGE_CHARS - 3) + "...";
}

export function formatToolFailure(
  tool: string,
  contextRevision: number,
  code: WarRoomErrorCode,
  message: string
): WebMcpToolFailureEnvelope {
  const sanitized = sanitizeErrorMessage(message);
  const envelope: WebMcpToolFailureEnvelope = {
    ok: false,
    tool,
    changed: false,
    contextRevision,
    error: {
      code,
      message: sanitized,
    },
  };

  if (JSON.stringify(envelope).length <= MAX_TOTAL_OUTPUT_CHARS) {
    return envelope;
  }

  // Fallback minimal error envelope guaranteed to fit within budget
  return {
    ok: false,
    tool,
    changed: false,
    contextRevision,
    error: {
      code,
      message: "Operation failed",
    },
  };
}

export function formatToolSuccess<TData>(
  tool: string,
  changed: boolean,
  contextRevision: number,
  data: TData
): WebMcpToolOutputEnvelope<TData> {
  const envelope: WebMcpToolSuccessEnvelope<TData> = {
    ok: true,
    tool,
    changed,
    contextRevision,
    data,
  };

  const serialized = JSON.stringify(envelope);
  if (serialized.length <= MAX_TOTAL_OUTPUT_CHARS) {
    return envelope;
  }

  // Hard budget fail-closed: return small structured INTERNAL_ERROR if generic data exceeds budget
  return formatToolFailure(
    tool,
    contextRevision,
    "INTERNAL_ERROR",
    "Tool result exceeded the safe output budget"
  );
}

/**
 * Builds search package output incrementally to strictly respect the character budget.
 * Includes whole package records only (never slicing or corrupting package IDs/names).
 */
export function buildBudgetedSearchOutput(
  tool: string,
  contextRevision: number,
  allPackages: readonly WarRoomPackageRef[],
  totalCount?: number
): WebMcpToolOutputEnvelope<WebMcpSearchPackagesResultData> {
  const budgetedPackages: WarRoomPackageRef[] = [];
  let isTruncated = false;
  const effectiveTotalCount =
    totalCount !== undefined ? totalCount : allPackages.length;

  for (const pkg of allPackages) {
    const candidatePackages = [...budgetedPackages, pkg];
    const candidateData: WebMcpSearchPackagesResultData = {
      packages: candidatePackages,
      returnedCount: candidatePackages.length,
      totalCount: effectiveTotalCount,
      truncated:
        isTruncated ||
        candidatePackages.length < allPackages.length ||
        candidatePackages.length < effectiveTotalCount,
    };

    const candidateEnvelope: WebMcpToolSuccessEnvelope<WebMcpSearchPackagesResultData> = {
      ok: true,
      tool,
      changed: false,
      contextRevision,
      data: candidateData,
    };

    if (JSON.stringify(candidateEnvelope).length <= TARGET_INTERNAL_BUDGET_CHARS) {
      budgetedPackages.push(pkg);
    } else {
      isTruncated = true;
      break;
    }
  }

  const finalData: WebMcpSearchPackagesResultData = {
    packages: budgetedPackages,
    returnedCount: budgetedPackages.length,
    totalCount: effectiveTotalCount,
    truncated:
      isTruncated ||
      budgetedPackages.length < allPackages.length ||
      budgetedPackages.length < effectiveTotalCount,
  };

  const finalEnvelope: WebMcpToolSuccessEnvelope<WebMcpSearchPackagesResultData> = {
    ok: true,
    tool,
    changed: false,
    contextRevision,
    data: finalData,
  };

  if (JSON.stringify(finalEnvelope).length <= MAX_TOTAL_OUTPUT_CHARS) {
    return finalEnvelope;
  }

  // Hard fail-closed fallback
  return formatToolFailure(
    tool,
    contextRevision,
    "INTERNAL_ERROR",
    "Tool result exceeded the safe output budget"
  );
}

export function buildBudgetedOpenGraphOutput(
  tool: string,
  contextRevision: number,
  changed: boolean,
  graphId: string,
  rootPackage: WarRoomPackageRef,
  packageCount: number,
  projectionActivated: boolean
): WebMcpToolOutputEnvelope<WebMcpOpenGraphResultData> {
  // 1. Full representation
  const fullData: WebMcpOpenGraphResultData = {
    graphId,
    rootPackage,
    packageCount,
    compact: false,
    projectionActivated,
  };

  const fullEnvelope: WebMcpToolSuccessEnvelope<WebMcpOpenGraphResultData> = {
    ok: true,
    tool,
    changed,
    contextRevision,
    data: fullData,
  };

  if (JSON.stringify(fullEnvelope).length <= MAX_TOTAL_OUTPUT_CHARS) {
    return fullEnvelope;
  }

  // 2. Compact fallback (omits unbounded external name/version)
  const compactData: WebMcpOpenGraphResultData = {
    graphId,
    rootPackageId: rootPackage.id,
    packageCount,
    compact: true,
    projectionActivated,
  };

  const compactEnvelope: WebMcpToolSuccessEnvelope<WebMcpOpenGraphResultData> = {
    ok: true,
    tool,
    changed,
    contextRevision,
    data: compactData,
  };

  if (JSON.stringify(compactEnvelope).length <= MAX_TOTAL_OUTPUT_CHARS) {
    return compactEnvelope;
  }

  // 3. Hard fail-closed fallback if even compact representation exceeds 1500 chars
  return formatToolFailure(
    tool,
    contextRevision,
    "INTERNAL_ERROR",
    "Tool result exceeded the safe output budget"
  );
}

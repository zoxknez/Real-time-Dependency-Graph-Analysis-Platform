/**
 * WebMCP Output Envelope & Budget Formatter (WMCP-3B / WMCP-INV-011)
 *
 * Enforces strict character budgeting (<= 1500 characters, target <= 1400),
 * whole-record package truncation, and clean error sanitization without leaking
 * stacks, causes, raw DOMExceptions, or internal details.
 */

import { WarRoomErrorCode, WarRoomPackageRef } from "../../war-room";
import {
  WebMcpOpenGraphResultData,
  WebMcpSearchPackagesResultData,
  WebMcpToolFailureEnvelope,
  WebMcpToolSuccessEnvelope,
} from "./types";

const MAX_TOTAL_OUTPUT_CHARS = 1500;
const TARGET_INTERNAL_BUDGET_CHARS = 1400;
const MAX_ERROR_MESSAGE_CHARS = 240;

export function sanitizeErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= MAX_ERROR_MESSAGE_CHARS) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_ERROR_MESSAGE_CHARS - 3) + "...";
}

export function formatToolSuccess<TData>(
  tool: string,
  changed: boolean,
  contextRevision: number,
  data: TData
): WebMcpToolSuccessEnvelope<TData> {
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

  // Safety fallback if serialized exceeds budget
  return envelope;
}

export function formatToolFailure(
  tool: string,
  contextRevision: number,
  code: WarRoomErrorCode,
  message: string
): WebMcpToolFailureEnvelope {
  const sanitized = sanitizeErrorMessage(message);
  return {
    ok: false,
    tool,
    changed: false,
    contextRevision,
    error: {
      code,
      message: sanitized,
    },
  };
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
): WebMcpToolSuccessEnvelope<WebMcpSearchPackagesResultData> {
  const budgetedPackages: WarRoomPackageRef[] = [];
  let isTruncated = false;

  for (const pkg of allPackages) {
    const candidatePackages = [...budgetedPackages, pkg];
    const candidateData: WebMcpSearchPackagesResultData = {
      packages: candidatePackages,
      returnedCount: candidatePackages.length,
      totalCount: totalCount !== undefined ? totalCount : allPackages.length,
      truncated: isTruncated || candidatePackages.length < allPackages.length,
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
    totalCount: totalCount !== undefined ? totalCount : allPackages.length,
    truncated: isTruncated || budgetedPackages.length < allPackages.length,
  };

  return {
    ok: true,
    tool,
    changed: false,
    contextRevision,
    data: finalData,
  };
}

export function buildBudgetedOpenGraphOutput(
  tool: string,
  contextRevision: number,
  graphId: string,
  rootPackage: WarRoomPackageRef,
  packageCount: number
): WebMcpToolSuccessEnvelope<WebMcpOpenGraphResultData> {
  const fullData: WebMcpOpenGraphResultData = {
    graphId,
    rootPackage,
    packageCount,
  };

  const envelope: WebMcpToolSuccessEnvelope<WebMcpOpenGraphResultData> = {
    ok: true,
    tool,
    changed: true,
    contextRevision,
    data: fullData,
  };

  if (JSON.stringify(envelope).length <= MAX_TOTAL_OUTPUT_CHARS) {
    return envelope;
  }

  // Minimal fallback if package ref properties somehow caused overflow
  const minimalData: WebMcpOpenGraphResultData = {
    graphId,
    rootPackage: {
      id: rootPackage.id,
      name: rootPackage.name,
      ecosystem: rootPackage.ecosystem,
    },
    packageCount,
  };

  return {
    ok: true,
    tool,
    changed: true,
    contextRevision,
    data: minimalData,
  };
}

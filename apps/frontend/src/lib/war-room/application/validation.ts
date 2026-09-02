/**
 * War Room Action & Service Output Runtime Validation
 *
 * Enforces runtime shape integrity on public action inputs and service outputs (Section 39, 54, WMCP-2B-R1).
 */

import { WarRoomGraphContext } from "../domain/types";
import {
  WarRoomDomainError,
  invalidInputError,
  createDomainError,
} from "../domain/errors";
import {
  WarRoomSecurityContext,
  WarRoomInvocationContext,
  SearchPackagesRequest,
  InspectPackageRequest,
  TraceDependencyPathRequest,
  OpenPackageGraphRequest,
  SelectPackageRequest,
} from "./types";

const CANONICAL_ECOSYSTEMS = new Set(["NPM", "PY_PI", "CARGO", "MAVEN", "NU_GET", "GO"]);

export function validateInvocationContext(
  invocation: WarRoomInvocationContext
): WarRoomDomainError | null {
  if (!invocation || typeof invocation !== "object") {
    return invalidInputError("Invocation context must be an object");
  }

  if (invocation.channel !== "HUMAN" && invocation.channel !== "AGENT") {
    return invalidInputError("Invocation channel must be HUMAN or AGENT");
  }

  if (
    typeof invocation.capturedContextRevision !== "number" ||
    !Number.isInteger(invocation.capturedContextRevision) ||
    invocation.capturedContextRevision < 0
  ) {
    return invalidInputError("Captured context revision must be a non-negative integer");
  }

  return null;
}

export function validateSecurityContextOutput(
  sec: WarRoomSecurityContext
): WarRoomDomainError | null {
  if (!sec || typeof sec !== "object") {
    return createDomainError("INTERNAL_ERROR", "Trusted security context must be an object");
  }

  if (typeof sec.tenantId !== "string" || sec.tenantId.trim() === "") {
    return createDomainError("INTERNAL_ERROR", "Trusted security context returned invalid tenant ID");
  }

  if (typeof sec.userId !== "string" || sec.userId.trim() === "") {
    return createDomainError("INTERNAL_ERROR", "Trusted security context returned invalid user ID");
  }

  if (sec.organizationId !== undefined) {
    if (typeof sec.organizationId !== "string" || sec.organizationId.trim() === "") {
      return createDomainError("INTERNAL_ERROR", "Trusted security context returned invalid organization ID");
    }
  }

  return null;
}

export function validateSearchPackagesRequest(
  request: SearchPackagesRequest
): WarRoomDomainError | null {
  if (!request || typeof request !== "object") {
    return invalidInputError("Search request must be an object");
  }

  if (!request.query || request.query.trim() === "") {
    return invalidInputError("Search query must not be empty");
  }

  if (request.ecosystem !== undefined) {
    if (!CANONICAL_ECOSYSTEMS.has(request.ecosystem)) {
      return invalidInputError(`Invalid package ecosystem: ${request.ecosystem}`);
    }
  }

  if (request.limit !== undefined) {
    if (typeof request.limit !== "number" || !Number.isInteger(request.limit) || request.limit <= 0) {
      return invalidInputError("Search limit must be a positive integer");
    }
  }

  return null;
}

export function validateInspectPackageRequest(
  request: InspectPackageRequest
): WarRoomDomainError | null {
  if (!request || typeof request !== "object") {
    return invalidInputError("Inspect request must be an object");
  }

  if (!request.packageId || request.packageId.trim() === "") {
    return invalidInputError("Package ID must not be empty");
  }

  return null;
}

export function validateTraceDependencyPathRequest(
  request: TraceDependencyPathRequest
): WarRoomDomainError | null {
  if (!request || typeof request !== "object") {
    return invalidInputError("Trace dependency path request must be an object");
  }

  if (!request.fromPackageId || request.fromPackageId.trim() === "") {
    return invalidInputError("From package ID must not be empty");
  }

  if (!request.toPackageId || request.toPackageId.trim() === "") {
    return invalidInputError("To package ID must not be empty");
  }

  if (request.maxHops !== undefined) {
    if (typeof request.maxHops !== "number" || !Number.isInteger(request.maxHops) || request.maxHops <= 0) {
      return invalidInputError("Max hops must be a positive integer");
    }
  }

  return null;
}

export function validateOpenPackageGraphRequest(
  request: OpenPackageGraphRequest
): WarRoomDomainError | null {
  if (!request || typeof request !== "object") {
    return invalidInputError("Open package graph request must be an object");
  }

  if (!request.rootPackageId || request.rootPackageId.trim() === "") {
    return invalidInputError("Root package ID must not be empty");
  }

  if (request.depth !== undefined) {
    if (typeof request.depth !== "number" || !Number.isInteger(request.depth) || request.depth <= 0) {
      return invalidInputError("Graph depth must be a positive integer");
    }
  }

  return null;
}

export function validateSelectPackageRequest(
  request: SelectPackageRequest
): WarRoomDomainError | null {
  if (!request || typeof request !== "object") {
    return invalidInputError("Selection request must be an object");
  }

  if (!request.selection || typeof request.selection !== "object" || !request.selection.package) {
    return invalidInputError("Selection request must contain package selection");
  }

  if (
    typeof request.selection.package.id !== "string" ||
    request.selection.package.id.trim() === ""
  ) {
    return invalidInputError("Selected package ID must be a non-empty string");
  }

  return null;
}

export function validateGraphServiceOutput(
  graph: WarRoomGraphContext
): WarRoomDomainError | null {
  if (!graph || typeof graph !== "object") {
    return createDomainError("INTERNAL_ERROR", "Service returned non-object graph context");
  }

  if (!graph.id || graph.id.trim() === "") {
    return createDomainError("INTERNAL_ERROR", "Service returned graph with empty ID");
  }

  if (!graph.rootPackage || !graph.rootPackage.id || !graph.rootPackage.name) {
    return createDomainError("INTERNAL_ERROR", "Service returned graph with malformed root package");
  }

  if (!Array.isArray(graph.packageIds)) {
    return createDomainError("INTERNAL_ERROR", "Service returned graph with non-array package IDs");
  }

  if (!graph.packageIds.includes(graph.rootPackage.id)) {
    return createDomainError("INTERNAL_ERROR", "Service returned graph package IDs missing root package ID");
  }

  for (const pid of graph.packageIds) {
    if (!pid || pid.trim() === "") {
      return createDomainError("INTERNAL_ERROR", "Service returned graph containing empty package ID");
    }
  }

  return null;
}

export function validateCalculateBlastRadiusRequest(
  request: import("./types").CalculateBlastRadiusRequest
): WarRoomDomainError | null {
  if (!request) {
    return invalidInputError("Request must not be null or undefined");
  }
  if (request.targetPackageId !== undefined) {
    if (typeof request.targetPackageId !== "string" || request.targetPackageId.trim() === "") {
      return invalidInputError("targetPackageId, if specified, must not be empty");
    }
  }
  if (request.proposedVersion !== undefined) {
    if (typeof request.proposedVersion !== "string" || request.proposedVersion.trim() === "" || request.proposedVersion.length > 128) {
      return invalidInputError("proposedVersion, if specified, must be a non-empty string <= 128 characters");
    }
  }
  return null;
}

export function validateFocusGraphNodesRequest(
  request: import("./types").FocusGraphNodesRequest
): WarRoomDomainError | null {
  if (!request || !Array.isArray(request.nodeIds)) {
    return invalidInputError("Request must contain nodeIds array");
  }
  if (request.nodeIds.length < 1 || request.nodeIds.length > 20) {
    return invalidInputError(`nodeIds count must be between 1 and 20, received ${request.nodeIds.length}`);
  }
  for (const id of request.nodeIds) {
    if (typeof id !== "string" || id.trim() === "") {
      return invalidInputError("Every node ID must be a non-empty string");
    }
  }
  return null;
}

export function validateSetScenarioPriorityRequest(
  request: import("./types").SetScenarioPriorityRequest
): WarRoomDomainError | null {
  if (!request || typeof request !== "object") {
    return invalidInputError("Request must be an object");
  }
  if (typeof request.entityId !== "string" || request.entityId.trim() === "") {
    return invalidInputError("entityId must be a non-empty string");
  }
  if (!["P0", "P1", "P2", "P3"].includes(request.priority)) {
    return invalidInputError("priority must be one of 'P0', 'P1', 'P2', 'P3'");
  }
  if (request.note !== undefined) {
    if (typeof request.note !== "string" || request.note.length > 240) {
      return invalidInputError("note, if provided, must be a string of at most 240 characters");
    }
  }
  return null;
}

export function validateSetScenarioExclusionRequest(
  request: import("./types").SetScenarioExclusionRequest
): WarRoomDomainError | null {
  if (!request || typeof request !== "object") {
    return invalidInputError("Request must be an object");
  }
  if (typeof request.entityId !== "string" || request.entityId.trim() === "") {
    return invalidInputError("entityId must be a non-empty string");
  }
  if (typeof request.excluded !== "boolean") {
    return invalidInputError("excluded must be a boolean");
  }
  if (typeof request.reason !== "string" || request.reason.trim().length === 0 || request.reason.length > 240) {
    return invalidInputError("reason must be a non-empty string of at most 240 characters");
  }
  return null;
}

export function validateInspectCriticalPathsRequest(
  request?: import("./types").InspectCriticalPathsRequest
): WarRoomDomainError | null {
  if (request && request.maxPaths !== undefined) {
    if (typeof request.maxPaths !== "number" || !Number.isInteger(request.maxPaths) || request.maxPaths < 1 || request.maxPaths > 10) {
      return invalidInputError("maxPaths must be an integer between 1 and 10");
    }
  }
  return null;
}


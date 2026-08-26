/**
 * Canonical War Room Domain Error Taxonomy
 *
 * Locked domain error codes according to WMCP-0B and architecture invariants.
 */

export type WarRoomErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "STALE_CONTEXT"
  | "UNAVAILABLE"
  | "UNSUPPORTED_ECOSYSTEM"
  | "SNAPSHOT_UNAVAILABLE"
  | "VERSION_RANGE_INVALID"
  | "SCENARIO_CONFLICT"
  | "CAPABILITY_DENIED"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export interface WarRoomDomainError {
  readonly code: WarRoomErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export function createDomainError(
  code: WarRoomErrorCode,
  message: string,
  details?: Record<string, unknown>
): WarRoomDomainError {
  return {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  };
}

export function invalidInputError(
  message: string,
  details?: Record<string, unknown>
): WarRoomDomainError {
  return createDomainError("INVALID_INPUT", message, details);
}

export function notFoundError(
  message: string,
  details?: Record<string, unknown>
): WarRoomDomainError {
  return createDomainError("NOT_FOUND", message, details);
}

export function invalidStateError(
  message: string,
  details?: Record<string, unknown>
): WarRoomDomainError {
  return createDomainError("INVALID_STATE", message, details);
}

export function staleContextError(
  capturedRevision: number,
  currentRevision: number
): WarRoomDomainError {
  return createDomainError(
    "STALE_CONTEXT",
    `Stale context revision: captured ${capturedRevision}, current is ${currentRevision}`,
    { capturedRevision, currentRevision }
  );
}

export function scenarioConflictError(
  message: string,
  details?: Record<string, unknown>
): WarRoomDomainError {
  return createDomainError("SCENARIO_CONFLICT", message, details);
}

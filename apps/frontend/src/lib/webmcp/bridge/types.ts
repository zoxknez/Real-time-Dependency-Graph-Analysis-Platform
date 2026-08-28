/**
 * WebMCP Tool Execution Bridge Types (WMCP-3B)
 *
 * Concise, structured envelopes and data contracts for WebMCP tool invocations.
 */

import { WarRoomErrorCode, WarRoomPackageRef } from "../../war-room";

export interface WebMcpToolSuccessEnvelope<TData> {
  readonly ok: true;
  readonly tool: string;
  readonly changed: boolean;
  readonly contextRevision: number;
  readonly data: TData;
}

export interface WebMcpToolFailureEnvelope {
  readonly ok: false;
  readonly tool: string;
  readonly changed: false;
  readonly contextRevision: number;
  readonly error: {
    readonly code: WarRoomErrorCode;
    readonly message: string;
  };
}

export type WebMcpToolOutputEnvelope<TData> =
  | WebMcpToolSuccessEnvelope<TData>
  | WebMcpToolFailureEnvelope;

export interface WebMcpSearchPackagesResultData {
  readonly packages: readonly WarRoomPackageRef[];
  readonly returnedCount: number;
  readonly totalCount?: number;
  readonly truncated: boolean;
}

export interface WebMcpOpenGraphResultData {
  readonly graphId: string;
  readonly rootPackage: WarRoomPackageRef;
  readonly packageCount: number;
}

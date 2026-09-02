/**
 * WebMCP Tool Execution Bridge Types (WMCP-3B / WMCP-3B-R1)
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

export type WebMcpOpenGraphResultData =
  | {
      readonly graphId: string;
      readonly rootPackage: WarRoomPackageRef;
      readonly packageCount: number;
      readonly compact: false;
      readonly projectionActivated: boolean;
    }
  | {
      readonly graphId: string;
      readonly rootPackageId: string;
      readonly packageCount: number;
      readonly compact: true;
      readonly projectionActivated: boolean;
    };

export interface WebMcpScenarioFindingSummary {
  readonly changeType: string;
  readonly symbolPath: string;
  readonly description: string;
  readonly severity?: string;
  readonly oldSignature?: string;
  readonly newSignature?: string;
}

export interface WebMcpScenarioResultData {
  readonly scenarioId: string;
  readonly targetPackageId: string;
  readonly baseVersion?: string;
  readonly changed: boolean;
  readonly baselineSurfaceHashPrefix?: string;
  readonly candidateSurfaceHashPrefix?: string;
  readonly totalBreakingChanges: number;
  readonly returnedBreakingChanges: number;
  readonly serverTruncated: boolean;
  readonly topFindings: readonly WebMcpScenarioFindingSummary[];
  readonly findingsDisplayedCount: number;
  readonly outputTruncated: boolean;
}


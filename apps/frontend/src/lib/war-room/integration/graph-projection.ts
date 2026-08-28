/**
 * Non-Canonical Graph Projection Store & Staging Lifecycle
 *
 * Manages render projections isolated from canonical WarRoomState (WMCP-2C-R1).
 * Enforces latest-request sequence validation and two-phase staging/activation lifecycle.
 */

import { PackageEcosystem } from "../domain/types";

export interface WarRoomProjectionNode {
  readonly id: string;
  readonly name: string;
  readonly ecosystem: PackageEcosystem;
  readonly depth: number;
  readonly isRoot: boolean;
}

export interface WarRoomProjectionLink {
  readonly source: string;
  readonly target: string;
  readonly kind: "REVERSE_REACHABILITY";
}

export interface WarRoomGraphProjection {
  readonly graphId: string;
  readonly rootPackageId: string;
  readonly depth: number;
  readonly nodes: readonly WarRoomProjectionNode[];
  readonly links: readonly WarRoomProjectionLink[];
  readonly loadedCount: number; // Unique loaded reverse dependents (excluding root)
  readonly totalCount: number;  // Total reverse dependents reported by backend
  readonly truncated: boolean;  // totalCount > loadedCount
}

interface StagedEntry {
  readonly projection: WarRoomGraphProjection;
  readonly sequence: number;
}

export interface WarRoomGraphProjectionStore {
  getProjection(graphId: string): WarRoomGraphProjection | null;
  getLatestRequestedSequence(graphId: string): number;
  nextSequence(graphId: string): number;
  stageProjection(signal: AbortSignal, projection: WarRoomGraphProjection, sequence: number): void;
  activateProjection(signal: AbortSignal, expectedGraphId: string): boolean;
  discardProjection(signal: AbortSignal): void;
  subscribe(listener: () => void): () => void;
}

export function createGraphProjectionStore(): WarRoomGraphProjectionStore {
  const visibleProjections = new Map<string, WarRoomGraphProjection>();
  const latestRequestedSequence = new Map<string, number>();
  const latestCommittedSequence = new Map<string, number>();
  const stagedBySignal = new Map<AbortSignal, StagedEntry>();
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (e) {
        console.error("[GraphProjectionStore] Subscriber error:", e);
      }
    }
  }

  return {
    getProjection(graphId: string): WarRoomGraphProjection | null {
      return visibleProjections.get(graphId) || null;
    },

    getLatestRequestedSequence(graphId: string): number {
      return latestRequestedSequence.get(graphId) || 0;
    },

    nextSequence(graphId: string): number {
      const current = latestRequestedSequence.get(graphId) || 0;
      const next = current + 1;
      latestRequestedSequence.set(graphId, next);
      return next;
    },

    stageProjection(signal: AbortSignal, projection: WarRoomGraphProjection, sequence: number): void {
      if (signal.aborted) return;
      stagedBySignal.set(signal, { projection, sequence });
    },

    activateProjection(signal: AbortSignal, expectedGraphId: string): boolean {
      const staged = stagedBySignal.get(signal);
      stagedBySignal.delete(signal);

      if (!staged) {
        return false;
      }

      const { projection, sequence } = staged;
      if (projection.graphId !== expectedGraphId) {
        return false;
      }

      // Monotonic commit sequence check: an older sequence cannot overwrite a newer committed sequence
      const latestCom = latestCommittedSequence.get(projection.graphId) || 0;
      if (sequence < latestCom) {
        return false;
      }

      latestCommittedSequence.set(projection.graphId, sequence);
      visibleProjections.set(projection.graphId, projection);
      notify();
      return true;
    },

    discardProjection(signal: AbortSignal): void {
      stagedBySignal.delete(signal);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

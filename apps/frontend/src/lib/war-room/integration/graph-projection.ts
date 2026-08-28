/**
 * War Room Graph Projection Model and Store
 *
 * Provides non-canonical render projection data and async race safety outside
 * the canonical domain state kernel (Section 28, 31, 32, WMCP-2C).
 */

export interface WarRoomProjectionNode {
  readonly id: string;
  readonly name: string;
  readonly ecosystem: string;
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
  readonly loadedCount: number;
  readonly totalCount: number;
  readonly truncated: boolean;
}

export interface WarRoomGraphProjectionStore {
  getProjection(graphId?: string): WarRoomGraphProjection | null;
  setProjection(projection: WarRoomGraphProjection, sequence: number): void;
  nextSequence(graphKey: string): number;
  getLatestSequence(graphKey: string): number;
  subscribe(listener: () => void): () => void;
}

export function createGraphProjectionStore(): WarRoomGraphProjectionStore {
  const projections = new Map<string, WarRoomGraphProjection>();
  const sequences = new Map<string, number>();
  const committedSequences = new Map<string, number>();
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (e) {
        console.error("Error in graph projection store listener", e);
      }
    }
  }

  return {
    getProjection(graphId?: string): WarRoomGraphProjection | null {
      if (!graphId) return null;
      return projections.get(graphId) ?? null;
    },

    nextSequence(graphKey: string): number {
      const current = sequences.get(graphKey) || 0;
      const next = current + 1;
      sequences.set(graphKey, next);
      return next;
    },

    getLatestSequence(graphKey: string): number {
      return sequences.get(graphKey) || 0;
    },

    setProjection(projection: WarRoomGraphProjection, sequence: number): void {
      const graphKey = projection.graphId;
      const latestCommitted = committedSequences.get(graphKey) || 0;

      // Only allow monotonic / newer sequence for the same graph key to commit
      if (sequence < latestCommitted) {
        return;
      }

      committedSequences.set(graphKey, sequence);
      projections.set(projection.graphId, projection);
      notify();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

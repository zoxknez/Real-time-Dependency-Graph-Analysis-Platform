/**
 * Vanilla Zustand Store Container & War Room State Port
 *
 * Framework-independent state container following WMCP-INV-003, WMCP-INV-004,
 * and Section 37-41.
 */

import { createStore, StoreApi } from "zustand/vanilla";
import { WarRoomState, WarRoomEvent, TransitionResult } from "../domain/types";
import {
  INITIAL_WAR_ROOM_STATE,
  commitContextBoundTransition,
  reduceWarRoomState,
} from "./transition";

export interface WarRoomStoreState {
  readonly canonical: WarRoomState;
  readonly transition: (event: WarRoomEvent) => TransitionResult;
  readonly commitContextBound: (
    capturedRevision: number,
    event: WarRoomEvent
  ) => TransitionResult;
}

export interface WarRoomStatePort {
  getState(): WarRoomState;
  transition(event: WarRoomEvent): TransitionResult;
  commitContextBound(
    capturedRevision: number,
    event: WarRoomEvent
  ): TransitionResult;
  subscribe(
    listener: (state: WarRoomState, previousState: WarRoomState) => void
  ): () => void;
}

export type WarRoomStoreInstance = StoreApi<WarRoomStoreState> & WarRoomStatePort;

export function createWarRoomStore(
  initialCanonicalState: WarRoomState = INITIAL_WAR_ROOM_STATE
): WarRoomStoreInstance {
  const store = createStore<WarRoomStoreState>((set, get) => ({
    canonical: initialCanonicalState,
    transition: (event: WarRoomEvent): TransitionResult => {
      const current = get().canonical;
      const result = reduceWarRoomState(current, event);
      if (result.ok && result.changed) {
        set({ canonical: result.state });
      }
      return result;
    },
    commitContextBound: (
      capturedRevision: number,
      event: WarRoomEvent
    ): TransitionResult => {
      const current = get().canonical;
      const result = commitContextBoundTransition(
        current,
        capturedRevision,
        event
      );
      if (result.ok && result.changed) {
        set({ canonical: result.state });
      }
      return result;
    },
  }));

  const rawGetState = store.getState;
  const rawSubscribe = store.subscribe;

  const port: WarRoomStatePort = {
    getState(): WarRoomState {
      return rawGetState().canonical;
    },
    transition(event: WarRoomEvent): TransitionResult {
      return rawGetState().transition(event);
    },
    commitContextBound(
      capturedRevision: number,
      event: WarRoomEvent
    ): TransitionResult {
      return rawGetState().commitContextBound(capturedRevision, event);
    },
    subscribe(
      listener: (state: WarRoomState, previousState: WarRoomState) => void
    ): () => void {
      return rawSubscribe((newState, oldState) => {
        listener(newState.canonical, oldState.canonical);
      });
    },
  };

  return Object.assign(store, port);
}

/**
 * Vanilla Zustand Store Container & War Room State Port Adapter
 *
 * Provides a genuine Zustand StoreApi container and a separate framework-independent
 * WarRoomStatePort adapter following WMCP-INV-003, WMCP-INV-004, and Section 10-13.
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

export type WarRoomStoreInstance = StoreApi<WarRoomStoreState>;

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

/**
 * Creates a genuine vanilla Zustand StoreApi instance holding the canonical domain state.
 */
export function createWarRoomStore(
  initialCanonicalState: WarRoomState = INITIAL_WAR_ROOM_STATE
): WarRoomStoreInstance {
  return createStore<WarRoomStoreState>((set, get) => ({
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
}

/**
 * Creates a dedicated WarRoomStatePort adapter wrapping a Zustand StoreApi instance.
 * Decouples future WarRoomActions and WebMCP handlers from Zustand internals (Section 12).
 */
export function createWarRoomStatePort(
  store: StoreApi<WarRoomStoreState>
): WarRoomStatePort {
  return {
    getState(): WarRoomState {
      return store.getState().canonical;
    },
    transition(event: WarRoomEvent): TransitionResult {
      return store.getState().transition(event);
    },
    commitContextBound(
      capturedRevision: number,
      event: WarRoomEvent
    ): TransitionResult {
      return store.getState().commitContextBound(capturedRevision, event);
    },
    subscribe(
      listener: (state: WarRoomState, previousState: WarRoomState) => void
    ): () => void {
      return store.subscribe((newState, oldState) => {
        listener(newState.canonical, oldState.canonical);
      });
    },
  };
}

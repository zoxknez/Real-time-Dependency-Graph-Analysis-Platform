/**
 * Canonical War Room Domain & Application Module
 *
 * Public export boundary for canonical types, error contracts, selectors,
 * transition helpers, store factory, service ports, and WarRoomActions (WMCP-2A, WMCP-2B).
 */

export * from "./domain/types";
export * from "./domain/errors";
export * from "./domain/scenario";
export * from "./state/transition";
export * from "./state/selectors";
export * from "./state/store";
export * from "./application/types";
export * from "./application/ports";
export * from "./application/validation";
export * from "./application/actions";

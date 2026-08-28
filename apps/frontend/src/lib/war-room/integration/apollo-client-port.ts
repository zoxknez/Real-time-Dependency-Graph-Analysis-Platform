/**
 * War Room Apollo Client Integration Interface
 *
 * Minimal Apollo client wrapper type to decouple from Apollo Client version internals (WMCP-2C).
 */

import { OperationVariables, QueryOptions } from "@apollo/client";

export type WarRoomApolloQueryOptions<TVariables extends OperationVariables = OperationVariables> = QueryOptions<TVariables>;

export interface WarRoomApolloQueryResult<TData = unknown> {
  readonly data?: TData | null;
  readonly error?: unknown;
  readonly errors?: readonly unknown[];
}

export interface WarRoomApolloClient {
  query<TData = unknown, TVariables extends OperationVariables = OperationVariables>(
    options: QueryOptions<TVariables, TData> | Record<string, unknown>
  ): Promise<WarRoomApolloQueryResult<TData>>;
}

"use client";

import { ApolloClient, ApolloProvider, InMemoryCache, HttpLink, split } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { useMemo, useEffect, useState } from "react";

// GraphQL endpoints
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "http://localhost:8000/graphql";
const WS_ENDPOINT = process.env.NEXT_PUBLIC_WS_ENDPOINT || "ws://localhost:8000/graphql/ws";

// Connection state for UI feedback
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

// Create WebSocket client with automatic reconnection
function createWsClient() {
  if (typeof window === "undefined") return null;
  
  // Check if WebSocket endpoint is reachable (don't block on failure)
  try {
    return createClient({
      url: WS_ENDPOINT,
      connectionParams: () => {
        // Add auth token if available
        const token = typeof window !== "undefined" 
          ? localStorage.getItem("auth_token") 
          : null;
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      // Retry configuration for enterprise reliability
      retryAttempts: 5,
      retryWait: async (retries) => {
        // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      },
      shouldRetry: (errOrCloseEvent) => {
        // Don't retry on auth errors
        if (errOrCloseEvent && typeof errOrCloseEvent === 'object' && 'code' in (errOrCloseEvent as object) && (errOrCloseEvent as { code?: number }).code === 4401) {
          return false;
        }
        return true;
      },
      lazy: true, // Only connect when subscription is made
      lazyCloseTimeout: 3000,
      on: {
        connecting: () => {
          console.log("[Apollo WS] Connecting to subscription server...");
        },
        connected: () => {
          console.log("[Apollo WS] Connected to subscription server");
          window.dispatchEvent(new CustomEvent("ws-status", { detail: "connected" }));
        },
        closed: (event) => {
          console.log("[Apollo WS] Connection closed", event);
          window.dispatchEvent(new CustomEvent("ws-status", { detail: "disconnected" }));
        },
        error: (error) => {
          // Log error details for debugging
          console.warn("[Apollo WS] Connection error (subscriptions unavailable):", 
            error instanceof Error ? error.message : JSON.stringify(error));
          window.dispatchEvent(new CustomEvent("ws-status", { detail: "error" }));
        },
      },
    });
  } catch (e) {
    console.warn("[Apollo WS] Failed to create WebSocket client:", e);
    return null;
  }
}

function createApolloClient() {
  const httpLink = new HttpLink({
    uri: GRAPHQL_ENDPOINT,
    fetchOptions: { cache: "no-store" },
    credentials: "include", // For cookie-based auth
  });

  // Create WebSocket link for subscriptions (client-side only)
  const wsClient = createWsClient();
  const wsLink = wsClient ? new GraphQLWsLink(wsClient) : null;

  // Split traffic between HTTP and WebSocket based on operation type
  const splitLink = wsLink
    ? split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === "OperationDefinition" &&
            definition.operation === "subscription"
          );
        },
        wsLink,
        httpLink
      )
    : httpLink;

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            package: {
              keyArgs: ["id"],
            },
            reverseDependents: {
              keyArgs: ["packageId", "maxDepth"],
              merge(existing, incoming) {
                if (!existing) return incoming;
                return {
                  ...incoming,
                  edges: [...existing.edges, ...incoming.edges],
                };
              },
            },
            // Real-time event queries merge new events at the front
            liveEvents: {
              keyArgs: false,
              merge(existing = [], incoming) {
                // Dedupe by id, newest first
                const merged = [...incoming, ...existing];
                const seen = new Set<string>();
                return merged.filter((event) => {
                  if (seen.has(event.__ref || event.id)) return false;
                  seen.add(event.__ref || event.id);
                  return true;
                }).slice(0, 100); // Keep max 100 events in cache
              },
            },
          },
        },
        Package: {
          keyFields: ["id"],
        },
        // Type policies for subscription data
        LiveEvent: {
          keyFields: ["id"],
        },
        BreakingChange: {
          keyFields: ["id"],
        },
        Subscription: {
          fields: {
            packagePublished: {
              merge: false, // Always use incoming
            },
            breakingChangeDetected: {
              merge: false,
            },
            liveStats: {
              merge: false,
            },
          },
        },
      },
    }),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: "cache-and-network",
        nextFetchPolicy: "cache-first",
      },
      query: {
        fetchPolicy: "cache-first",
        errorPolicy: "all",
      },
      mutate: {
        errorPolicy: "all",
      },
    },
    devtools: {
      enabled: process.env.NODE_ENV === "development",
    },
  });
}

// Hook to track WebSocket connection status
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ConnectionStatus>).detail;
      setStatus(detail);
    };
    
    window.addEventListener("ws-status", handler);
    return () => window.removeEventListener("ws-status", handler);
  }, []);

  return status;
}

export function ApolloWrapper({ children }: React.PropsWithChildren) {
  const client = useMemo(() => createApolloClient(), []);
  
  return (
    <ApolloProvider client={client}>
      {children}
    </ApolloProvider>
  );
}

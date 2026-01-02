"use client";

import { ApolloClient, ApolloProvider, InMemoryCache, HttpLink, split } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { useMemo, useEffect, useState } from "react";

// GraphQL endpoints
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "http://localhost:8080/graphql";
const WS_ENDPOINT = process.env.NEXT_PUBLIC_WS_ENDPOINT || "ws://localhost:8080/graphql/ws";

// Connection state for UI feedback
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

// Create WebSocket client with automatic reconnection
function createWsClient() {
  if (typeof window === "undefined") return null;
  
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
    retryAttempts: 10,
    retryWait: async (retries) => {
      // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
      const delay = Math.min(1000 * Math.pow(2, retries), 30000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    },
    shouldRetry: () => true,
    keepAlive: 10000, // Send keep-alive every 10s
    on: {
      connected: () => {
        console.log("[Apollo WS] Connected to subscription server");
        window.dispatchEvent(new CustomEvent("ws-status", { detail: "connected" }));
      },
      closed: () => {
        console.log("[Apollo WS] Connection closed");
        window.dispatchEvent(new CustomEvent("ws-status", { detail: "disconnected" }));
      },
      error: (error) => {
        console.error("[Apollo WS] Connection error:", error);
        window.dispatchEvent(new CustomEvent("ws-status", { detail: "error" }));
      },
    },
  });
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
    const handler = (event: CustomEvent<ConnectionStatus>) => {
      setStatus(event.detail);
    };
    
    window.addEventListener("ws-status" as any, handler);
    return () => window.removeEventListener("ws-status" as any, handler);
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

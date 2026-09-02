"use client";

import { ApolloClient, InMemoryCache, HttpLink, split, from, ApolloLink, Observable } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { ApolloProvider } from "@apollo/client/react";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { onError } from "@apollo/client/link/error";
import { RetryLink } from "@apollo/client/link/retry";
import { createClient } from "graphql-ws";
import { useMemo, useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-namespace */
declare module "@apollo/client" {
  interface TypeOverrides {
    signatureStyle: "classic";
  }

  namespace ApolloClient {
    namespace DeclareDefaultOptions {
      interface WatchQuery {
        errorPolicy: "all";
      }

      interface Query {
        errorPolicy: "all";
      }

      interface Mutate {
        errorPolicy: "all";
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || "http://localhost:8000/graphql";
const WS_ENDPOINT = process.env.NEXT_PUBLIC_WS_ENDPOINT || "ws://localhost:8000/graphql/ws";
const API_HEALTH_ENDPOINT = GRAPHQL_ENDPOINT.replace(/\/graphql\/?$/, "/health");

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER - Prevents request flooding when API is down
// ═══════════════════════════════════════════════════════════════

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  nextRetry: number;
  halfOpenAttempts: number;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  nextRetry: 0,
  halfOpenAttempts: 0,
};

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,       // Open circuit after 5 failures
  resetTimeout: 30000,       // Try to close after 30 seconds
  halfOpenMaxRequests: 1,    // Allow 1 request in half-open state
};

function openCircuit(waitTimeMs: number, now = Date.now()): void {
  circuitBreaker.isOpen = true;
  circuitBreaker.nextRetry = now + waitTimeMs;
  circuitBreaker.halfOpenAttempts = 0;
}

function shouldBlockRequest(): boolean {
  const now = Date.now();

  // If circuit is open, check if we should try half-open
  if (circuitBreaker.isOpen) {
    if (now >= circuitBreaker.nextRetry) {
      if (circuitBreaker.halfOpenAttempts < CIRCUIT_BREAKER_CONFIG.halfOpenMaxRequests) {
        circuitBreaker.halfOpenAttempts += 1;
        console.log("[CircuitBreaker] Half-open: allowing test request");
        return false;
      }

      // Half-open attempts exhausted, wait before trying again
      openCircuit(CIRCUIT_BREAKER_CONFIG.resetTimeout, now);
      console.log("[CircuitBreaker] Half-open attempts exhausted, scheduling next retry window");
      return true;
    }
    console.log(`[CircuitBreaker] OPEN - blocking request. Retry in ${Math.round((circuitBreaker.nextRetry - now) / 1000)}s`);
    return true;
  }

  return false;
}

function recordFailure(retryAfterSeconds?: number): void {
  const now = Date.now();

  const hasRetryAfter = typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds);
  if (hasRetryAfter) {
    circuitBreaker.failures = CIRCUIT_BREAKER_CONFIG.failureThreshold;
    circuitBreaker.lastFailure = now;
    openCircuit(retryAfterSeconds * 1000, now);
    console.log(`[CircuitBreaker] OPENED - Retry-After enforced (${retryAfterSeconds}s)`);
    return;
  }

  circuitBreaker.failures += 1;
  circuitBreaker.lastFailure = now;

  if (circuitBreaker.isOpen) {
    openCircuit(CIRCUIT_BREAKER_CONFIG.resetTimeout, now);
    return;
  }

  if (circuitBreaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    openCircuit(CIRCUIT_BREAKER_CONFIG.resetTimeout, now);
    console.log(`[CircuitBreaker] OPENED - too many failures. Will retry in ${CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000}s`);
  }
}

function recordSuccess(): void {
  if (circuitBreaker.isOpen) {
    console.log("[CircuitBreaker] Request succeeded - closing circuit");
  }
  circuitBreaker.failures = 0;
  circuitBreaker.lastFailure = 0;
  circuitBreaker.isOpen = false;
  circuitBreaker.nextRetry = 0;
  circuitBreaker.halfOpenAttempts = 0;
}

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER LINK
// ═══════════════════════════════════════════════════════════════

const circuitBreakerLink = new ApolloLink((operation, forward) => {
  if (shouldBlockRequest()) {
    const now = Date.now();
    const retryInSeconds = Math.max(0, Math.round((circuitBreaker.nextRetry - now) / 1000));
    return new Observable((observer) => {
      observer.error(new Error(`API temporarily unavailable. Retry in ${retryInSeconds}s`));
    });
  }
  return forward(operation);
});

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING LINK - Proper 429 handling with Retry-After
// ═══════════════════════════════════════════════════════════════

function parseRetryAfterSeconds(value?: string | null): number | undefined {
  if (!value) return undefined;
  const asInt = parseInt(value, 10);
  if (!Number.isNaN(asInt)) return asInt;
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.round((asDate - Date.now()) / 1000));
  }
  return undefined;
}

type NetworkLikeError = Error & {
  statusCode?: number;
  response?: { headers?: Headers };
};

const errorLink = onError(({ error, operation }) => {
  if (!CombinedGraphQLErrors.is(error)) {
    const networkError = error as NetworkLikeError;

    // Handle 429 Too Many Requests
    if (networkError.statusCode === 429) {
      // Extract Retry-After header if available
      const retryAfterHeader = networkError.response?.headers?.get('Retry-After');
      const parsedRetry = parseRetryAfterSeconds(retryAfterHeader);
      const retrySeconds = parsedRetry ?? 60;

      console.warn(`[Apollo] Rate limited (429). Retry-After: ${retrySeconds}s`);
      operation.setContext({ rateLimited: true });
      recordFailure(retrySeconds);

      // Don't retry immediately - let circuit breaker handle it
      return;
    }

    // Record other network failures
    if (typeof networkError.statusCode === "number" && networkError.statusCode >= 500) {
      recordFailure();
    }

    console.error(`[Apollo] Network error: ${networkError.message}`);
    return;
  }

  for (const graphQLError of error.errors) {
    // Check for rate limit errors in GraphQL responses
    if (graphQLError.message.toLowerCase().includes('rate limit') ||
      graphQLError.message.toLowerCase().includes('too many requests')) {
      operation.setContext({ rateLimited: true });
      recordFailure(60);
      return;
    }

    console.error(`[Apollo GraphQL Error]: ${graphQLError.message}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// RETRY LINK - Exponential backoff for transient errors
// ═══════════════════════════════════════════════════════════════

const retryLink = new RetryLink({
  delay: {
    initial: 1000,        // Start with 1 second delay
    max: 30000,           // Max 30 seconds between retries
    jitter: true,         // Add randomness to prevent thundering herd
  },
  attempts: {
    max: 3,               // Maximum 3 retry attempts
    retryIf: (error, _operation) => {
      const statusCode = (error as NetworkLikeError | undefined)?.statusCode;

      // Don't retry if circuit breaker is open
      if (circuitBreaker.isOpen) {
        return false;
      }

      // Don't retry 429 errors - let circuit breaker handle
      if (statusCode === 429) {
        return false;
      }

      // Only retry on network errors and 5xx server errors
      const isNetworkError = typeof statusCode !== "number";
      const isServerError = typeof statusCode === "number" && statusCode >= 500;

      return isNetworkError || isServerError;
    },
  },
});

// ═══════════════════════════════════════════════════════════════
// SUCCESS TRACKING LINK
// ═══════════════════════════════════════════════════════════════

const successLink = new ApolloLink((operation, forward) => {
  return new Observable((observer) => {
    const subscription = forward(operation).subscribe({
      next: (response) => {
        const context = operation.getContext();
        if (!context.rateLimited) {
          recordSuccess();
        }
        observer.next(response);
      },
      error: (error) => {
        observer.error(error);
      },
      complete: () => {
        observer.complete();
      },
    });

    return () => {
      subscription.unsubscribe();
    };
  });
});

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET CLIENT
// ═══════════════════════════════════════════════════════════════

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

function createWsClient() {
  if (typeof window === "undefined") return null;

  try {
    return createClient({
      url: WS_ENDPOINT,
      connectionParams: () => {
        const token = typeof window !== "undefined"
          ? localStorage.getItem("auth_token")
          : null;
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      retryAttempts: 5,
      retryWait: async (retries) => {
        // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      },
      shouldRetry: (errOrCloseEvent) => {
        // Don't retry on auth errors
        if (errOrCloseEvent && typeof errOrCloseEvent === 'object' &&
          'code' in (errOrCloseEvent as object) &&
          (errOrCloseEvent as { code?: number }).code === 4401) {
          return false;
        }
        return true;
      },
      lazy: true,
      lazyCloseTimeout: 3000,
      on: {
        connecting: () => {
          console.log("[Apollo WS] Connecting to subscription server...");
        },
        connected: () => {
          console.log("[Apollo WS] Connected to subscription server");
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("ws-status", { detail: "connected" }));
          }
        },
        closed: (event) => {
          console.log("[Apollo WS] Connection closed", event);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("ws-status", { detail: "disconnected" }));
          }
        },
        error: (error) => {
          console.warn("[Apollo WS] Connection error (subscriptions unavailable):",
            error instanceof Error ? error.message : JSON.stringify(error));
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("ws-status", { detail: "error" }));
          }
        },
      },
    });
  } catch (e) {
    console.warn("[Apollo WS] Failed to create WebSocket client:", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// APOLLO CLIENT FACTORY
// ═══════════════════════════════════════════════════════════════

function createApolloClient() {
  const httpLink = new HttpLink({
    uri: GRAPHQL_ENDPOINT,
    fetchOptions: { cache: "no-store" },
    // The GraphQL API is cross-origin and does not use cookie authentication.
    // Sending credentials would make browsers reject the response when the API
    // intentionally omits Access-Control-Allow-Credentials.
    credentials: "same-origin",
  });

  // Create WebSocket link for subscriptions (client-side only)
  const wsClient = createWsClient();
  const wsLink = wsClient ? new GraphQLWsLink(wsClient) : null;

  // Split traffic between HTTP and WebSocket based on operation type
  const transportLink = wsLink
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

  // Chain links: CircuitBreaker -> Error -> Retry -> Success -> Transport
  const link = from([
    circuitBreakerLink,
    successLink,
    errorLink,
    retryLink,
    transportLink,
  ]);

  return new ApolloClient({
    link,
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
            liveEvents: {
              keyArgs: false,
              merge(existing = [], incoming) {
                const merged = [...incoming, ...existing];
                const seen = new Set<string>();
                return merged.filter((event) => {
                  if (seen.has(event.__ref || event.id)) return false;
                  seen.add(event.__ref || event.id);
                  return true;
                }).slice(0, 100);
              },
            },
          },
        },
        Package: {
          keyFields: ["id"],
        },
        LiveEvent: {
          keyFields: ["id"],
        },
        BreakingChange: {
          keyFields: ["id"],
        },
        Subscription: {
          fields: {
            packagePublished: {
              merge: false,
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
        nextFetchPolicy: "cache-first", // Use cache after initial fetch
        errorPolicy: "all",
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

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ConnectionStatus>;
      setStatus(customEvent.detail);
    };

    window.addEventListener("ws-status", handler);
    return () => window.removeEventListener("ws-status", handler);
  }, []);

  return status;
}

// Hook to get circuit breaker status for UI
export function useCircuitBreakerStatus() {
  const [status, setStatus] = useState({
    isOpen: false,
    failures: 0,
    nextRetryIn: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setStatus({
        isOpen: circuitBreaker.isOpen,
        failures: circuitBreaker.failures,
        nextRetryIn: circuitBreaker.isOpen
          ? Math.max(0, Math.round((circuitBreaker.nextRetry - now) / 1000))
          : 0,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return status;
}

export type ApiHealthStatus = "checking" | "online" | "unavailable";

/** Check the actual API health endpoint instead of inferring health from the circuit breaker. */
export function useApiHealthStatus(): ApiHealthStatus {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const checkHealth = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(API_HEALTH_ENDPOINT, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (active) setStatus(response.ok ? "online" : "unavailable");
      } catch {
        if (active) setStatus("unavailable");
      }
    };

    void checkHealth();
    const interval = window.setInterval(checkHealth, 30000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, []);

  return status;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════

export function ApolloWrapper({ children }: React.PropsWithChildren) {
  const client = useMemo(() => createApolloClient(), []);

  return (
    <ApolloProvider client={client}>
      {children}
    </ApolloProvider>
  );
}

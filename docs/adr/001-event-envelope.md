# ADR-001: Event Envelope Standard

## Status
Accepted

## Context
In a distributed event-driven system, raw events lack crucial metadata needed for:
- Debugging and tracing across services
- Idempotent processing in sinks
- Dead Letter Queue (DLQ) management
- Schema evolution and versioning

## Decision
All events MUST be wrapped in a standardized `EventEnvelope` (defined in `proto/shared/event.v1.proto`) containing:

1. **Identity**: `event_id`, `event_type`, `schema_version`
2. **Routing**: `partition_key`
3. **Timestamps**: `occurred_at`, `published_at`
4. **Tracing**: `trace_id`, `span_id` (OpenTelemetry compatible)
5. **Idempotency**: `idempotency_key` for exactly-once processing
6. **Causation**: `correlation_id`, `causation_id` for event chains

## Consequences

### Positive
- Consistent event structure across all services
- Built-in support for distributed tracing
- Idempotent writes in graph/vector databases
- Easy DLQ routing and replay

### Negative
- Slightly larger message size (~200 bytes overhead)
- All producers must implement envelope wrapping

## Related
- `proto/shared/event.v1.proto`
- `proto/shared/dead_letter.v1.proto`

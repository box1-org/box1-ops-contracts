# Telemetry contract

The Telemetry service runs as `box1-org/asset-service`. It owns sensor readings, threshold alerts and ingestion control.

## Events on `box1.telemetry.events.v1`

| Event | When | Key | `aggregateId` |
|---|---|---|---|
| `equipment.reading.v1` | A reading passed validation and was accepted for publication | `assetId` | `assetId` |
| `equipment.threshold-exceeded.v1` | A threshold alert for one `(assetId, metricName)` became active | `assetId` | `assetId` |

Keying by `assetId` keeps each asset's readings in order within one partition. Threshold events are published from an outbox after their transaction commits, so they follow later readings of the same asset and can be retried after them; order them by `occurredAt`, not by offset. Delivery is at least once.

- `equipment.reading.v1` carries only the six payload fields. Its `eventId` is derived from `(assetId, metricName, measuredAt)`, so a retried or re-sent reading keeps its `eventId`; deduplicating on either gives the same result. When two readings share that key with different values, the first one stored wins. `causationId` names the ingestion source (`ingest:api`, `ingest:load`, `ingest:chaos`), not a previous event.
- `equipment.threshold-exceeded.v1` is written to the service's outbox in the same transaction as the alert, so it may be published more than once after a failure; consumers deduplicate on `alertId` when present, else `eventId`. `causationId` and `sourceEventId` are the `eventId` of the reading that activated the alert, and `traceparent` continues that reading's trace.
- One event per activation. A breaching reading while the alert is already active, escalation from `WARNING` to `CRITICAL`, and clearing are recorded by the service and visible through `GET /api/v1/alerts`, but are not events in v1. A clear event would be an additive v1 event type.

## Validation beyond the schema

The reading schema is the wire contract. The service's ingestion policy is stricter, and a schema-valid reading can still be rejected:

- `metricName` must be one of the service's configured metrics; `unit` must be the unit allowed for that metric.
- `value` must be finite and within the metric's physical bounds.
- `measuredAt` must be no more than 5 minutes in the future and no older than the service's reading retention.

The current lists and bounds are in the service's OpenAPI document and runbook.

## Dead letters

The `asset-service` consumer sends records it cannot process (not JSON, envelope or payload invalid, or rejected by policy) to `box1.telemetry.dlq.v1` unchanged, with reason-code headers only. Valid records are never dead-lettered because of a database outage; they wait. Replay is an operator action described in the service runbook.

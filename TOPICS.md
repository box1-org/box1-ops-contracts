# Owned topics

| Topic | Owner | Event types | Partition key | Retention | Consumer groups |
|---|---|---|---|---:|---|
| `box1.order.events.v1` | Order | `order.placed.v1`, `order.state-changed.v1`, `fulfillment.requested.v1` | `orderId` | 7d | `inventory`, `fulfillment`, `bff-projections`, `notification`, `agentic-operations` |
| `box1.inventory.events.v1` | Inventory | `inventory.reserved.v1`, `inventory.rejected.v1`, `inventory.reservation-expired.v1` | `orderId` | 7d | `order`, `agentic-operations` |
| `box1.fulfillment.events.v1` | Fulfillment adapter | `shipment.confirmed.v1`, `shipment.failed.v1` | `orderId` | 14d | `order`, `notification`, `inventory`, `agentic-operations` |
| `box1.telemetry.events.v1` | Telemetry | `equipment.reading.v1`, `equipment.threshold-exceeded.v1` | `assetId` | 2d | `asset-service`, `telemetry-projections`, `agentic-operations` |
| `box1.notification.events.v1` | Notification | `notification.requested.v1`, `notification.delivered.v1`, `notification.failed.v1` | `orderId` | 14d | `notification-history`, `agentic-operations` |
| `box1.order.dlq.v1` | Order | Records the `order` consumer group could not process, unchanged | original key | 14d | none; operator replay only |
| `box1.inventory.dlq.v1` | Inventory | Records the `inventory` consumer group could not process, unchanged | original key | 14d | none; operator replay only |
| `box1.fulfillment.dlq.v1` | Fulfillment adapter | Records the `fulfillment` consumer group could not process, unchanged | original key | 14d | none; operator replay only |
| `box1.telemetry.dlq.v1` | Telemetry | Records the `asset-service` consumer group could not process, unchanged | original key | 14d | none; operator replay only |
| `box1.notification.dlq.v1` | Notification | Records the `notification` consumer group could not process, unchanged | original key | 7d | `notification-replay` (operator-enabled replay inside the service) |

Every topic needs a bounded retry path and auditable dead-letter/replay procedure. The exact Kafka resource profile remains environment-specific; these are contract-level ownership and retention requirements.

## Read-only consumer groups

`agentic-operations` (box1-docs#20) reads the five `*.events.v1` topics into a bounded in-memory evidence window. It never commits offsets, never produces and never writes to a DLQ. On assignment it seeks each partition to a time (now minus the window age), so its group holds no offsets that other services depend on, and consumer-group lag for it is not meaningful. It renames the earlier reservation `ai-operations`. Each environment uses its own group, for example `agentic-operations` in dev. A second group of this kind must be declared here before it is used.


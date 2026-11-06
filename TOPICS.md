# Owned topics

| Topic | Owner | Event types | Partition key | Retention | Consumer groups |
|---|---|---|---|---:|---|
| `box1.order.events.v1` | Order | `order.placed.v1`, `order.state-changed.v1`, `fulfillment.requested.v1` | `orderId` | 7d | `inventory`, `fulfillment`, `bff-projections` |
| `box1.inventory.events.v1` | Inventory | `inventory.reserved.v1`, `inventory.rejected.v1`, `inventory.reservation-expired.v1` | `orderId` | 7d | `order` |
| `box1.fulfillment.events.v1` | Fulfillment adapter | `shipment.confirmed.v1`, `shipment.failed.v1` | `orderId` | 14d | `order`, `notification`, `inventory` |
| `box1.telemetry.events.v1` | Telemetry | `equipment.reading.v1`, `equipment.threshold-exceeded.v1` | `assetId` | 2d | `telemetry-projections`, `ai-operations` |
| `box1.notification.events.v1` | Notification | `notification.requested.v1`, `notification.delivered.v1`, `notification.failed.v1` | `orderId` | 14d | `notification-history` |
| `box1.order.dlq.v1` | Order | Records the `order` consumer group could not process, unchanged | original key | 14d | none; operator replay only |
| `box1.inventory.dlq.v1` | Inventory | Records the `inventory` consumer group could not process, unchanged | original key | 14d | none; operator replay only |
| `box1.fulfillment.dlq.v1` | Fulfillment adapter | Records the `fulfillment` consumer group could not process, unchanged | original key | 14d | none; operator replay only |

Every topic needs a bounded retry path and auditable dead-letter/replay procedure. The exact Kafka resource profile remains environment-specific; these are contract-level ownership and retention requirements.

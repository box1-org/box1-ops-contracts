# Order state transitions

The Order service owns this table. Other services read order state through events and the API, never through its tables.

| From | Event | Result |
|---|---|---|
| `SUBMITTED` | `inventory.reserved.v1` | `RESERVED`, then `FULFILLMENT_REQUESTED`; `fulfillment.requested.v1` enqueued in the same transaction |
| `SUBMITTED` | `inventory.rejected.v1` | `REJECTED` |
| `SUBMITTED` | `shipment.confirmed.v1` | `EXCEPTION`, reason `SHIPMENT_BEFORE_RESERVATION` |
| `FULFILLMENT_REQUESTED` | `shipment.confirmed.v1` | `SHIPPED`, then `COMPLETED` if the completion policy allows |
| `FULFILLMENT_REQUESTED` | `shipment.failed.v1`, `retryable=false` | `EXCEPTION`, reason `SHIPMENT_FAILED` |
| `FULFILLMENT_REQUESTED` | `shipment.failed.v1`, `retryable=true` | No state change; timeline note |
| `FULFILLMENT_REQUESTED` | `inventory.reservation-expired.v1` | `EXCEPTION`, reason `RESERVATION_EXPIRED` |
| Any other pair | Any lifecycle event | No state change; timeline note |

- `REJECTED`, `COMPLETED`, `CANCELLED` and `EXCEPTION` accept no event-driven transition.
- `EXCEPTION` means manual reconciliation is required.
- `CANCELLED` is legal only from `SUBMITTED`. No v1 endpoint performs it.
- Redelivery of the same `eventId` has no effect. Consumers must also treat events for unknown orders as poison, not as success.
- Display `FULFILLMENT_REQUESTED` as "Awaiting ERP acknowledgement".

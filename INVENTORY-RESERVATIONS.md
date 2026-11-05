# Inventory reservations

The Inventory service owns this contract. Other services read it through events and the API, never through its tables.

Available equals on hand minus the sum of `ACTIVE` and `COMMITTED` holds, and can never be negative.

| From | Trigger | Result |
|---|---|---|
| none | `order.placed.v1`, stock available | `ACTIVE`; `inventory.reserved.v1` published |
| none | `order.placed.v1`, not available | No hold; `inventory.rejected.v1` published |
| `ACTIVE` | `fulfillment.requested.v1` with this reservation | `COMMITTED`, which no longer expires |
| `ACTIVE` | TTL elapsed | `EXPIRED`; `inventory.reservation-expired.v1` published; hold returned |
| `ACTIVE` | `order.state-changed.v1` to `CANCELLED` | `RELEASED`; hold returned |
| `ACTIVE`, `COMMITTED` | `shipment.confirmed.v1` | `CONSUMED`; on hand and hold both reduced |
| `ACTIVE`, `COMMITTED` | Authenticated operator release | `RELEASED`; hold returned |

`CONSUMED`, `EXPIRED` and `RELEASED` are terminal. An `order.placed.v1` yields exactly one outcome for an `orderId`, including under a new `eventId` or after stock changes.

Anything else, such as a shipment for an expired hold, changes no reservation and opens a reconciliation record in the Inventory service. Stock is never released as a result of a confirmed shipment.

## Rejection reason codes

| `reasonCode` | Meaning |
|---|---|
| `SITE_UNAVAILABLE` | The site is unknown, or marked unavailable |
| `UNKNOWN_SKU` | The site has no stock row for this SKU |
| `INSUFFICIENT_STOCK` | Available is below the requested quantity |

Checks run in that order. Consumers must treat an unrecognized code as a rejection. Adding a code is an additive change.

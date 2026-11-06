# Notification events

The notification service turns order and shipment facts into notices for named operator channels. It publishes the outcome of each notice to `box1.notification.events.v1`, keyed by `orderId`.

**No customer data.** Recipients are operator channels such as `ops-fulfillment` and `ops-orders`, never people. Notices, receipts and these events carry no customer identifier, contact data or free text. `customerId` from `order.placed.v1` is never read.

## Events

| Event | When | Schema |
|---|---|---|
| `notification.delivered.v1` | The provider accepted the notice | [`notification.delivered.schema.json`](events/v1/notification.delivered.schema.json) |
| `notification.failed.v1` | The provider rejected it permanently, or retries were exhausted | [`notification.failed.schema.json`](events/v1/notification.failed.schema.json) |
| `notification.requested.v1` | Reserved; no producer yet, no schema | — |

Each notice produces at most one of the two events. Delivery is at least once: deduplicate by `eventId`. The envelope's `causationId` is the `eventId` that created the notice, and `correlationId` is carried over from it.

## Notice types

| `noticeType` | Raised by |
|---|---|
| `ORDER_SHIPPED` | `order.state-changed.v1` to `SHIPPED`, or `shipment.confirmed.v1`. One notice per order whichever arrives first. |
| `SHIPMENT_DELAYED` | `shipment.failed.v1` with `retryable=true`, which changes no order state. One notice per order, fulfillment request and reason code. |
| `SHIPMENT_FAILED` | `shipment.failed.v1` with `retryable=false`, or `order.state-changed.v1` to `EXCEPTION` with `reasonCode=SHIPMENT_FAILED`. One notice per order. |
| `ORDER_EXCEPTION` | `order.state-changed.v1` to `EXCEPTION` with any other reason. One notice per order. |
| `ORDER_REJECTED` | `order.state-changed.v1` to `REJECTED`. One notice per order. |

`templateVersion` names the wording, as `{noticeType}@v{n}`.

## Failure fields

`failureCategory` is `PERMANENT_REJECTION` (a 4xx other than 408 or 429, never retried) or `RETRIES_EXHAUSTED`. `failureCode` is one of `PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_REJECTED` or `PROVIDER_ERROR`. `httpStatus` is the last provider status, or `null` for a timeout or connection error. Provider response text is never carried.

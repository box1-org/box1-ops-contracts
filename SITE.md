# Edge site contract

Edge sites are RHEL image mode VMs that run the `box1-org/site-gateway` applications (box1-docs#126). Each site
maps to a fixture site: `site-west` is `site_ds9` and `site-east` is `site_spacedock`. A site produces readings and
site events, keeps them in a local outbox while it is disconnected, and reports its status to asset-service.

## Readings

A site's readings are ordinary `equipment.reading.v1` events on `box1.telemetry.events.v1`, keyed by `assetId`, as
[TELEMETRY.md](TELEMETRY.md) states. The site derives `eventId` from the natural key exactly as asset-service does, so
a reading that is re-sent after a reconnection keeps its `eventId`. `causationId` is `ingest:site`, `occurredAt` is
when the site accepted the reading, and `traceparent` continues the trace the site started.

## Site events on `box1.site.events.v1`

| Event | When | Key | `aggregateId` | `correlationId` | `causationId` |
|---|---|---|---|---|---|
| `site.pick-confirmed.v1` | An operator confirmed that one reservation's units were picked | `siteId` | `siteId` | `orderId` | `eventId` of the `inventory.reserved.v1` that put the item on the site's pick list |
| `site.stock-adjusted.v1` | An operator recorded a cycle count of one SKU | `siteId` | `siteId` | `countId` | `site-ops:count` |
| `site.stock-held.v1` | An operator placed or released a hold on units of one SKU | `siteId` | `siteId` | `holdId` | `site-ops:hold` |

- `eventId` is a random UUID generated when the operator's action is recorded at the site, in the same local
  transaction. Redelivery, a replayed outbox and a restarted publisher keep it. `pickId`, `countId` and `holdId` are
  the site-local identities of the action; a consumer treats a second event with the same identity as a duplicate.
- `occurredAt` is when the site recorded the action. `pickedAt`, `countedAt` and `changedAt` are when it happened at
  the site, by the site's clock. A site that was offline publishes these events later, with their original times.
- Every record carries the header `box1-site-id` with the producing site's `siteId`. Until per-site Kafka identity
  exists (box1-docs#71, #131) the header is informational: it is set by the producer and is not proof of identity.
- Delivery is at least once and ordered per site. Consumers deduplicate on `eventId` and on the site-local identity.

## Effect in inventory-service

The Inventory service consumes `box1.site.events.v1` with consumer group `inventory-site`. Site events never create,
release or consume a reservation, and never change the order → ERP → ship flow (box1-docs#129; gating orders on a
site pick is the future enhancement box1-docs#134). Every decision below is recorded where an operator can see it.

### `site.pick-confirmed.v1`

A pick records that the reserved units physically left their location. It does **not** change `on_hand` or
`reserved`: `shipment.confirmed.v1` already reduces both, and changing them here would remove the same units twice.

| Reservation `reservationId` | Outcome |
|---|---|
| `ACTIVE` or `COMMITTED`, with the same `orderId`, `siteId`, `sku` and `quantity` | Recorded as picked |
| `CONSUMED` with the same `orderId`, `siteId`, `sku` and `quantity` (the shipment was confirmed first) | Recorded as picked after shipment |
| `EXPIRED` or `RELEASED` | Recorded; reconciliation item `PICK_NOT_HELD` |
| Unknown, or any of `orderId`, `siteId`, `sku`, `quantity` differs | Recorded; reconciliation item `PICK_MISMATCH` |

### `site.stock-adjusted.v1` (cycle count)

A count `C` of `sku` at `siteId`, taken at `countedAt` `T`, states how many units were physically at the site at `T`,
including units picked but not yet shipped. The service applies it as follows:

1. If the site has no stock row for the SKU, nothing changes and reconciliation item `COUNT_UNKNOWN_STOCK` is opened.
2. If a count for the same site and SKU with a later `countedAt` has already been applied (on a tie, the greater
   `countId`), nothing changes; the count is recorded as superseded. So the outcome does not depend on the order in
   which counts arrive: the latest count wins.
3. Otherwise the expected stock now is `E = C + D`, where `D` is the sum of the site and SKU's stock movements whose
   business time is after `T` (shipments by `shippedAt`, restocks by their time), excluding counts.
4. `on_hand` becomes `max(E, reserved, 0)`, recorded as a `COUNT` stock movement with the delta, which may be zero.
5. If `E < reserved` (or `E < 0`), `on_hand` is held at the limit and reconciliation item `COUNT_CONFLICT` is opened
   with `E`, `reserved` and the shortfall. Reservations are never cancelled by a count; an operator resolves the item.

### `site.stock-held.v1`

A hold is recorded centrally by `holdId`, with its quantity, reason, and placed and released times. In v1 it changes
neither `on_hand` nor available stock: the site uses it to keep units off its own pick work. A `RELEASED` event for a
hold that was never placed is recorded with reconciliation item `HOLD_UNKNOWN`. Making holds reduce available stock
is a future change.

### Errors

A record that is not JSON, or whose envelope or payload does not validate, goes to `box1.site.dlq.v1` unchanged, with
reason-code headers. A valid event is never dead-lettered because of a database outage; it waits. Replay is an
operator action in the Inventory service runbook.

## Pick lists sent to a site

A site keeps its own pick list from these topics, with consumer group `site-gateway-<siteId>` (for example
`site-gateway-site_ds9`):

| Topic | Event | Effect on the site's pick list |
|---|---|---|
| `box1.inventory.events.v1` | `inventory.reserved.v1` whose `siteId` is the site's | Adds the reservation as an open item |
| `box1.inventory.events.v1` | `inventory.reservation-expired.v1` | Closes the item for that `orderId`, if it is not picked |
| `box1.fulfillment.events.v1` | `shipment.confirmed.v1` | Closes the item for that `orderId` |

Records for other sites and other event types are ignored. A closing event that arrives before its reservation is
remembered, so the reservation stays closed. An operator release in the Inventory service publishes no event in v1,
so a released reservation stays on the pick list until it expires or ships; picking it opens `PICK_NOT_HELD`.

## Site status

Each site reports its status to asset-service with `PUT /api/v1/sites/{siteId}/status`
([openapi/asset-service.yaml](openapi/asset-service.yaml)) about every 15 seconds, using its own Keycloak client
(`site-west`, `site-east`) with client role `site-reporter` on `asset-service` and a `siteId` claim. asset-service
accepts a write only when the claim equals the path `siteId`. A failed heartbeat is not buffered; the next one
replaces it.

asset-service derives the state at read time:

| State | Condition (defaults; configurable in asset-service) |
|---|---|
| `OFFLINE` | No status received for more than 90 seconds, or never |
| `DEGRADED` | Online, and buffer depth at least 200, or the oldest buffered event older than 5 minutes, or greenboot `RED` |
| `ONLINE` | Otherwise |

## Buffer

The site outbox is bounded ([box1-org/site-gateway](https://github.com/box1-org/site-gateway) states the limits).
When it is full, the oldest unpublished readings are dropped and counted; site events are never dropped, and the site
refuses new operator actions until there is room. Readings older than asset-service's reading retention are rejected
by asset-service, so the readings buffer age limit is shorter than that retention.

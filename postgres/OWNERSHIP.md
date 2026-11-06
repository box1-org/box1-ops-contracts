# PostgreSQL ownership and isolation

Each service owns its own PostgreSQL database and login. Services never share tables, schemas, credentials, or SQL joins. Cross-service views are built from versioned events and API projections.

| Service | Database | Login | Authoritative data |
|---|---|---|---|
| Order | `box1_order` | `box1_order_app` | orders, state history, idempotency, outbox, processed events |
| Inventory | `box1_inventory` | `box1_inventory_app` | stock, reservations, reservation expiry, processed events |
| Fulfillment adapter | `box1_fulfillment` | `box1_fulfillment_app` | requests, attempts, ERP receipts, dedupe records |
| Notification | `box1_notification` | `box1_notification_app` | notification intents, delivery attempts, receipts |
| Telemetry | `box1_telemetry` | `box1_telemetry_app` | readings, thresholds, ingestion offsets |

Golden Path onboarding generates the database and login from the service name. For a service onboarded that way, the generated names replace the names above and the isolation rules still apply. The Order service runs as `box1-org/order-service` with database `order_service` and login `order_service`. The Inventory service runs as `box1-org/inventory-service` with database `inventory_service` and login `inventory_service`. The Fulfillment adapter runs as `box1-org/fulfillment-adapter` with database `fulfillment_adapter` and login `fulfillment_adapter`. The Telemetry service runs as `box1-org/asset-service` with database `asset_service` and login `asset_service`.

The application login receives only the privileges needed by its Flyway migrations and runtime queries in its own database/schema. A separate migration owner is used when the deployment supports it; the runtime login must not own the schema or have database-wide administrative privileges.

Isolation acceptance requires a negative test: the order login cannot connect to or read the inventory schema, and the inventory login cannot connect to or read the order schema. A successful connection alone is insufficient evidence.

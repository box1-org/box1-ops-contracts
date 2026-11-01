CREATE TABLE orders (
    order_id text PRIMARY KEY,
    customer_id text NOT NULL,
    sku text NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    site_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('SUBMITTED','RESERVED','FULFILLMENT_REQUESTED','SHIPPED','COMPLETED','REJECTED','EXCEPTION','CANCELLED')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE outbox (
    event_id uuid PRIMARY KEY,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    published_at timestamptz NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE processed_event (
    event_id uuid PRIMARY KEY,
    processed_at timestamptz NOT NULL
);

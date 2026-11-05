CREATE TABLE inventory_stock (
    site_id text NOT NULL,
    sku text NOT NULL,
    on_hand integer NOT NULL CHECK (on_hand >= 0),
    reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (site_id, sku),
    CHECK (on_hand >= reserved)
);

CREATE TABLE reservations (
    reservation_id text PRIMARY KEY,
    order_id text NOT NULL UNIQUE,
    site_id text NOT NULL,
    sku text NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    status text NOT NULL CHECK (status IN ('ACTIVE','COMMITTED','CONSUMED','EXPIRED','RELEASED')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE processed_event (
    event_id uuid PRIMARY KEY,
    processed_at timestamptz NOT NULL
);

CREATE TABLE outbox (
    event_id uuid PRIMARY KEY,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    published_at timestamptz NULL
);

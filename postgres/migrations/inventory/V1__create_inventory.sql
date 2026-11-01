CREATE TABLE stock (
    site_id text NOT NULL,
    sku text NOT NULL,
    available_quantity integer NOT NULL CHECK (available_quantity >= 0),
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (site_id, sku)
);

CREATE TABLE reservations (
    reservation_id text PRIMARY KEY,
    order_id text NOT NULL,
    site_id text NOT NULL,
    sku text NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    state text NOT NULL CHECK (state IN ('ACTIVE','EXPIRED','RELEASED')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE processed_event (
    event_id uuid PRIMARY KEY,
    processed_at timestamptz NOT NULL
);

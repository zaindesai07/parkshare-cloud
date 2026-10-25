
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'driver'
        CHECK (role IN ('driver', 'owner', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parking_spaces (
    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL REFERENCES users(id),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    hourly_price NUMERIC(10,2) NOT NULL
        CHECK (hourly_price >= 0),
    image_key TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
    id BIGSERIAL PRIMARY KEY,
    parking_space_id BIGINT NOT NULL
        REFERENCES parking_spaces(id),
    driver_id BIGINT NOT NULL REFERENCES users(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    total_price NUMERIC(10,2) NOT NULL
        CHECK (total_price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_spaces_active
    ON parking_spaces(is_active);

CREATE INDEX IF NOT EXISTS idx_spaces_owner
    ON parking_spaces(owner_id);

CREATE INDEX IF NOT EXISTS idx_bookings_driver
    ON bookings(driver_id);

CREATE INDEX IF NOT EXISTS idx_bookings_space_time
    ON bookings(parking_space_id, start_time, end_time);

CREATE TABLE IF NOT EXISTS rsu_grants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    stock_ticker VARCHAR(50) NOT NULL,
    stock_currency VARCHAR(3) NOT NULL,
    grant_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsu_vesting_periods (
    id SERIAL PRIMARY KEY,
    rsu_grant_id INTEGER NOT NULL REFERENCES rsu_grants(id),
    vest_date DATE NOT NULL,
    granted_quantity NUMERIC(18, 8) NOT NULL,
    price_at_vesting NUMERIC(12, 5),
    status VARCHAR(10) NOT NULL DEFAULT 'unvested' CHECK (status IN ('unvested', 'vested')),
    shares_withheld NUMERIC(18, 8),
    shares_left NUMERIC(18, 8),
    shares_available NUMERIC(18, 8),
    taxes_paid NUMERIC(12, 2),
    refunded_from_taxes NUMERIC(12, 2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

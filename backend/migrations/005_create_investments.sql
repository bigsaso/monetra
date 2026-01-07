CREATE TABLE IF NOT EXISTS investments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(50),
    asset_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    investment_id INTEGER NOT NULL REFERENCES investments(id),
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    quantity NUMERIC(18, 8) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    type VARCHAR(10) NOT NULL,
    date DATE NOT NULL
);

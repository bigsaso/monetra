CREATE TABLE IF NOT EXISTS espp_periods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    stock_ticker VARCHAR(50) NOT NULL,
    stock_currency VARCHAR(3) NOT NULL,
    start_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS espp_deposits (
    id SERIAL PRIMARY KEY,
    espp_period_id INTEGER NOT NULL REFERENCES espp_periods(id),
    date DATE NOT NULL,
    amount_home_currency NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS espp_closure (
    espp_period_id INTEGER PRIMARY KEY REFERENCES espp_periods(id),
    open_fmv NUMERIC(12, 5),
    close_fmv NUMERIC(12, 5),
    exchange_rate NUMERIC(12, 6),
    min_fmv NUMERIC(12, 5),
    purchase_price NUMERIC(12, 5),
    total_invested_home NUMERIC(12, 2),
    total_invested_stock_currency NUMERIC(12, 2),
    shares_purchased NUMERIC(18, 8),
    shares_withheld NUMERIC(18, 8),
    shares_left NUMERIC(18, 8),
    taxes_paid NUMERIC(12, 2),
    paid_with_shares NUMERIC(18, 8),
    refunded_from_taxes NUMERIC(12, 2),
    unused_for_shares NUMERIC(12, 2),
    total_refunded NUMERIC(12, 2),
    closed_at TIMESTAMP
);

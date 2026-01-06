CREATE TABLE IF NOT EXISTS pay_schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount NUMERIC(12, 2) NOT NULL,
    frequency VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

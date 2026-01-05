CREATE TABLE IF NOT EXISTS budget_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    rule_type VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category VARCHAR(255),
    account_id INTEGER REFERENCES accounts(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

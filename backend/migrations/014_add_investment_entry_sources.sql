ALTER TABLE investment_entries
    ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'regular',
    ADD COLUMN IF NOT EXISTS espp_period_id INTEGER REFERENCES espp_periods(id);

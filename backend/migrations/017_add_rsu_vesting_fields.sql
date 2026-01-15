ALTER TABLE rsu_vesting_periods
    ADD COLUMN IF NOT EXISTS value_at_vesting NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS taxes_to_pay NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS taxes_paid_with_shares NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS investment_entry_id INTEGER REFERENCES investment_entries(id);

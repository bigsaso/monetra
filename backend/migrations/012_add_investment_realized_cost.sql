ALTER TABLE investment_entries
    ADD COLUMN IF NOT EXISTS cost_of_sold_shares NUMERIC(12, 2);

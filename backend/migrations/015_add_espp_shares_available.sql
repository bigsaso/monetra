ALTER TABLE espp_closure
    ADD COLUMN IF NOT EXISTS shares_available NUMERIC(18, 8);

UPDATE espp_closure
SET shares_available = shares_left
WHERE shares_available IS NULL;

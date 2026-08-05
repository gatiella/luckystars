-- Add optional cost_amount to pending_rounds so server can store variable-cost rounds
ALTER TABLE pending_rounds
  ADD COLUMN IF NOT EXISTS cost_amount BIGINT;

-- Backfill nothing needed; new column is nullable by design.

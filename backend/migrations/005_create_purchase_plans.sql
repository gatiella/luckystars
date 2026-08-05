-- Table for configurable purchase plans shown in the TopUp UI
CREATE TABLE IF NOT EXISTS purchase_plans (
  id          BIGSERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  stars       BIGINT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default plans (if not present)
INSERT INTO purchase_plans (label, stars, amount_cents, currency)
SELECT '50 Stars', 50, 100, 'USD'
WHERE NOT EXISTS (SELECT 1 FROM purchase_plans WHERE stars = 50);
INSERT INTO purchase_plans (label, stars, amount_cents, currency)
SELECT '150 Stars', 150, 250, 'USD'
WHERE NOT EXISTS (SELECT 1 FROM purchase_plans WHERE stars = 150);
INSERT INTO purchase_plans (label, stars, amount_cents, currency)
SELECT '500 Stars', 500, 700, 'USD'
WHERE NOT EXISTS (SELECT 1 FROM purchase_plans WHERE stars = 500);

-- Purchases table to record star purchases via Telegram Payments
CREATE TABLE IF NOT EXISTS purchases (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  stars       BIGINT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  provider_payload TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  telegram_chat_id BIGINT,
  telegram_message_id INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at     TIMESTAMPTZ
);

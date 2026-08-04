-- LuckyStars schema. Run with: psql "$DATABASE_URL" -f 001_init.sql
-- Written as raw SQL deliberately — Prisma CLI binaries don't run on armv7l.

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  tg_id           BIGINT UNIQUE NOT NULL,
  username        TEXT,
  first_name      TEXT,
  points_balance  BIGINT NOT NULL DEFAULT 0,      -- free-earned currency (spins/box currency)
  stars_balance   BIGINT NOT NULL DEFAULT 0,      -- premium currency bought with Telegram Stars
  usdt_balance    NUMERIC(18,6) NOT NULL DEFAULT 0, -- withdrawable real balance
  free_spins      INT NOT NULL DEFAULT 1,
  daily_spin_at   TIMESTAMPTZ,                    -- last time daily free spin was claimed
  vip_tier        SMALLINT NOT NULL DEFAULT 0,    -- 0 Bronze..4 Diamond (cosmetic/odds only, never gates withdrawal)
  referred_by     BIGINT REFERENCES users(id),
  device_hash     TEXT,                            -- fingerprint for anti-fraud
  last_ip         INET,
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,  -- phone-verified, unlocks nothing except anti-abuse trust score
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users(tg_id);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

CREATE TABLE IF NOT EXISTS ad_views (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  network     TEXT NOT NULL DEFAULT 'adsgram',
  reward_type TEXT NOT NULL,          -- 'spin' | 'points'
  ip          INET,
  device_hash TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- cap ad-earned rewards per day per user (anti-abuse)
CREATE INDEX IF NOT EXISTS idx_ad_views_user_day ON ad_views(user_id, created_at);

CREATE TABLE IF NOT EXISTS referrals (
  id            BIGSERIAL PRIMARY KEY,
  referrer_id   BIGINT NOT NULL REFERENCES users(id),
  referee_id    BIGINT NOT NULL REFERENCES users(id) UNIQUE,
  reward_spins  INT NOT NULL DEFAULT 1,
  flagged       BOOLEAN NOT NULL DEFAULT FALSE,   -- set true by anti-fraud checks, excluded from milestone counts
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

CREATE TABLE IF NOT EXISTS spins (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  wheel_tier  TEXT NOT NULL DEFAULT 'standard',   -- 'standard' | 'premium'
  prize_type  TEXT NOT NULL,                      -- 'usdt' | 'points' | 'stars' | 'nothing'
  prize_value NUMERIC(18,6) NOT NULL DEFAULT 0,
  server_seed TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce       BIGINT NOT NULL,
  result_hash TEXT NOT NULL,                      -- sha256(server_seed:client_seed:nonce) shown to user for verification
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS box_opens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  box_tier    TEXT NOT NULL DEFAULT 'standard',   -- 'standard' | 'premium'
  cost_type   TEXT NOT NULL,                      -- 'points' | 'stars'
  cost_amount BIGINT NOT NULL,
  prize_type  TEXT NOT NULL,
  prize_value NUMERIC(18,6) NOT NULL DEFAULT 0,
  server_seed TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce       BIGINT NOT NULL,
  result_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  amount_usdt  NUMERIC(18,6) NOT NULL CHECK (amount_usdt >= 10),  -- flat $10 minimum, enforced in DB too
  wallet       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending -> processing -> paid | rejected
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tasks (
  id           BIGSERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  type         TEXT NOT NULL,        -- 'join_channel' | 'follow_x' | 'custom'
  target_url   TEXT,
  reward_spins INT NOT NULL DEFAULT 1,
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS task_completions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  task_id     BIGINT NOT NULL REFERENCES tasks(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, task_id)
);

-- Server-held round state for provably-fair spins/boxes.
-- The server_seed NEVER leaves this table until after the round is resolved —
-- the client only ever sees hash(server_seed) beforehand, so no one holding
-- only the client-side code (or reading network traffic pre-round) can predict
-- or influence an outcome. Rows are one-time-use: resolving a round deletes it,
-- so a captured request can't be replayed to re-roll or re-claim the same round.
CREATE TABLE IF NOT EXISTS pending_rounds (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,            -- 'spin' | 'box'
  tier        TEXT NOT NULL,
  server_seed TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce       BIGINT NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_pending_rounds_lookup ON pending_rounds(user_id, nonce, used);
CREATE INDEX IF NOT EXISTS idx_pending_rounds_expiry ON pending_rounds(expires_at);

-- Weekly leaderboard is computed from referrals; materialized view refreshed by a cron job
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_referral_leaderboard AS
SELECT referrer_id AS user_id, COUNT(*) AS invite_count
FROM referrals
WHERE flagged = FALSE AND created_at >= date_trunc('week', now())
GROUP BY referrer_id
ORDER BY invite_count DESC;

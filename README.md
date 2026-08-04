# LuckyStars — Spin Wheel + Lucky Box Telegram Mini App

Free-to-play: users earn spins via daily check-in, rewarded ads (Adsgram), tasks, and referrals.
No deposit is required to earn or withdraw. Optional Telegram Stars purchase unlocks a
better-odds "premium" wheel/box tier, but it's a bonus, not a gate.

**Withdrawal:** flat $10 USDT minimum. No wagering multiplier, no level-gating, no cooldown
gimmicks — what's in the balance is withdrawable once it clears $10.

## Stack
- Backend: Node.js (Express) + Telegraf (bot) + raw `pg` (no ORM — Prisma CLI binaries don't
  run on armv7l, so migrations are plain SQL you run with `psql`)
- Frontend: React + Vite, Telegram WebApp SDK, gold/purple theme (`src/theme.css`)
- DB: Postgres

## One-command run

```bash
npm run install:all   # installs root + backend + frontend deps
cp backend/.env.example backend/.env   # fill in DATABASE_URL + BOT_TOKEN
npm run migrate       # applies backend/migrations/001_init.sql via psql
npm run dev           # runs backend (:3001) + frontend (:5173) together
```

`npm run dev` uses `concurrently` to run both processes with labeled, colored output.

## Provably-fair spins & boxes
`backend/src/lib/fairness.js` implements the standard seed/hash scheme: a server seed hash is
shown before the round, the round is resolved via HMAC-SHA256(server_seed, client_seed:nonce),
and the server seed is revealed afterward so results can be independently recomputed. This is a
real trust feature, not cosmetic — worth highlighting in the UI/marketing copy.

## ⚠️ One thing still to build before real money moves through this at scale

**Payout automation** — the withdrawal route records a `pending` row and the admin panel lets you
approve/reject it, but approving only flips status to `processing`; it doesn't move funds. You'll
want a TON payout script (reusing the batched-SQL approach from RiftCoin) wired into
`admin.js`'s approve route, plus a real balance-vs-liability check so the ad/referral economy
can't out-earn what's coming in from Stars purchases and ad revenue — `/api/admin/stats` gives you
the raw numbers (`outstanding_usdt_liability`) to model that against expected ad eCPM × daily
active users before this goes live for a paying client.

## Deploying to Render (free tier) + Supabase

**Supabase** — new project, use the *pooler* connection string (port 6543, not 5432 — plays
nicer with Render's connection limits), then:
```bash
psql "postgresql://postgres.xxxx:[password]@aws-...pooler.supabase.com:6543/postgres" -f backend/migrations/001_init.sql
psql "postgresql://postgres.xxxx:[password]@aws-...pooler.supabase.com:6543/postgres" -f backend/migrations/002_seed_tasks.sql
```

**Render backend** — Web Service, root directory `backend`, build `npm install`, start `npm start`.
Env vars: `DATABASE_URL` (Supabase pooler string), `PGSSL=true`, `BOT_TOKEN`, `ADMIN_SECRET`
(`openssl rand -hex 32`), `ALLOWED_ORIGIN` / `WEBAPP_URL` (your frontend's Render URL, set after
the next step), plus the webhook vars below.

**Render frontend** — Static Site, root directory `frontend`, build `npm install && npm run build`,
publish dir `dist`. Env var `VITE_ADSGRAM_BLOCK_ID`. Add a rewrite rule `/*` → `/index.html` for
client-side routing, and a redirect/rewrite `/api/*` → your backend's Render URL (Vite's dev proxy
in `vite.config.js` only applies locally).

### Free tier and the Telegram bot: use webhook mode, not polling

Render's free tier spins the service down after ~15 minutes idle. Long polling (the default,
`bot.launch()`) requires an always-running process reaching out to Telegram — it simply doesn't run
while the dyno is asleep, so the bot goes silent until something else happens to wake it. Webhook
mode fixes this because Telegram's own delivery request is what wakes the dyno, the same as any
other incoming HTTP request would.

Set these on the **backend** service in Render:
```
BOT_MODE=webhook
BACKEND_URL=https://your-backend.onrender.com
WEBHOOK_SECRET=<openssl rand -hex 24>
```
On boot the server registers `/telegraf/<WEBHOOK_SECRET>` and calls Telegram's `setWebhook` for you
— nothing to configure in @BotFather. Every request to that path is checked against Telegram's
`secret_token` header, so only genuine Telegram traffic is accepted (verified in testing: wrong
token → `404`, correct token → `200`, and the bot's own info (`getMe()`) is pre-seeded so the very
first webhook delivery never blocks on a network round-trip).

Leave `BOT_MODE` unset (defaults to `polling`) for local dev or if you later move to a paid Render
instance that doesn't sleep — polling still works fine there, and switching modes on redeploy is
just an env var change.



## Security & correctness — what's been verified

This has been tested end-to-end against a real Postgres instance (not just read for correctness):
run `cd backend && node test-e2e.mjs` against a running server to reproduce. 24 checks currently pass,
covering: Telegram signature verification (valid/tampered/missing), zero-deposit earning, replay
protection on spin/box rounds, wallet/amount validation on withdrawals, admin-secret gating, and
that the server survives a DB error instead of crashing (see below).

**Bugs found and fixed while testing (not present in the version you'd get without this pass):**
1. **Every async route handler could crash the whole process.** Express 4 doesn't catch rejected
   promises from `async` handlers — a single DB hiccup on any request became an unhandled
   rejection and killed the entire server for every user. Fixed with `lib/asyncHandler.js`
   wrapping every route, plus a `bot.js` fix (a failed Telegram bot launch no longer takes the API
   down with it) and a process-level safety net as a last resort.
2. **`nonce` overflowed a 32-bit `INT` column.** Nonces are timestamp-based (~16 digits) but
   `spins.nonce`/`box_opens.nonce` were declared `INT`. Every real spin/box resolution failed.
   Fixed by widening both to `BIGINT` in the migration.
3. **The provably-fair seed was round-tripping through the client**, which would have let someone
   inspect network traffic and predict their own outcome. Fixed: `/spin/prepare` and `/box/prepare`
   now generate the seed with `crypto.randomBytes` and store it server-side in a new
   `pending_rounds` table; the client only ever sees `hash(server_seed)` beforehand and the raw
   seed after the round is already locked in and paid out. Rounds are one-time-use (row is marked
   `used` before payout), so a captured request can't be replayed to re-roll or double-claim.
4. **No rate limiting, no CSP/security headers, no wallet-format validation, no admin auth.**
   Added `helmet`, `express-rate-limit` (tighter limits on spin/box/withdraw specifically), a TON
   address regex on withdrawals, and a shared-secret-gated `/api/admin/*` surface + `/admin` panel.

## True unpredictability, in plain terms
Even someone with the full source code can't predict a spin's outcome ahead of time, because the
actual randomness (`crypto.randomBytes(32)`, a fresh value every round) is generated on the server
and never leaves it until after the round is already resolved and paid out. Reading the code tells
you *how* the outcome will be computed, not *what* the random seed will be — same principle as
knowing exactly how a coin flip works without being able to call it in advance.

## Admin panel
A minimal panel is served at `/admin` (e.g. `http://localhost:3001/admin` in dev). It prompts for
`ADMIN_SECRET` on first load and stores it in `localStorage`. Covers: approve/reject withdrawals
(rejecting auto-refunds the user), review/clear flagged referrals, add/enable/disable tasks, and a
quick stats snapshot (total users, outstanding USDT liability, pending withdrawal total). For a
client this sensitive, put `/admin` behind an IP allowlist or VPN at the reverse-proxy layer too —
the shared-secret header alone is a reasonable MVP gate, not a full auth system.

`backend/src/lib/antifraud.js` flags (not silently blocks) referrals sharing a device
fingerprint or IP with the referrer, or bursts of same-device signups. Flagged referrals don't
count toward milestones or rewards but remain visible for manual review — extend this with a
proper fingerprinting library (e.g. FingerprintJS) before scaling.

## Structure
```
backend/
  migrations/001_init.sql   raw SQL schema
  src/
    server.js               Express app
    bot.js                  Telegraf bot (deep-link referrals, /invite, push notify helper)
    db.js                   pg pool
    middleware/auth.js      Telegram initData signature verification
    lib/fairness.js         provably-fair seed/hash engine
    lib/antifraud.js        referral abuse checks
    routes/                 spin, box, referral, earn (ads/daily/tasks), withdraw
frontend/
  src/
    theme.css               gold/purple casino theme
    pages/                  Wheel, Box, Referral, Withdraw, Leaderboard
    components/             Nav, Header
    api.js                  fetch wrapper, sends Telegram initData + device hash
```

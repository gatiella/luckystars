import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  generateServerSeed,
  hashServerSeed,
  generateClientSeed,
  resolvePrize,
  resultHash,
} from "../lib/fairness.js";

const router = Router();

const ROUND_TTL_MS = 2 * 60 * 1000; // pending round expires after 2 minutes if unclaimed

// Standard (free) wheel — modest prizes, funded by ad revenue
const STANDARD_TABLE = [
  { key: "usdt_0.05", weight: 8, type: "usdt", value: 0.05 },
  { key: "usdt_0.1", weight: 3, type: "usdt", value: 0.1 },
  { key: "points_50", weight: 30, type: "points", value: 50 },
  { key: "points_20", weight: 34, type: "points", value: 20 },
  { key: "stars_1", weight: 10, type: "stars", value: 1 },
  { key: "spin_1", weight: 15, type: "free_spin", value: 1 },
  { key: "nothing", weight: 10, type: "nothing", value: 0 },
];

// Premium wheel — unlocked with Telegram Stars, better odds/prizes
const PREMIUM_TABLE = [
  { key: "usdt_0.5", weight: 10, type: "usdt", value: 0.5 },
  { key: "usdt_1", weight: 5, type: "usdt", value: 1 },
  { key: "usdt_0.2", weight: 20, type: "usdt", value: 0.2 },
  { key: "points_200", weight: 25, type: "points", value: 200 },
  { key: "stars_5", weight: 10, type: "stars", value: 5 },
  { key: "spin_1", weight: 25, type: "free_spin", value: 1 },
  { key: "nothing", weight: 15, type: "nothing", value: 0 },
];

/**
 * GET /api/spin/prepare?tier=standard
 * Server generates and STORES the server_seed (never sent to the client).
 * The client only receives hash(server_seed) + client_seed + nonce.
 * This is what makes the outcome unpredictable even to someone reading the
 * frontend/backend source: the actual random seed is generated fresh per
 * round with crypto.randomBytes and held server-side until resolution.
 */
router.get("/prepare", asyncHandler(async (req, res) => {
  const user = req.user;
  const qTier = req.query.tier;
  let tier = qTier === "premium" ? "premium" : qTier === "stars" ? "stars" : "standard";
  const cost = tier === "stars" ? Number(req.query.cost ?? req.query.cost_stars ?? 0) : null;

  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  const nonce = Date.now() * 1000 + Math.floor(Math.random() * 1000); // unique per round

  await query(
    `INSERT INTO pending_rounds (user_id, kind, tier, server_seed, client_seed, nonce, expires_at, cost_amount)
     VALUES ($1, 'spin', $2, $3, $4, $5, now() + interval '2 minutes', $6)`,
    [user.id, tier, serverSeed, clientSeed, nonce, cost]
  );

  res.json({
    server_seed_hash: hashServerSeed(serverSeed),
    client_seed: clientSeed,
    nonce,
    tier,
    expires_in_ms: ROUND_TTL_MS,
  });
}));

// POST /api/spin  { nonce }  — resolves whichever round /prepare created for this nonce
router.post("/", asyncHandler(async (req, res) => {
  const user = req.user;
  const { nonce } = req.body;
  if (!nonce) return res.status(400).json({ error: "missing_nonce" });

  await query("BEGIN");
  try {
    // lock the row so concurrent requests can't double-resolve the same round
    const { rows: pendingRows } = await query(
      `SELECT * FROM pending_rounds
       WHERE user_id = $1 AND nonce = $2 AND kind = 'spin' AND used = FALSE AND expires_at > now()
       FOR UPDATE`,
      [user.id, nonce]
    );
    const pending = pendingRows[0];
    if (!pending) {
      await query("ROLLBACK");
      return res.status(400).json({ error: "round_not_found_or_expired" });
    }

      const tier = pending.tier;
      const costFromPending = pending.cost_amount ? Number(pending.cost_amount) : null;

    // re-check balances inside the transaction (fresh row lock on user)
    const { rows: userRows } = await query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const freshUser = userRows[0];

    if (tier === "standard" && freshUser.free_spins < 1) {
      await query("ROLLBACK");
      return res.status(400).json({ error: "no_free_spins" });
    }
    if (tier === "premium" && freshUser.stars_balance < 50) {
      await query("ROLLBACK");
      return res.status(400).json({ error: "insufficient_stars", required: 50 });
    }
    if (tier === "stars") {
      if (!Number.isInteger(costFromPending) || costFromPending <= 0) {
        await query("ROLLBACK");
        return res.status(400).json({ error: "invalid_cost" });
      }
      if (freshUser.stars_balance < costFromPending) {
        await query("ROLLBACK");
        return res.status(400).json({ error: "insufficient_stars", required: costFromPending });
      }
    }

    // mark round used FIRST (prevents replay even if something below throws)
    await query("UPDATE pending_rounds SET used = TRUE WHERE id = $1", [pending.id]);

    const table = tier === "premium" ? PREMIUM_TABLE : STANDARD_TABLE;
    const prize = resolvePrize(pending.server_seed, pending.client_seed, Number(pending.nonce), table);
    const hash = resultHash(pending.server_seed, pending.client_seed, Number(pending.nonce));

    if (tier === "standard") {
      await query("UPDATE users SET free_spins = free_spins - 1 WHERE id = $1", [user.id]);
    } else if (tier === "premium") {
      await query("UPDATE users SET stars_balance = stars_balance - 50 WHERE id = $1", [user.id]);
    } else if (tier === "stars") {
      await query("UPDATE users SET stars_balance = stars_balance - $1 WHERE id = $2", [costFromPending, user.id]);
    }

    if (prize.type === "usdt") {
      await query("UPDATE users SET usdt_balance = usdt_balance + $1 WHERE id = $2", [prize.value, user.id]);
    } else if (prize.type === "points") {
      await query("UPDATE users SET points_balance = points_balance + $1 WHERE id = $2", [prize.value, user.id]);
    } else if (prize.type === "free_spin") {
      await query("UPDATE users SET free_spins = free_spins + $1 WHERE id = $2", [prize.value, user.id]);
    } else if (prize.type === "stars") {
      await query("UPDATE users SET stars_balance = stars_balance + $1 WHERE id = $2", [prize.value, user.id]);
    }

    await query(
      `INSERT INTO spins (user_id, wheel_tier, prize_type, prize_value, server_seed, client_seed, nonce, result_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [user.id, tier, prize.type, prize.value, pending.server_seed, pending.client_seed, pending.nonce, hash]
    );

    await query("COMMIT");
    // server_seed only ever revealed here, AFTER the outcome is locked in — enough to verify, too late to influence
    res.json({ prize, result_hash: hash, server_seed: pending.server_seed, client_seed: pending.client_seed, nonce: pending.nonce });
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
}));

export default router;

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

// Box catalog — the Boxes tab in frontend/src/pages/Box.jsx mirrors tiers/costs, keep in sync.
const BOXES = {
  mini: {
    cost: 50,
    costType: "points",
    table: [
      { key: "usdt_0.05", weight: 5, type: "usdt", value: 0.05 },
      { key: "points_75", weight: 35, type: "points", value: 75 },
      { key: "points_30", weight: 40, type: "points", value: 30 },
      { key: "stars_1", weight: 10, type: "stars", value: 1 },
      { key: "nothing", weight: 10, type: "nothing", value: 0 },
    ],
  },
  standard: {
    cost: 100,
    costType: "points",
    table: [
      { key: "usdt_0.1", weight: 5, type: "usdt", value: 0.1 },
      { key: "points_150", weight: 40, type: "points", value: 150 },
      { key: "points_50", weight: 45, type: "points", value: 50 },
      { key: "stars_2", weight: 8, type: "stars", value: 2 },
      { key: "nothing", weight: 10, type: "nothing", value: 0 },
    ],
  },
  premium: {
    cost: 150,
    costType: "stars",
    table: [
      { key: "usdt_1", weight: 8, type: "usdt", value: 1 },
      { key: "usdt_0.3", weight: 22, type: "usdt", value: 0.3 },
      { key: "points_300", weight: 40, type: "points", value: 300 },
      { key: "stars_10", weight: 10, type: "stars", value: 10 },
      { key: "nothing", weight: 30, type: "nothing", value: 0 },
    ],
  },
  royal: {
    cost: 400,
    costType: "stars",
    table: [
      { key: "usdt_3", weight: 6, type: "usdt", value: 3 },
      { key: "usdt_1", weight: 18, type: "usdt", value: 1 },
      { key: "usdt_0.5", weight: 16, type: "usdt", value: 0.5 },
      { key: "points_1000", weight: 25, type: "points", value: 1000 },
      { key: "stars_25", weight: 12, type: "stars", value: 25 },
      { key: "nothing", weight: 23, type: "nothing", value: 0 },
    ],
  },
};

// GET /api/box/prepare?tier=standard — same server-held-seed pattern as spins
router.get("/prepare", asyncHandler(async (req, res) => {
  const user = req.user;
  const tier = BOXES[req.query.tier] ? req.query.tier : "standard";
  const box = BOXES[tier];

  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  const nonce = Date.now() * 1000 + Math.floor(Math.random() * 1000);

  await query(
    `INSERT INTO pending_rounds (user_id, kind, tier, server_seed, client_seed, nonce, expires_at)
     VALUES ($1, 'box', $2, $3, $4, $5, now() + interval '2 minutes')`,
    [user.id, tier, serverSeed, clientSeed, nonce]
  );

  res.json({
    server_seed_hash: hashServerSeed(serverSeed),
    client_seed: clientSeed,
    nonce,
    tier,
    cost: box.cost,
    cost_type: box.costType,
  });
}));

// POST /api/box/open { nonce }
router.post("/open", asyncHandler(async (req, res) => {
  const user = req.user;
  const { nonce } = req.body;
  if (!nonce) return res.status(400).json({ error: "missing_nonce" });

  await query("BEGIN");
  try {
    const { rows: pendingRows } = await query(
      `SELECT * FROM pending_rounds
       WHERE user_id = $1 AND nonce = $2 AND kind = 'box' AND used = FALSE AND expires_at > now()
       FOR UPDATE`,
      [user.id, nonce]
    );
    const pending = pendingRows[0];
    if (!pending) {
      await query("ROLLBACK");
      return res.status(400).json({ error: "round_not_found_or_expired" });
    }

    const tier = pending.tier;
    const box = BOXES[tier] ?? BOXES.standard;
    const cost = box.cost;
    const costType = box.costType;
    const balanceCol = costType === "stars" ? "stars_balance" : "points_balance";

    const { rows: userRows } = await query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const freshUser = userRows[0];
    if (freshUser[balanceCol] < cost) {
      await query("ROLLBACK");
      return res.status(400).json({ error: "insufficient_balance", required: cost, type: costType });
    }

    await query("UPDATE pending_rounds SET used = TRUE WHERE id = $1", [pending.id]);

    const prize = resolvePrize(pending.server_seed, pending.client_seed, Number(pending.nonce), box.table);
    const hash = resultHash(pending.server_seed, pending.client_seed, Number(pending.nonce));

    await query(`UPDATE users SET ${balanceCol} = ${balanceCol} - $1 WHERE id = $2`, [cost, user.id]);

    if (prize.type === "usdt") {
      await query("UPDATE users SET usdt_balance = usdt_balance + $1 WHERE id = $2", [prize.value, user.id]);
    } else if (prize.type === "points") {
      await query("UPDATE users SET points_balance = points_balance + $1 WHERE id = $2", [prize.value, user.id]);
    } else if (prize.type === "stars") {
      await query("UPDATE users SET stars_balance = stars_balance + $1 WHERE id = $2", [prize.value, user.id]);
    }

    await query(
      `INSERT INTO box_opens (user_id, box_tier, cost_type, cost_amount, prize_type, prize_value, server_seed, client_seed, nonce, result_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [user.id, tier, costType, cost, prize.type, prize.value, pending.server_seed, pending.client_seed, pending.nonce, hash]
    );

    await query("COMMIT");
    res.json({ prize, result_hash: hash, server_seed: pending.server_seed, client_seed: pending.client_seed, nonce: pending.nonce });
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
}));

export default router;

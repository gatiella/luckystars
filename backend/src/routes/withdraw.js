import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const MIN_WITHDRAWAL_USDT = 10;

// TON wallet addresses: base64url/base64, 48 chars, optionally EQ/UQ prefixed (raw or bounceable forms)
const TON_ADDRESS_RE = /^[A-Za-z0-9_-]{48}$/;

// POST /api/withdraw { amount_usdt, wallet }
router.post("/", asyncHandler(async (req, res) => {
  const user = req.user;
  const { amount_usdt, wallet } = req.body;

  if (typeof wallet !== "string" || !TON_ADDRESS_RE.test(wallet.trim())) {
    return res.status(400).json({ error: "invalid_wallet" });
  }
  const amount = Number(amount_usdt);
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_USDT) {
    return res.status(400).json({ error: "below_minimum", minimum: MIN_WITHDRAWAL_USDT });
  }

  await query("BEGIN");
  try {
    // lock the user row so a burst of parallel requests can't overdraw the balance
    const { rows: userRows } = await query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const freshUser = userRows[0];

    if (amount > Number(freshUser.usdt_balance)) {
      await query("ROLLBACK");
      return res.status(400).json({ error: "insufficient_balance", balance: freshUser.usdt_balance });
    }

    await query("UPDATE users SET usdt_balance = usdt_balance - $1 WHERE id = $2", [amount, user.id]);
    const { rows } = await query(
      `INSERT INTO withdrawals (user_id, amount_usdt, wallet) VALUES ($1, $2, $3) RETURNING *`,
      [user.id, amount, wallet.trim()]
    );
    await query("COMMIT");
    res.json({ ok: true, withdrawal: rows[0] });
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
}));

// GET /api/withdraw/history
router.get("/history", asyncHandler(async (req, res) => {
  const { rows } = await query(
    "SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 50",
    [req.user.id]
  );
  res.json({ withdrawals: rows, minimum: MIN_WITHDRAWAL_USDT });
}));

export default router;

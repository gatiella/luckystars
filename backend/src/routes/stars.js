import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// POST /api/stars/topup { amount_stars }
router.post("/topup", asyncHandler(async (req, res) => {
  const user = req.user;
  const amount = Number(req.body?.amount_stars ?? req.body?.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1000000) {
    return res.status(400).json({ error: "invalid_amount" });
  }

  // Developer-friendly instant top-up toggle. If not enabled, we return an informative error
  // so a payment provider integration can be plugged in later.
  if (process.env.ALLOW_DEV_TOPUP !== "true") {
    return res.status(501).json({ error: "payment_provider_not_configured", message: "Server is not configured to process real payments yet." });
  }

  await query("BEGIN");
  try {
    const { rows: userRows } = await query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const freshUser = userRows[0];

    await query("UPDATE users SET stars_balance = stars_balance + $1 WHERE id = $2", [amount, user.id]);
    const { rows } = await query("SELECT stars_balance FROM users WHERE id = $1", [user.id]);
    await query("COMMIT");
    res.json({ ok: true, stars_balance: rows[0].stars_balance });
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
}));

export default router;

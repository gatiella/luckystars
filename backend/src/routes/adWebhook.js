import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const MAX_AD_REWARDS_PER_DAY = 8; // keep in sync with routes/earn.js

// GET /api/earn/ad-reward-webhook?key=<secret>&userid=<telegramId>
//
// Adsgram's server-to-server reward postback. Adsgram substitutes the user's
// Telegram ID into the [userId] macro and calls this over HTTPS AFTER the
// client-side reward fires. Adsgram sends no signature of its own, so the
// shared `key` (ADSGRAM_POSTBACK_SECRET) is what stops anyone from forging
// rewards by hitting this URL with an arbitrary Telegram ID.
router.get("/ad-reward-webhook", asyncHandler(async (req, res) => {
  const secret = process.env.ADSGRAM_POSTBACK_SECRET;
  if (!secret) {
    // Fail closed: without a configured secret the endpoint is unauthenticated
    // and would let anyone farm spins, so refuse to grant anything.
    return res.status(500).json({ error: "postback_secret_not_configured" });
  }
  if (req.query.key !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const tgId = req.query.userid;
  if (!tgId || !/^\d+$/.test(String(tgId))) {
    return res.status(400).json({ error: "invalid_userid" });
  }

  const { rows: userRows } = await query("SELECT * FROM users WHERE tg_id = $1", [tgId]);
  const user = userRows[0];
  if (!user) return res.status(404).json({ error: "user_not_found" });

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS c FROM ad_views
     WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
    [user.id]
  );
  if (countRows[0].c >= MAX_AD_REWARDS_PER_DAY) {
    // Ack with 200 so Adsgram doesn't retry a reward we're intentionally capping.
    return res.json({ ok: true, granted: false, reason: "daily_ad_cap_reached" });
  }

  await query("BEGIN");
  try {
    await query("UPDATE users SET free_spins = free_spins + 1 WHERE id = $1", [user.id]);
    await query(
      `INSERT INTO ad_views (user_id, network, reward_type, ip, device_hash)
       VALUES ($1, 'adsgram', 'spin', $2, $3)`,
      [user.id, req.ip, user.device_hash]
    );
    await query("COMMIT");
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }

  res.json({ ok: true, granted: true });
}));

export default router;

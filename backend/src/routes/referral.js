import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isSuspiciousReferral } from "../lib/antifraud.js";

const router = Router();

// POST /api/referral/claim { referrer_tg_id }
// Called once, right after a brand-new user opens the app via a referral deep link.
router.post("/claim", asyncHandler(async (req, res) => {
  const referee = req.user;
  const { referrer_tg_id } = req.body;
  if (!referrer_tg_id || Number(referrer_tg_id) === Number(referee.tg_id)) {
    return res.status(400).json({ error: "invalid_referrer" });
  }
  if (referee.referred_by) {
    return res.status(400).json({ error: "already_referred" });
  }

  const { rows: refRows } = await query("SELECT * FROM users WHERE tg_id = $1", [referrer_tg_id]);
  const referrer = refRows[0];
  if (!referrer) return res.status(404).json({ error: "referrer_not_found" });

  const { suspicious, reason } = await isSuspiciousReferral({
    referrerId: referrer.id,
    refereeDeviceHash: referee.device_hash,
    refereeIp: referee.last_ip,
  });

  await query("BEGIN");
  try {
    await query("UPDATE users SET referred_by = $1 WHERE id = $2", [referrer.id, referee.id]);
    await query(
      `INSERT INTO referrals (referrer_id, referee_id, reward_spins, flagged)
       VALUES ($1, $2, $3, $4)`,
      [referrer.id, referee.id, 1, suspicious]
    );

    if (!suspicious) {
      // instant gratification: referrer gets 1 free spin, referee gets a welcome spin
      await query("UPDATE users SET free_spins = free_spins + 1 WHERE id = $1", [referrer.id]);
      await query("UPDATE users SET free_spins = free_spins + 1 WHERE id = $1", [referee.id]);
    }
    await query("COMMIT");
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }

  // milestone check (5 / 20 / 50 real invites)
  const { rows: countRows } = await query(
    "SELECT COUNT(*)::int AS c FROM referrals WHERE referrer_id = $1 AND flagged = FALSE",
    [referrer.id]
  );
  const inviteCount = countRows[0].c;
  let milestone = null;
  if (inviteCount === 5) milestone = "bonus_spins";
  if (inviteCount === 20) milestone = "vip_badge";
  if (inviteCount === 50) milestone = "withdrawal_fee_waived";

  res.json({ ok: true, flagged: suspicious, flag_reason: suspicious ? reason : null, invite_count: inviteCount, milestone });
}));

// GET /api/referral/tree — reuse the tree viz approach from RiftCoin
router.get("/tree", asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.username, u.first_name, u.created_at,
            (SELECT COUNT(*) FROM referrals r2 WHERE r2.referrer_id = u.id AND r2.flagged = FALSE)::int AS sub_invites
     FROM referrals r
     JOIN users u ON u.id = r.referee_id
     WHERE r.referrer_id = $1 AND r.flagged = FALSE
     ORDER BY u.created_at DESC`,
    [req.user.id]
  );
  res.json({ referrals: rows });
}));

// GET /api/referral/leaderboard
router.get("/leaderboard", asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.username, u.first_name, l.invite_count
     FROM weekly_referral_leaderboard l
     JOIN users u ON u.id = l.user_id
     ORDER BY l.invite_count DESC
     LIMIT 20`
  );
  res.json({ leaderboard: rows });
}));

export default router;

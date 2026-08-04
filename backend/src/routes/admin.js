import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// GET /api/admin/withdrawals?status=pending
router.get("/withdrawals", asyncHandler(async (req, res) => {
  const status = req.query.status || "pending";
  const { rows } = await query(
    `SELECT w.*, u.tg_id, u.username FROM withdrawals w
     JOIN users u ON u.id = w.user_id
     WHERE w.status = $1 ORDER BY w.requested_at ASC`,
    [status]
  );
  res.json({ withdrawals: rows });
}));

// POST /api/admin/withdrawals/:id/approve
router.post("/withdrawals/:id/approve", asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE withdrawals SET status = 'processing', processed_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "not_found_or_already_processed" });
  res.json({ ok: true, withdrawal: rows[0] });
  // TODO: trigger actual TON payout here (reuse RiftCoin's batched-SQL payout script pattern),
  // then flip status to 'paid' once the on-chain tx confirms.
}));

// POST /api/admin/withdrawals/:id/reject { reason }
router.post("/withdrawals/:id/reject", asyncHandler(async (req, res) => {
  await query("BEGIN");
  try {
    const { rows } = await query(
      `UPDATE withdrawals SET status = 'rejected', processed_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) {
      await query("ROLLBACK");
      return res.status(404).json({ error: "not_found_or_already_processed" });
    }
    // refund the balance since it was deducted at request time
    await query("UPDATE users SET usdt_balance = usdt_balance + $1 WHERE id = $2", [
      rows[0].amount_usdt,
      rows[0].user_id,
    ]);
    await query("COMMIT");
    res.json({ ok: true, withdrawal: rows[0] });
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
}));

// GET /api/admin/referrals/flagged
router.get("/referrals/flagged", asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, ru.tg_id AS referrer_tg_id, eu.tg_id AS referee_tg_id
     FROM referrals r
     JOIN users ru ON ru.id = r.referrer_id
     JOIN users eu ON eu.id = r.referee_id
     WHERE r.flagged = TRUE ORDER BY r.created_at DESC LIMIT 100`
  );
  res.json({ flagged: rows });
}));

// POST /api/admin/referrals/:id/unflag — manual review cleared it
router.post("/referrals/:id/unflag", asyncHandler(async (req, res) => {
  const { rows } = await query(
    "UPDATE referrals SET flagged = FALSE WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, referral: rows[0] });
}));

// GET /api/admin/tasks
router.get("/tasks", asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT * FROM tasks ORDER BY id");
  res.json({ tasks: rows });
}));

// POST /api/admin/tasks { title, type, target_url, reward_spins }
router.post("/tasks", asyncHandler(async (req, res) => {
  const { title, type, target_url, reward_spins = 1 } = req.body;
  if (!title || !type) return res.status(400).json({ error: "missing_fields" });
  const { rows } = await query(
    `INSERT INTO tasks (title, type, target_url, reward_spins) VALUES ($1,$2,$3,$4) RETURNING *`,
    [title, type, target_url || null, reward_spins]
  );
  res.json({ ok: true, task: rows[0] });
}));

// POST /api/admin/tasks/:id/toggle
router.post("/tasks/:id/toggle", asyncHandler(async (req, res) => {
  const { rows } = await query(
    "UPDATE tasks SET active = NOT active WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, task: rows[0] });
}));

// GET /api/admin/stats — quick health snapshot
router.get("/stats", asyncHandler(async (req, res) => {
  const [{ rows: userCount }, { rows: liability }, { rows: pendingWd }] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM users"),
    query("SELECT COALESCE(SUM(usdt_balance),0)::float AS total FROM users"),
    query("SELECT COALESCE(SUM(amount_usdt),0)::float AS total, COUNT(*)::int AS c FROM withdrawals WHERE status = 'pending'"),
  ]);
  res.json({
    total_users: userCount[0].c,
    outstanding_usdt_liability: liability[0].total,
    pending_withdrawals_usdt: pendingWd[0].total,
    pending_withdrawals_count: pendingWd[0].c,
  });
}));

export default router;

import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyTaskCompletion } from "../lib/taskVerification.js";

const router = Router();

const MAX_AD_REWARDS_PER_DAY = 8; // anti-abuse cap on Adsgram rewarded views

// POST /api/earn/ad-reward — called after Adsgram confirms a completed rewarded view
router.post("/ad-reward", asyncHandler(async (req, res) => {
  const user = req.user;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS c FROM ad_views
     WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
    [user.id]
  );
  if (countRows[0].c >= MAX_AD_REWARDS_PER_DAY) {
    return res.status(429).json({ error: "daily_ad_cap_reached", cap: MAX_AD_REWARDS_PER_DAY });
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

  res.json({ ok: true, free_spins_granted: 1, remaining_today: MAX_AD_REWARDS_PER_DAY - countRows[0].c - 1 });
}));

// POST /api/earn/daily-spin — claim the once-per-24h free spin
router.post("/daily-spin", asyncHandler(async (req, res) => {
  const user = req.user;
  if (user.daily_spin_at) {
    const elapsedMs = Date.now() - new Date(user.daily_spin_at).getTime();
    if (elapsedMs < 24 * 60 * 60 * 1000) {
      const nextAvailableMs = 24 * 60 * 60 * 1000 - elapsedMs;
      return res.status(429).json({ error: "already_claimed", next_available_ms: nextAvailableMs });
    }
  }
  await query(
    "UPDATE users SET free_spins = free_spins + 1, daily_spin_at = now() WHERE id = $1",
    [user.id]
  );
  res.json({ ok: true, free_spins_granted: 1 });
}));

// GET /api/earn/tasks — active tasks (join channel, follow X, etc.)
router.get("/tasks", asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, EXISTS(
        SELECT 1 FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = $1
     ) AS completed
     FROM tasks t WHERE t.active = TRUE ORDER BY t.id`,
    [req.user.id]
  );
  res.json({ tasks: rows });
}));

// POST /api/earn/tasks/:id/complete
router.post("/tasks/:id/complete", asyncHandler(async (req, res) => {
  const user = req.user;
  const taskId = req.params.id;

  const { rows: taskRows } = await query("SELECT * FROM tasks WHERE id = $1 AND active = TRUE", [taskId]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ error: "task_not_found" });

  // Reject early if already completed, before doing verification work.
  const { rows: doneRows } = await query(
    "SELECT 1 FROM task_completions WHERE user_id = $1 AND task_id = $2",
    [user.id, taskId]
  );
  if (doneRows.length > 0) return res.status(400).json({ error: "already_completed" });

  // Verify the user actually completed the task (e.g. joined the channel)
  // before crediting any reward.
  const verification = await verifyTaskCompletion(task, user.tg_id);
  if (!verification.verified) {
    return res.status(403).json({
      error: "not_verified",
      reason: verification.reason,
      message: verification.message || "Task not completed yet.",
    });
  }

  // Record completion and credit reward atomically. The UNIQUE(user_id, task_id)
  // constraint is the source of truth against double-claims under concurrency.
  await query("BEGIN");
  try {
    await query("INSERT INTO task_completions (user_id, task_id) VALUES ($1, $2)", [user.id, taskId]);
    await query("UPDATE users SET free_spins = free_spins + $1 WHERE id = $2", [task.reward_spins, user.id]);
    await query("COMMIT");
  } catch (err) {
    await query("ROLLBACK");
    if (err.code === "23505") return res.status(400).json({ error: "already_completed" }); // unique violation
    throw err;
  }

  res.json({ ok: true, free_spins_granted: task.reward_spins });
}));

export default router;

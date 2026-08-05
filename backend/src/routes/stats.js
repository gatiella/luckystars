import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// GET /api/stats/overview — real global numbers + recent-wins feed for the Ranks tab
router.get("/overview", asyncHandler(async (req, res) => {
  const [{ rows: playerRows }, { rows: spinRows }, { rows: usdtRows }, { rows: activityRows }] =
    await Promise.all([
      query("SELECT COUNT(*)::int AS c FROM users"),
      query("SELECT COUNT(*)::int AS c FROM spins WHERE created_at >= now() - interval '24 hours'"),
      query(
        `SELECT COALESCE((SELECT SUM(prize_value) FROM spins WHERE prize_type = 'usdt'), 0)
              + COALESCE((SELECT SUM(prize_value) FROM box_opens WHERE prize_type = 'usdt'), 0) AS total`
      ),
      query(
        `SELECT w.source, w.prize_type, w.prize_value, w.created_at,
                COALESCE(u.first_name, u.username, 'Player') AS name
         FROM (
           SELECT user_id, 'spin' AS source, prize_type, prize_value, created_at
           FROM spins WHERE prize_type <> 'nothing'
           UNION ALL
           SELECT user_id, 'box' AS source, prize_type, prize_value, created_at
           FROM box_opens WHERE prize_type <> 'nothing'
         ) w
         JOIN users u ON u.id = w.user_id
         ORDER BY w.created_at DESC
         LIMIT 15`
      ),
    ]);

  res.json({
    players: playerRows[0].c,
    spins_24h: spinRows[0].c,
    usdt_won: Number(usdtRows[0].total),
    activity: activityRows,
  });
}));

export default router;

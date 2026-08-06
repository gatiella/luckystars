import { query } from "../db.js";
import { verifyInitData } from "../lib/telegramAuth.js";
import "dotenv/config";

/**
 * Verifies Telegram WebApp initData signature, then upserts/attaches the user.
 * Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function telegramAuth(req, res, next) {
  try {
    const initData = req.headers["x-telegram-init-data"];
    if (!initData) return res.status(401).json({ error: "missing_init_data" });

    const user = verifyInitData(initData, process.env.BOT_TOKEN);
    if (!user) return res.status(401).json({ error: "invalid_signature" });

    const deviceHash = req.headers["x-device-hash"] || null;
    const ip = req.ip;

    const { rows } = await query(
      `INSERT INTO users (tg_id, username, first_name, device_hash, last_ip)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tg_id) DO UPDATE
         SET username = EXCLUDED.username,
             device_hash = COALESCE(EXCLUDED.device_hash, users.device_hash),
             last_ip = EXCLUDED.last_ip
       RETURNING *`,
      [user.id, user.username, user.first_name, deviceHash, ip]
    );

    req.user = rows[0];
    next();
  } catch (err) {
    console.error("auth error", err);
    res.status(401).json({ error: "auth_failed" });
  }
}
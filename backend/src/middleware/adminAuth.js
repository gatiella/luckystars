import "dotenv/config";
import { verifyInitData } from "../lib/telegramAuth.js";

/**
 * Gates /api/admin/* behind real Telegram identity instead of a shared
 * secret: verifies the Mini App initData signature (same mechanism as the
 * main app's telegramAuth), then checks the signed-in user's tg_id against
 * the ADMIN_TG_ID allowlist from env. Support comma-separated IDs if you
 * ever need more than one admin, e.g. ADMIN_TG_ID=111111,222222.
 */
export function adminAuth(req, res, next) {
  if (!process.env.ADMIN_TG_ID) {
    return res.status(500).json({ error: "admin_tg_id_not_configured" });
  }

  const initData = req.headers["x-telegram-init-data"];
  if (!initData) return res.status(401).json({ error: "missing_init_data" });

  const user = verifyInitData(initData, process.env.BOT_TOKEN);
  if (!user) return res.status(401).json({ error: "invalid_signature" });

  const allowedIds = process.env.ADMIN_TG_ID.split(",").map((id) => id.trim());
  if (!allowedIds.includes(String(user.id))) {
    return res.status(403).json({ error: "not_admin" });
  }

  req.adminUser = user;
  next();
}
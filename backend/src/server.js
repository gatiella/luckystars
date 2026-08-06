import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { telegramAuth } from "./middleware/auth.js";
import { adminAuth } from "./middleware/adminAuth.js";
import spinRoutes from "./routes/spin.js";
import boxRoutes from "./routes/box.js";
import referralRoutes from "./routes/referral.js";
import earnRoutes from "./routes/earn.js";
import adWebhookRoutes from "./routes/adWebhook.js";
import withdrawRoutes from "./routes/withdraw.js";
import adminRoutes from "./routes/admin.js";
import starsRoutes from "./routes/stars.js";
import statsRoutes from "./routes/stats.js";
import { launchBot } from "./bot.js";
import { query } from "./db.js";

const app = express();
app.set("trust proxy", 1); // needed for correct req.ip behind Render/Railway proxies

// contentSecurityPolicy disabled because the plain-HTML admin panel below uses inline
// script/style; the panel itself is opened only via the bot's /admin command (gated on
// ADMIN_TG_ID) and every API call it makes is re-verified against that same ID — see adminAuth.
// For a client this sensitive, also put /admin behind an IP allowlist or VPN at the proxy layer.
// frameguard is disabled to allow Telegram Mini App iframe embedding.
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(",") : "*",
  })
);

// Bot webhook must be registered BEFORE express.json() — Telegraf's webhookCallback
// reads the raw request body itself, and once express.json() consumes the stream
// there's nothing left for it to read.
if (process.env.BOT_TOKEN) {
  launchBot(app);
}

app.use(express.json({ limit: "100kb" }));

// General API rate limit
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Tighter limit on the endpoints that move money/prizes
const gameLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20 });
const withdrawLimiter = rateLimit({ windowMs: 60 * 1000, limit: 5 });

app.get("/health", (req, res) => res.json({ ok: true }));

// Admin panel (static HTML). API calls it makes are gated by Telegram identity — see adminAuth.
app.use("/admin", express.static(path.join(__dirname, "../../admin")));

// Serve the built frontend at the root URL for single-service Render deployments.
const frontendDistPath = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendDistPath));

app.get("/api/me", telegramAuth, (req, res) => {
  res.json({ user: req.user });
});

app.use("/api/spin", telegramAuth, gameLimiter, spinRoutes);
app.use("/api/box", telegramAuth, gameLimiter, boxRoutes);
app.use("/api/referral", telegramAuth, referralRoutes);
// Adsgram S2S reward postback — no telegramAuth (Adsgram's servers have no
// Mini App initData); guarded by ADSGRAM_POSTBACK_SECRET instead. Must be
// mounted before the authed /api/earn routes so its path matches first.
app.use("/api/earn", adWebhookRoutes);
app.use("/api/earn", telegramAuth, earnRoutes);
app.use("/api/stars", telegramAuth, starsRoutes);
app.use("/api/stats", telegramAuth, statsRoutes);
app.use("/api/withdraw", telegramAuth, withdrawLimiter, withdrawRoutes);
app.use("/api/admin", adminAuth, adminRoutes);

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "not_found" });
  }
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

// basic error handler — never leak internals to the client
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`LuckyStars API listening on :${PORT}`));

// Safety net: log instead of crash if something still slips through unwrapped
// (e.g. a future route handler added without asyncHandler, or a stray library rejection).
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (server kept running):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server kept running):", err);
});

// Sweep expired/unused pending rounds every 5 minutes so the table doesn't grow unbounded
setInterval(async () => {
  try {
    await query("DELETE FROM pending_rounds WHERE expires_at < now() - interval '10 minutes'");
  } catch (err) {
    console.error("pending_rounds cleanup failed:", err.message);
  }
}, 5 * 60 * 1000);
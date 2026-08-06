import { Telegraf } from "telegraf";
import "dotenv/config";
import { query } from "./db.js";

const bot = new Telegraf(process.env.BOT_TOKEN);
const APP_URL = process.env.WEBAPP_URL || "https://t.me/your_bot/app";

bot.start(async (ctx) => {
  const payload = ctx.startPayload; // referrer tg_id if opened via t.me/bot?start=<tg_id>
  const name = ctx.from.first_name || "there";

  await ctx.reply(
    `🎰 Welcome to LuckyStars, ${name}!\n\n` +
      `Spin the wheel, open Lucky Boxes, and cash out real USDT — no deposit required.\n` +
      `Earn free spins by watching ads, checking in daily, completing tasks, or inviting friends.\n` +
      `Minimum withdrawal: just $10 USDT.`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "🎡 Open LuckyStars", web_app: { url: APP_URL + (payload ? `?ref=${payload}` : "") } }]],
      },
    }
  );
});

bot.command("invite", async (ctx) => {
  const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
  await ctx.reply(
    `Invite friends and get a free spin for every real signup 🎁\n\n${link}`
  );
});

// Admin panel access: restricted to the tg_id(s) in ADMIN_TG_ID (comma-separated
// for multiple admins). The panel itself re-verifies the opener's Telegram identity
// via Mini App initData on every API call — see adminAuth.js — so this check is
// about who gets the entry point, not the only line of defense.
const ADMIN_TG_IDS = (process.env.ADMIN_TG_ID || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const ADMIN_PANEL_URL =
  process.env.ADMIN_PANEL_URL || (process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/admin` : null);

bot.command("admin", async (ctx) => {
  if (ctx.chat.type !== "private") return; // never respond in groups
  if (!ADMIN_TG_IDS.includes(String(ctx.from.id))) return; // silently ignore non-admins

  if (!ADMIN_PANEL_URL) {
    await ctx.reply("Set ADMIN_PANEL_URL or BACKEND_URL in env so I can build the admin panel link.");
    return;
  }

  await ctx.reply("🛠 LuckyStars Admin", {
    reply_markup: {
      inline_keyboard: [[{ text: "Open Admin Panel", web_app: { url: ADMIN_PANEL_URL } }]],
    },
  });
});

// Payments: answer pre-checkout queries and handle successful payments
bot.on("pre_checkout_query", async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error("pre_checkout_query handling failed:", err.message);
  }
});

bot.on("message", async (ctx) => {
  try {
    const msg = ctx.message;
    if (msg.successful_payment) {
      const payload = msg.successful_payment.invoice_payload; // our provider_payload
      // payload format: purchase:<uuid>
      if (payload && payload.startsWith("purchase:")) {
        const providerPayload = payload;
        // mark purchase as paid and credit stars
        const { rows } = await query("SELECT * FROM purchases WHERE provider_payload = $1", [providerPayload]);
        const purchase = rows[0];
        if (!purchase) {
          console.error("Paid purchase not found for payload:", providerPayload);
          return;
        }

        if (purchase.status === "paid") return; // already processed

        await query("BEGIN");
        try {
          await query("UPDATE purchases SET status = 'paid', paid_at = now(), telegram_chat_id = $1, telegram_message_id = $2 WHERE id = $3", [msg.chat.id, msg.message_id, purchase.id]);
          await query("UPDATE users SET stars_balance = stars_balance + $1 WHERE id = $2", [purchase.stars, purchase.user_id]);
          await query("COMMIT");
          await ctx.reply(`Thanks! Your purchase of ${purchase.stars} ⭐ has been applied.`);
        } catch (err) {
          await query("ROLLBACK");
          console.error("processing successful_payment failed:", err.message);
        }
      }
    }
  } catch (err) {
    console.error("payment message handler error:", err.message);
  }
});

export function launchBot(app) {
  const mode = process.env.BOT_MODE === "webhook" ? "webhook" : "polling";

  if (mode === "webhook") {
    // Render free tier spins the service down after ~15min idle. Long polling can't run
    // while the process is asleep, so the bot just goes silent until something else wakes it.
    // Webhook mode fixes this: Telegram's own delivery request IS the thing that wakes the
    // dyno, same as any other incoming HTTP request would.
    if (!process.env.BACKEND_URL) {
      console.error("BOT_MODE=webhook but BACKEND_URL is not set — bot will not receive updates.");
      return;
    }
    const secret = process.env.WEBHOOK_SECRET || "hook";
    const path = `/telegraf/${secret}`;

    // Telegraf lazily calls getMe() to populate botInfo the first time it needs to compose
    // a context, if botInfo isn't already cached — which would otherwise block the FIRST
    // incoming webhook request on a network round-trip to Telegram. Seed a stub immediately
    // so that never happens, then replace it with the real thing once the fetch resolves.
    bot.botInfo = bot.botInfo || { id: 0, first_name: "Bot", username: "bot", is_bot: true };

    // Register the callback synchronously so it's ready the instant a request arrives,
    // even before setWebhook's network round-trip to Telegram finishes.
    app.use(bot.webhookCallback(path, { secretToken: secret }));

    bot.telegram
      .getMe()
      .then((info) => { bot.botInfo = info; })
      .catch((err) => console.error("getMe() failed, bot.command() username lookups may be stale:", err.message));

    bot.telegram
      .setWebhook(`${process.env.BACKEND_URL}${path}`, { secret_token: secret, drop_pending_updates: true })
      .then(() => console.log(`Telegram webhook set: ${process.env.BACKEND_URL}${path}`))
      .catch((err) => console.error("setWebhook failed (API server continues running):", err.message));
  } else {
    // Local dev / any always-on host. Clear any stale webhook first — leaving an old
    // webhook registered while also long-polling is exactly the polling/webhook conflict
    // you hit before on RigFloorBot.
    bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    bot.launch().catch((err) => {
      console.error("Telegram bot failed to launch (API server continues running):", err.message);
    });
    console.log("Telegram bot launch requested (long polling)");
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  }
}

/**
 * Push a notification to a user by tg_id — call from a cron job for
 * "your free spin is ready" / "2 invites from VIP" style nudges.
 */
export async function notifyUser(tgId, text) {
  try {
    await bot.telegram.sendMessage(tgId, text);
  } catch (err) {
    console.error(`notify failed for ${tgId}:`, err.message);
  }
}

export { bot };

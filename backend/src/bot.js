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

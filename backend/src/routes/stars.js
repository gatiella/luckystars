import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { bot } from "../bot.js";
import crypto from "crypto";

const router = Router();

// POST /api/stars/topup { amount_stars }
router.post("/topup", asyncHandler(async (req, res) => {
  const user = req.user;
  const amount = Number(req.body?.amount_stars ?? req.body?.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1000000) {
    return res.status(400).json({ error: "invalid_amount" });
  }

  // Developer-friendly instant top-up toggle. If not enabled, we return an informative error
  // so a payment provider integration can be plugged in later.
  if (process.env.ALLOW_DEV_TOPUP !== "true") {
    return res.status(501).json({ error: "payment_provider_not_configured", message: "Server is not configured to process real payments yet." });
  }

  await query("BEGIN");
  try {
    const { rows: userRows } = await query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const freshUser = userRows[0];

    await query("UPDATE users SET stars_balance = stars_balance + $1 WHERE id = $2", [amount, user.id]);
    const { rows } = await query("SELECT stars_balance FROM users WHERE id = $1", [user.id]);
    await query("COMMIT");
    res.json({ ok: true, stars_balance: rows[0].stars_balance });
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
}));

// POST /api/stars/invoice { amount_stars }
// Creates a Telegram Stars (XTR) invoice link. The Mini App opens it with
// Telegram.WebApp.openInvoice(); the bot credits the balance on successful_payment.
router.post("/invoice", asyncHandler(async (req, res) => {
  const user = req.user;
  const amountStars = Number(req.body?.amount_stars ?? req.body?.amount);
  if (!Number.isInteger(amountStars) || amountStars <= 0 || amountStars > 1000000) {
    return res.status(400).json({ error: "invalid_amount" });
  }

  // Create purchase row first. For XTR the charged amount IS the star count.
  const providerPayload = `purchase:${crypto.randomUUID()}`;
  const { rows: pRows } = await query(
    `INSERT INTO purchases (user_id, stars, amount_cents, currency, provider_payload)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [user.id, amountStars, amountStars, "XTR", providerPayload]
  );
  const purchase = pRows[0];

  try {
    const invoiceLink = await bot.telegram.createInvoiceLink({
      title: `${amountStars} Stars`,
      description: `Top up ${amountStars} Stars on LuckyStars`,
      payload: providerPayload,
      provider_token: "", // must be empty for Telegram Stars
      currency: "XTR",
      prices: [{ label: `${amountStars} Stars`, amount: amountStars }],
    });

    res.json({ ok: true, purchase_id: purchase.id, invoice_link: invoiceLink });
  } catch (err) {
    console.error("createInvoiceLink failed:", err.message);
    await query("UPDATE purchases SET status = 'failed' WHERE id = $1", [purchase.id]);
    res.status(500).json({ error: "invoice_failed" });
  }
}));

export default router;

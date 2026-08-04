import crypto from "crypto";

const BOT_TOKEN = "testtoken";
const BASE = "http://localhost:3999";

function makeInitData(user) {
  const params = new URLSearchParams();
  params.set("user", JSON.stringify(user));
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("query_id", "AAH" + user.id);

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

async function call(path, { method = "GET", initData, body, adminSecret } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (initData) headers["X-Telegram-Init-Data"] = initData;
  if (adminSecret) headers["X-Admin-Secret"] = adminSecret;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { console.log(`PASS  ${label}`); pass++; }
  else { console.log(`FAIL  ${label}  ${extra ? JSON.stringify(extra) : ""}`); fail++; }
}

async function main() {
  const alice = { id: 111111, username: "alice", first_name: "Alice" };
  const bob = { id: 222222, username: "bob", first_name: "Bob" };
  const aliceAuth = makeInitData(alice);
  const bobAuth = makeInitData(bob);

  // --- auth ---
  let r = await call("/api/me", { initData: aliceAuth });
  check("valid initData -> 200 + user created", r.status === 200 && String(r.data.user.tg_id) === String(alice.id), r);

  r = await call("/api/me", { initData: "user=" + encodeURIComponent(JSON.stringify(alice)) + "&hash=deadbeef" });
  check("tampered initData -> 401", r.status === 401, r);

  r = await call("/api/me");
  check("missing initData -> 401", r.status === 401, r);

  // --- no-deposit-required earning ---
  r = await call("/api/earn/daily-spin", { method: "POST", initData: aliceAuth });
  check("daily spin claim works with zero deposit", r.status === 200 && r.data.ok, r);

  r = await call("/api/earn/daily-spin", { method: "POST", initData: aliceAuth });
  check("daily spin can't be double-claimed same day", r.status === 429 && r.data.error === "already_claimed", r);

  r = await call("/api/earn/ad-reward", { method: "POST", initData: aliceAuth });
  check("ad-reward grants a free spin", r.status === 200 && r.data.free_spins_granted === 1, r);

  // --- spin: unpredictability / server-held seed ---
  r = await call("/api/spin/prepare?tier=standard", { initData: aliceAuth });
  check("spin/prepare never returns a server_seed field", r.status === 200 && !("server_seed" in r.data), r);
  const prep1 = r.data;

  r = await call("/api/spin", { method: "POST", initData: aliceAuth, body: { nonce: prep1.nonce } });
  check("spin resolves and reveals server_seed AFTER the fact", r.status === 200 && typeof r.data.server_seed === "string", r);
  const spin1 = r.data;
  if (!spin1.server_seed) { console.log("Aborting: spin never resolved, downstream checks skipped."); console.log(`\n${pass} passed, ${fail+1} failed`); process.exit(1); }

  // verify the revealed seed actually matches the pre-committed hash
  const recomputedHash = crypto.createHash("sha256").update(spin1.server_seed).digest("hex");
  check("revealed server_seed matches the pre-committed hash (not swapped after the fact)", recomputedHash === prep1.server_seed_hash, { recomputedHash, expected: prep1.server_seed_hash });

  // replay protection: reusing the same nonce must fail
  r = await call("/api/spin", { method: "POST", initData: aliceAuth, body: { nonce: prep1.nonce } });
  check("replaying the same spin nonce is rejected (no double-claim)", r.status === 400 && r.data.error === "round_not_found_or_expired", r);

  // a user cannot resolve a round they never prepared (guessing nonce)
  r = await call("/api/spin", { method: "POST", initData: bobAuth, body: { nonce: 999999999999999 } });
  check("resolving a nonexistent/unowned round fails", r.status === 400, r);

  // --- lucky box: same server-held-seed pattern ---
  r = await call("/api/box/prepare?tier=standard", { initData: aliceAuth });
  check("box/prepare never returns a server_seed field", r.status === 200 && !("server_seed" in r.data), r);

  // --- referral: no deposit required, flat bonus, anti-abuse ---
  r = await call("/api/referral/claim", { method: "POST", initData: bobAuth, body: { referrer_tg_id: alice.id } });
  check("referral claim succeeds for a distinct real user", r.status === 200 && r.data.ok, r);

  const charlie = { id: 333333, username: "charlie", first_name: "Charlie" };
  r = await call("/api/referral/claim", {
    method: "POST",
    initData: makeInitData(charlie),
    body: { referrer_tg_id: charlie.id }, // self-referral attempt
  });
  check("self-referral is rejected", r.status === 400 && r.data.error === "invalid_referrer", r);

  r = await call("/api/referral/tree", { initData: aliceAuth });
  check("referral tree query runs cleanly", r.status === 200 && Array.isArray(r.data.referrals), r);

  r = await call("/api/admin/referrals/flagged", { adminSecret: "testsecret123" });
  check(
    "same-IP referral (bob under alice, both from this test's localhost) was correctly auto-flagged by anti-fraud",
    r.status === 200 && r.data.flagged.some((f) => String(f.referrer_tg_id) === String(alice.id) && String(f.referee_tg_id) === String(bob.id)),
    r
  );

  // --- withdrawal: flat $10 minimum, no gating, no deposit requirement ---
  r = await call("/api/withdraw", { method: "POST", initData: aliceAuth, body: { amount_usdt: 5, wallet: "A".repeat(48) } });
  check("withdrawal below $10 minimum is rejected", r.status === 400 && r.data.error === "below_minimum", r);

  r = await call("/api/withdraw", { method: "POST", initData: aliceAuth, body: { amount_usdt: 10, wallet: "not-a-valid-address" } });
  check("malformed wallet address is rejected", r.status === 400 && r.data.error === "invalid_wallet", r);

  r = await call("/api/withdraw", { method: "POST", initData: aliceAuth, body: { amount_usdt: 10000, wallet: "A".repeat(48) } });
  check("withdrawal exceeding balance is rejected (alice has ~$0)", r.status === 400 && r.data.error === "insufficient_balance", r);

  // --- input validation / abuse ---
  r = await call("/api/spin", { method: "POST", initData: aliceAuth, body: {} });
  check("spin with missing nonce is rejected cleanly (no crash)", r.status === 400 && r.data.error === "missing_nonce", r);

  r = await fetch(BASE + "/health");
  check("server still alive after all the above", r.status === 200, {});

  // --- admin auth ---
  r = await call("/api/admin/stats", { adminSecret: "wrong" });
  check("admin endpoint rejects wrong secret", r.status === 401, r);

  r = await call("/api/admin/stats", { adminSecret: "testsecret123" });
  check("admin endpoint accepts correct secret and returns real stats", r.status === 200 && typeof r.data.total_users === "number", r);

  r = await call("/api/admin/withdrawals?status=pending", { adminSecret: "testsecret123" });
  check("admin can list pending withdrawals", r.status === 200 && Array.isArray(r.data.withdrawals), r);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("TEST SCRIPT CRASHED:", err);
  process.exit(1);
});

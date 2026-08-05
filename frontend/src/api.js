const BASE = "/api";

function initData() {
  return window.Telegram?.WebApp?.initData || "";
}

function deviceHash() {
  // simple persisted fingerprint; swap for a proper fingerprinting lib in production
  let h = localStorage.getItem("ls_device_hash");
  if (!h) {
    h = crypto.randomUUID();
    localStorage.setItem("ls_device_hash", h);
  }
  return h;
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData(),
      "X-Device-Hash": deviceHash(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "request_failed"), { data });
  return data;
}

export const api = {
  me: () => request("/me"),
  spinPrepare: (tier = "standard", cost) => request(`/spin/prepare?tier=${tier}${cost ? `&cost=${cost}` : ""}`),
  spin: (nonce) => request("/spin", { method: "POST", body: JSON.stringify({ nonce }) }),
  boxPrepare: (tier = "standard") => request(`/box/prepare?tier=${tier}`),
  boxOpen: (nonce) => request("/box/open", { method: "POST", body: JSON.stringify({ nonce }) }),
  dailySpin: () => request("/earn/daily-spin", { method: "POST" }),
  adReward: () => request("/earn/ad-reward", { method: "POST" }),
  tasks: () => request("/earn/tasks"),
  completeTask: (id) => request(`/earn/tasks/${id}/complete`, { method: "POST" }),
  referralClaim: (referrer_tg_id) =>
    request("/referral/claim", { method: "POST", body: JSON.stringify({ referrer_tg_id }) }),
  referralTree: () => request("/referral/tree"),
  leaderboard: () => request("/referral/leaderboard"),
  statsOverview: () => request("/stats/overview"),
  withdraw: (body) => request("/withdraw", { method: "POST", body: JSON.stringify(body) }),
  withdrawHistory: () => request("/withdraw/history"),
  // Stars top-up (dev instant top-up if ALLOW_DEV_TOPUP is set on the server)
  starsTopUp: (amount) => request("/stars/topup", { method: "POST", body: JSON.stringify({ amount_stars: amount }) }),
  starsCreateInvoice: (amount) => request("/stars/invoice", { method: "POST", body: JSON.stringify({ amount_stars: amount }) }),
};

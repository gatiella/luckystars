import { useState } from "react";
import { api } from "../api.js";

// Mirrors the box catalog in backend/src/routes/box.js — keep tiers/costs in sync
const BOXES = [
  { tier: "mini", name: "Mini", emoji: "🎈", cost: 50, costType: "points", costLabel: "50 🔷", top: "Win up to $0.05 · 75 pts", accent: "#4f8ef7" },
  { tier: "standard", name: "Standard", emoji: "🎁", cost: 100, costType: "points", costLabel: "100 🔷", top: "Win up to $0.10 · 150 pts", accent: "#35e0a1" },
  { tier: "premium", name: "Premium", emoji: "👑", cost: 150, costType: "stars", costLabel: "150 ⭐", top: "Win up to $1 · 10 ⭐", accent: "#ffd873" },
  { tier: "royal", name: "Royal", emoji: "💎", cost: 400, costType: "stars", costLabel: "400 ⭐", top: "Win up to $3 · 25 ⭐", accent: "#ff3fa4" },
];

export default function Box({ user, onChange }) {
  const [opening, setOpening] = useState(null);
  const [result, setResult] = useState(null);

  function canAfford(box) {
    const balance = box.costType === "stars" ? user?.stars_balance : user?.points_balance;
    return (balance ?? 0) >= box.cost;
  }

  async function openBox(tier) {
    if (opening) return;
    setOpening(tier);
    setResult(null);
    try {
      const prepared = await api.boxPrepare(tier);
      const res = await api.boxOpen(prepared.nonce);
      // let the shake animation play before revealing
      setTimeout(async () => {
        setResult(res);
        setOpening(null);
        await onChange();
      }, 900);
    } catch (err) {
      setOpening(null);
      setResult({ error: err.data?.error || "open_failed" });
    }
  }

  function prizeText(prize) {
    if (prize.type === "usdt") return `$${prize.value} USDT`;
    if (prize.type === "stars") return `+${prize.value} ⭐`;
    return `+${prize.value} Points`;
  }

  return (
    <div className="card">
      <div className="section-title">🎁 Lucky Boxes</div>
      <p className="muted" style={{ marginTop: 0 }}>Pick a box — every open is provably fair.</p>

      <div className="box-grid">
        {BOXES.map((box) => (
          <div
            className={"box" + (opening === box.tier ? " opening" : "")}
            key={box.tier}
            style={{ "--accent": box.accent }}
          >
            <span className="box-emoji">{box.emoji}</span>
            <span className="box-name">{box.name}</span>
            <span className="box-hint">{box.top}</span>
            <button
              className={"btn box-open-btn" + (opening || !canAfford(box) ? " disabled" : "")}
              onClick={() => openBox(box.tier)}
            >
              {opening === box.tier ? "Opening…" : `Open · ${box.costLabel}`}
            </button>
          </div>
        ))}
      </div>

      {result && !result.error && (
        <div className={"spin-result" + (result.prize.type === "nothing" ? "" : " win")}>
          <p style={{ fontWeight: 800, fontSize: 18, margin: "0 0 6px" }}>
            {result.prize.type === "nothing" ? "📭 Empty box — better luck next time!" : `🎉 You won ${prizeText(result.prize)}!`}
          </p>
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
            Hash: {result.result_hash.slice(0, 8)}… | Seed: {result.server_seed.slice(0, 8)}…
          </span>
        </div>
      )}
      {result?.error && (
        <div className="spin-result">
          <p style={{ fontWeight: 700, margin: 0 }}>
            ⚠️ {result.error === "insufficient_balance" ? "Not enough balance for that box." : result.error}
          </p>
        </div>
      )}

      <p className="muted" style={{ marginTop: 14 }}>
        Every box is provably fair: the server commits to a hidden seed (shown as a hash) before you open it, and reveals the seed right after — so the result couldn't have been chosen based on your action, and you can verify it independently.
      </p>
    </div>
  );
}

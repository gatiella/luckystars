import { useState } from "react";
import { api } from "../api.js";

export default function Box({ user, onChange }) {
  const [opening, setOpening] = useState(null);
  const [result, setResult] = useState(null);

  async function openBox(tier) {
    setOpening(tier);
    setResult(null);
    try {
      const prepared = await api.boxPrepare(tier);
      const res = await api.boxOpen(prepared.nonce);
      setResult(res);
      await onChange();
    } catch (err) {
      setResult({ error: err.data?.error || "open_failed" });
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="card">
      <div className="section-title">Lucky Boxes</div>
      <div className="box-grid">
        <div className="box">
          <span className="emoji">🎁</span>
          <span>Standard</span>
          <span className="muted">100 🔷</span>
          <button
            className={"btn" + (opening || (user?.points_balance ?? 0) < 100 ? " disabled" : "")}
            style={{ marginTop: 8 }}
            onClick={() => openBox("standard")}
          >
            {opening === "standard" ? "Opening…" : "Open"}
          </button>
        </div>
        <div className="box">
          <span className="emoji">👑</span>
          <span>Premium</span>
          <span className="muted">150 ⭐</span>
          <button
            className={"btn secondary" + (opening || (user?.stars_balance ?? 0) < 150 ? " disabled" : "")}
            style={{ marginTop: 8 }}
            onClick={() => openBox("premium")}
          >
            {opening === "premium" ? "Opening…" : "Open"}
          </button>
        </div>
      </div>

      {result && (
        <p style={{ textAlign: "center", marginTop: 18, fontWeight: 700 }}>
          {result.error
            ? "Not enough balance for that box."
            : result.prize.type === "nothing"
            ? "Empty box — better luck next time!"
            : `🎉 You won: ${result.prize.type === "usdt" ? `$${result.prize.value} USDT` : `${result.prize.value} points`}`}
        </p>
      )}
      <p className="muted" style={{ marginTop: 14 }}>
        Every box is provably fair: the server commits to a hidden seed (shown as a hash) before you open it, and reveals the seed right after — so the result couldn't have been chosen based on your action, and you can verify it independently.
      </p>
    </div>
  );
}

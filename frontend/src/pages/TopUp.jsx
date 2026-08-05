import { useState } from "react";
import { api } from "../api.js";

const PACKAGES = [
  { stars: 50, label: "50 Stars" },
  { stars: 150, label: "150 Stars" },
  { stars: 500, label: "500 Stars" },
];

export default function TopUp({ user, onChange }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function buy(stars) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.starsTopUp(stars);
      if (res.payment_url) {
        // If a payment URL is returned, open it (external provider)
        window.open(res.payment_url, "_blank");
        setMessage("Opened payment provider — complete purchase and return to the app.");
      } else if (res.ok) {
        setMessage(`Top-up complete. New balance: ${res.stars_balance}`);
        if (onChange) await onChange();
      }
    } catch (err) {
      setMessage(err.data?.error || err.message || "Top-up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="section-title">Buy Stars</div>
      <p className="muted">Use Stars to unlock premium spins and boxes.</p>

      {PACKAGES.map((p) => (
        <div className="list-row" key={p.stars} style={{ alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{p.label}</div>
            <div className="muted">Instant top-up (dev mode)</div>
          </div>
          <button className="btn" onClick={() => buy(p.stars)} disabled={loading}>
            {loading ? "Processing…" : `Buy ${p.label}`}
          </button>
        </div>
      ))}

      {message && <p className="muted" style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}

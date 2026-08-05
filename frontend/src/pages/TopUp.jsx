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
      // Prefer production Telegram Payments invoice when available
      const res = await api.starsCreateInvoice(stars).catch(() => null);
      if (res && res.ok) {
        setMessage("Invoice sent — please complete the payment in your Telegram chat. We'll credit stars after payment.");
      } else {
        // Fallback to dev top-up if allowed by server
        const dev = await api.starsTopUp(stars).catch((e) => { throw e; });
        setMessage(`Top-up complete. New balance: ${dev.stars_balance}`);
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
            <div className="muted">Instant top-up (dev/testing mode enabled on server)</div>
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

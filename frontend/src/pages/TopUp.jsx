import { useState } from "react";
import { api } from "../api.js";

const PACKAGES = [
  { stars: 10, label: "10 Stars" },
  { stars: 25, label: "25 Stars" },
  { stars: 50, label: "50 Stars" },
  { stars: 100, label: "100 Stars" },
  { stars: 150, label: "150 Stars" },
  { stars: 250, label: "250 Stars" },
  { stars: 500, label: "500 Stars" },
  { stars: 1000, label: "1000 Stars" },
];

export default function TopUp({ user, onChange }) {
  // Holds the star amount of the package being purchased, or null when idle
  const [loading, setLoading] = useState(null);
  const [message, setMessage] = useState(null);

  async function buy(stars) {
    setLoading(stars);
    setMessage(null);
    try {
      // Prefer a real Telegram Stars (XTR) invoice when available
      const res = await api.starsCreateInvoice(stars).catch(() => null);
      const tg = window.Telegram?.WebApp;
      if (res?.ok && res.invoice_link && tg?.openInvoice) {
        tg.openInvoice(res.invoice_link, (status) => {
          if (status === "paid") {
            setMessage("Payment successful! Your stars are being credited…");
            // The bot credits the balance when Telegram delivers successful_payment,
            // which can lag the callback by a moment — refresh shortly after.
            setTimeout(() => { if (onChange) onChange(); }, 1500);
          } else if (status === "cancelled") {
            setMessage("Payment cancelled.");
          } else {
            setMessage(`Payment ${status}.`);
          }
          setLoading(null);
        });
        return; // loading is cleared in the openInvoice callback
      }

      // Fallback to dev top-up if allowed by server
      const dev = await api.starsTopUp(stars).catch((e) => { throw e; });
      setMessage(`Top-up complete. New balance: ${dev.stars_balance}`);
      if (onChange) await onChange();
      setLoading(null);
    } catch (err) {
      setMessage(err.data?.error || err.message || "Top-up failed");
      setLoading(null);
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
            <div className="muted">Pay {p.stars} ⭐ via Telegram Stars</div>
          </div>
          <button className="btn" onClick={() => buy(p.stars)} disabled={loading !== null}>
            {loading === p.stars ? "Processing…" : `Buy ${p.label}`}
          </button>
        </div>
      ))}

      {message && <p className="muted" style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}

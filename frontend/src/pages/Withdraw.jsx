import { useEffect, useState } from "react";
import { api } from "../api.js";

const MIN = 10;

export default function Withdraw({ user, onChange }) {
  const [amount, setAmount] = useState("");
  const [wallet, setWallet] = useState("");
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.withdrawHistory().then((r) => setHistory(r.withdrawals)).catch(() => {});
  }, []);

  const balance = Number(user?.usdt_balance || 0);
  const canWithdraw = balance >= MIN;

  async function submit() {
    setSubmitting(true);
    setMsg(null);
    try {
      await api.withdraw({ amount_usdt: Number(amount), wallet });
      setMsg({ ok: true, text: "Withdrawal requested! We'll process it shortly." });
      setAmount("");
      setWallet("");
      await onChange();
      api.withdrawHistory().then((r) => setHistory(r.withdrawals));
    } catch (err) {
      setMsg({ ok: false, text: err.data?.error === "below_minimum" ? `Minimum withdrawal is $${MIN} USDT.` : "Withdrawal failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-title">Withdraw</div>
        <p className="muted">Balance: <strong style={{ color: "var(--gold-400)" }}>${balance.toFixed(2)} USDT</strong></p>
        <p className="muted">Minimum withdrawal: ${MIN} USDT — no deposits, levels, or wagering required.</p>

        <input
          type="number"
          placeholder={`Amount (min $${MIN})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          type="text"
          placeholder="USDT wallet address (TON)"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        />
        <button
          className={"btn" + (submitting || !canWithdraw ? " disabled" : "")}
          onClick={submit}
        >
          {submitting ? "Submitting…" : canWithdraw ? "Request Withdrawal" : `Need $${(MIN - balance).toFixed(2)} more`}
        </button>
        {msg && (
          <p className="muted" style={{ marginTop: 10, color: msg.ok ? "var(--success)" : "var(--danger)" }}>
            {msg.text}
          </p>
        )}
      </div>

      <div className="card">
        <div className="section-title">History</div>
        {history.length === 0 && <p className="muted">No withdrawals yet.</p>}
        {history.map((w) => (
          <div className="list-row" key={w.id}>
            <span>${Number(w.amount_usdt).toFixed(2)}</span>
            <span className={"badge" + (w.status === "paid" ? "" : " pending")}>{w.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

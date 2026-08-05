import { useEffect, useState } from "react";
import { api } from "../api.js";

const MIN = 10;
// Mirrors the backend check in routes/withdraw.js — TON address, 48 base64url chars
const TON_ADDRESS_RE = /^[A-Za-z0-9_-]{48}$/;

const ERROR_TEXT = {
  below_minimum: `Minimum withdrawal is $${MIN} USDT.`,
  invalid_wallet: "That doesn't look like a valid TON wallet address.",
  insufficient_balance: "Amount exceeds your available balance.",
};

const STATUS_BADGE = {
  paid: { label: "Paid", cls: "" },
  rejected: { label: "Rejected", cls: " danger" },
};

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
  const reachedMin = balance >= MIN;
  const progress = Math.min(100, (balance / MIN) * 100);

  const amountNum = Number(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum >= MIN && amountNum <= balance;
  const walletOk = TON_ADDRESS_RE.test(wallet.trim());
  const amountError = amount !== "" && !amountOk;
  const walletError = wallet !== "" && !walletOk;
  const canSubmit = reachedMin && amountOk && walletOk && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await api.withdraw({ amount_usdt: amountNum, wallet: wallet.trim() });
      setMsg({ ok: true, text: "✅ Withdrawal requested! We'll process it shortly." });
      setAmount("");
      setWallet("");
      await onChange();
      api.withdrawHistory().then((r) => setHistory(r.withdrawals));
    } catch (err) {
      setMsg({ ok: false, text: ERROR_TEXT[err.data?.error] || "Withdrawal failed — please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-title">💸 Withdraw USDT</div>

        <div className="withdraw-balance">
          <div>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Available balance</div>
            <div className="withdraw-amount">${balance.toFixed(2)}</div>
          </div>
          <span className="badge">TON · USDT</span>
        </div>

        {!reachedMin && (
          <div style={{ margin: "12px 0 4px" }}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="muted" style={{ margin: "6px 0 0", textAlign: "center" }}>
              ${(MIN - balance).toFixed(2)} to go until the ${MIN} minimum — keep spinning! 🎡
            </p>
          </div>
        )}

        <p className="muted" style={{ margin: "12px 0" }}>
          Minimum withdrawal: ${MIN} USDT — no deposits, levels, or wagering required.
        </p>

        <div className="amount-row">
          <input
            type="number"
            placeholder={`Amount (min $${MIN})`}
            value={amount}
            min={MIN}
            style={{ marginBottom: 0, ...(amountError ? { borderColor: "var(--danger)" } : {}) }}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button className="chip-btn" onClick={() => setAmount(String(MIN))}>Min</button>
          <button className="chip-btn" onClick={() => setAmount(balance.toFixed(2))}>Max</button>
        </div>
        {amountError && (
          <p className="field-error">
            {amountNum > balance ? "More than your balance." : `Minimum is $${MIN}.`}
          </p>
        )}

        <input
          type="text"
          placeholder="TON wallet address (starts with EQ… or UQ…)"
          value={wallet}
          style={walletError ? { borderColor: "var(--danger)" } : {}}
          onChange={(e) => setWallet(e.target.value)}
        />
        {walletError && <p className="field-error">TON addresses are 48 characters (letters, digits, - and _).</p>}

        <button className={"btn" + (canSubmit ? "" : " disabled")} onClick={submit}>
          {submitting
            ? "Submitting…"
            : !reachedMin
            ? `Need $${(MIN - balance).toFixed(2)} more`
            : "Request Withdrawal"}
        </button>

        {msg && (
          <div className={"spin-result" + (msg.ok ? " win" : "")}>
            <p style={{ fontWeight: 700, margin: 0, color: msg.ok ? "var(--success)" : "var(--danger)" }}>{msg.text}</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">History</div>
        {history.length === 0 && <p className="muted">No withdrawals yet — your payouts will show up here.</p>}
        {history.map((w) => {
          const badge = STATUS_BADGE[w.status] || { label: w.status, cls: " pending" };
          return (
            <div className="list-row" key={w.id}>
              <div>
                <div style={{ fontWeight: 700 }}>${Number(w.amount_usdt).toFixed(2)}</div>
                <div className="muted">
                  {w.requested_at ? new Date(w.requested_at).toLocaleDateString() : ""}
                  {w.wallet ? ` · ${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}` : ""}
                </div>
              </div>
              <span className={"badge" + badge.cls}>{badge.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

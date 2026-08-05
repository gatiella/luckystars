import { useEffect, useState } from "react";
import { api } from "../api.js";
import { showRewardedAd } from "../lib/adsgram.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtCountdown(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function Earn({ user, onChange }) {
  const [tasks, setTasks] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.tasks().then((r) => setTasks(r.tasks)).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nextDailyMs = user?.daily_spin_at
    ? Math.max(0, new Date(user.daily_spin_at).getTime() + DAY_MS - now)
    : 0;
  const dailyReady = nextDailyMs === 0;

  async function claimDaily() {
    if (!dailyReady || busy) return;
    setBusy("daily");
    setMsg(null);
    try {
      await api.dailySpin();
      setMsg({ ok: true, text: "🎡 +1 free spin claimed! Come back tomorrow for more." });
      await onChange();
    } catch (err) {
      setMsg({
        ok: false,
        text: err.data?.error === "already_claimed" ? "Already claimed — come back tomorrow!" : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function watchAd() {
    if (busy) return;
    setBusy("ad");
    setMsg(null);
    try {
      await showRewardedAd(); // only resolves if the ad was watched to completion
      const r = await api.adReward();
      setMsg({ ok: true, text: `🎡 +1 free spin! ${r.remaining_today} ad rewards left today.` });
      await onChange();
    } catch (err) {
      if (err?.data?.error === "daily_ad_cap_reached") {
        setMsg({ ok: false, text: "You've hit today's ad-reward limit — come back tomorrow!" });
      } else if (err?.message === "adsgram_block_id_missing" || err?.message === "adsgram_sdk_not_loaded") {
        setMsg({ ok: false, text: "Ads aren't live yet — check back soon!" });
      }
      // ad skipped/closed early: no reward, no message needed
    } finally {
      setBusy(null);
    }
  }

  async function completeTask(t) {
    if (busy) return;
    setBusy(`task-${t.id}`);
    try {
      if (t.target_url) window.open(t.target_url, "_blank");
      await api.completeTask(t.id);
      setMsg({ ok: true, text: `🎡 +${t.reward_spins} free spin${t.reward_spins > 1 ? "s" : ""} earned!` });
      await onChange();
      api.tasks().then((r) => setTasks(r.tasks));
    } catch {
      // already completed or failed — refresh list so the badge shows
      api.tasks().then((r) => setTasks(r.tasks));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card earn-hero">
        <div className="section-title">🎯 Earn Free Spins</div>
        <p className="muted" style={{ margin: 0 }}>
          Claim your daily bonus, watch ads, and finish tasks — every spin is a chance at real USDT.
        </p>
      </div>

      <div className="card">
        <div className="earn-tile">
          <div className="earn-icon" style={{ "--accent": "#ffd873" }}>📅</div>
          <div className="earn-info">
            <div className="earn-title">Daily Bonus</div>
            <div className="muted">
              {dailyReady ? "Your free spin is ready!" : `Next claim in ${fmtCountdown(nextDailyMs)}`}
            </div>
          </div>
          <div className="earn-action">
            <span className="reward-chip">+1 🎡</span>
            <button
              className={"btn earn-btn" + (dailyReady && !busy ? "" : " disabled")}
              onClick={claimDaily}
            >
              {busy === "daily" ? "…" : "Claim"}
            </button>
          </div>
        </div>

        <div className="earn-tile">
          <div className="earn-icon" style={{ "--accent": "#35e0a1" }}>▶️</div>
          <div className="earn-info">
            <div className="earn-title">Watch &amp; Earn</div>
            <div className="muted">1 spin per ad · up to 8 a day</div>
          </div>
          <div className="earn-action">
            <span className="reward-chip">+1 🎡</span>
            <button className={"btn earn-btn" + (busy ? " disabled" : "")} onClick={watchAd}>
              {busy === "ad" ? "…" : "Watch"}
            </button>
          </div>
        </div>

        {msg && (
          <p style={{ marginTop: 12, marginBottom: 0, fontWeight: 600, fontSize: 13, color: msg.ok ? "var(--success)" : "var(--danger)" }}>
            {msg.text}
          </p>
        )}
      </div>

      <div className="card">
        <div className="section-title">Tasks</div>
        {tasks.length === 0 && (
          <p className="muted">New tasks are coming soon — check back! 👀</p>
        )}
        {tasks.map((t) => (
          <div className="earn-tile" key={t.id}>
            <div className="earn-icon" style={{ "--accent": "#7c3aed" }}>
              {t.type === "join_channel" ? "📣" : t.type === "follow_x" ? "🐦" : "⚡"}
            </div>
            <div className="earn-info">
              <div className="earn-title">{t.title}</div>
              <div className="muted">One-time reward</div>
            </div>
            <div className="earn-action">
              <span className="reward-chip">+{t.reward_spins} 🎡</span>
              {t.completed ? (
                <span className="badge">Done</span>
              ) : (
                <button
                  className={"btn earn-btn" + (busy ? " disabled" : "")}
                  onClick={() => completeTask(t)}
                >
                  {busy === `task-${t.id}` ? "…" : "Go"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

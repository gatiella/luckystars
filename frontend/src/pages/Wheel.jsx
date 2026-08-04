import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { showRewardedAd } from "../lib/adsgram.js";

export default function Wheel({ user, onChange }) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [tasks, setTasks] = useState([]);
  const wheelRef = useRef(null);

  useEffect(() => {
    api.tasks().then((r) => setTasks(r.tasks)).catch(() => {});
  }, []);

  async function doSpin(tier) {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    try {
      // Step 1: server generates + stores the seed, we only get the hash (commit)
      const prepared = await api.spinPrepare(tier);

      // spin animation while we wait
      const extraTurns = 4 + Math.floor(Math.random() * 3);
      const finalDeg = extraTurns * 360 + Math.floor(Math.random() * 360);
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${finalDeg}deg)`;
      }

      // Step 2: resolve — server looks up the stored seed by nonce, we never sent it
      const res = await api.spin(prepared.nonce);

      setTimeout(async () => {
        setResult(res);
        setSpinning(false);
        await onChange();
      }, 4000);
    } catch (err) {
      setSpinning(false);
      setResult({ error: err.data?.error || "spin_failed" });
    }
  }

  async function claimDaily() {
    try {
      await api.dailySpin();
      await onChange();
    } catch (err) {
      alert(err.data?.error === "already_claimed" ? "Come back tomorrow for your next free spin!" : "Something went wrong");
    }
  }

  async function watchAd() {
    try {
      await showRewardedAd(); // only resolves if the ad was watched to completion
      await api.adReward();
      await onChange();
    } catch (err) {
      if (err?.data?.error === "daily_ad_cap_reached") {
        alert("You've hit today's ad-reward limit — come back tomorrow!");
      } else if (err?.message === "adsgram_block_id_missing" || err?.message === "adsgram_sdk_not_loaded") {
        alert("Ad network isn't configured yet — set VITE_ADSGRAM_BLOCK_ID.");
      } else {
        // ad skipped/closed early or failed to load — no reward, no error dialog needed
      }
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-title">✨ Spin the Wheel</div>
        <div className="wheel-wrap">
          <div style={{ position: "relative", filter: "drop-shadow(0 0 20px rgba(255,216,115,0.2))" }}>
            <div className="wheel-pointer" />
            <div className="wheel" ref={wheelRef} />
          </div>
        </div>
        <p className="muted" style={{ textAlign: "center", marginBottom: 16 }}>Free spins available: <span style={{ color: "#ffd873", fontWeight: 600 }}>{user?.free_spins ?? 0}</span></p>
        <button
          className={"btn" + (spinning || !user?.free_spins ? " disabled" : "")}
          onClick={() => doSpin("standard")}
          style={{ marginBottom: 10 }}
        >
          {spinning ? "🔄 Spinning…" : "🎡 Spin Free"}
        </button>
        <button
          className={"btn secondary" + (spinning || (user?.stars_balance ?? 0) < 50 ? " disabled" : "")}
          onClick={() => doSpin("premium")}
        >
          ⭐ Premium Spin (50 Stars — better odds)
        </button>

        {result && !result.error && (
          <div style={{ 
            textAlign: "center", 
            marginTop: 18, 
            padding: 14,
            background: "linear-gradient(135deg, rgba(255,216,115,0.1), rgba(255,63,164,0.1))",
            borderRadius: "14px",
            border: "1px solid rgba(255,216,115,0.3)",
            animation: "pulse 2s ease-in-out"
          }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              {result.prize.type === "nothing" ? "❌ No luck this time" : `🎉 ${result.prize.type === "usdt" ? `$${result.prize.value} USDT` : result.prize.type === "free_spin" ? `+${result.prize.value} Free Spin` : `+${result.prize.value} Points`}`}
            </p>
            <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
              Hash: {result.result_hash.slice(0, 8)}… | Seed: {result.server_seed.slice(0, 8)}…
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Earn More Spins</div>
        <button className="btn secondary" onClick={claimDaily} style={{ marginBottom: 10 }}>
          📅 Claim Daily Free Spin
        </button>
        <button className="btn secondary" onClick={watchAd}>
          ▶️ Watch Ad for a Free Spin
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="card">
          <div className="section-title">Tasks</div>
          {tasks.map((t) => (
            <div className="list-row" key={t.id}>
              <div>
                <div>{t.title}</div>
                <div className="muted">+{t.reward_spins} spin{t.reward_spins > 1 ? "s" : ""}</div>
              </div>
              {t.completed ? (
                <span className="badge">Done</span>
              ) : (
                <button
                  className="btn secondary"
                  style={{ width: "auto", padding: "8px 16px" }}
                  onClick={async () => {
                    if (t.target_url) window.open(t.target_url, "_blank");
                    await api.completeTask(t.id);
                    await onChange();
                    api.tasks().then((r) => setTasks(r.tasks));
                  }}
                >
                  Go
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

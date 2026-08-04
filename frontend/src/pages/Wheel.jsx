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
        <div className="section-title">Spin the Wheel</div>
        <div className="wheel-wrap">
          <div style={{ position: "relative" }}>
            <div className="wheel-pointer" />
            <div className="wheel" ref={wheelRef} />
          </div>
        </div>
        <p className="muted" style={{ textAlign: "center" }}>Free spins available: {user?.free_spins ?? 0}</p>
        <button
          className={"btn" + (spinning || !user?.free_spins ? " disabled" : "")}
          onClick={() => doSpin("standard")}
        >
          {spinning ? "Spinning…" : "Spin Free"}
        </button>
        <div style={{ height: 10 }} />
        <button
          className={"btn secondary" + (spinning || (user?.stars_balance ?? 0) < 50 ? " disabled" : "")}
          onClick={() => doSpin("premium")}
        >
          ⭐ Premium Spin (50 Stars — better odds)
        </button>

        {result && !result.error && (
          <p style={{ textAlign: "center", marginTop: 14, fontWeight: 700 }}>
            {result.prize.type === "nothing" ? "No luck this time — try again!" : `🎉 You won: ${result.prize.type === "usdt" ? `$${result.prize.value} USDT` : result.prize.type === "free_spin" ? `${result.prize.value} free spin` : `${result.prize.value} points`}`}
            <br />
            <span className="muted" style={{ fontWeight: 400 }}>
              Seed: {result.server_seed.slice(0, 10)}… · Hash: {result.result_hash.slice(0, 10)}…
            </span>
          </p>
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

import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { showRewardedAd } from "../lib/adsgram.js";

const STANDARD_PRIZES = [
  { key: "usdt_0.05", weight: 8, type: "usdt", value: 0.05, label: "$0.05" },
  { key: "usdt_0.1", weight: 3, type: "usdt", value: 0.1, label: "$0.1" },
  { key: "points_50", weight: 30, type: "points", value: 50, label: "50 pts" },
  { key: "points_20", weight: 34, type: "points", value: 20, label: "20 pts" },
  { key: "spin_1", weight: 15, type: "free_spin", value: 1, label: "+1 🎡" },
  { key: "nothing", weight: 10, type: "nothing", value: 0, label: "❌" },
];

const PREMIUM_PRIZES = [
  { key: "usdt_0.5", weight: 10, type: "usdt", value: 0.5, label: "$0.5" },
  { key: "usdt_1", weight: 5, type: "usdt", value: 1, label: "$1" },
  { key: "usdt_0.2", weight: 20, type: "usdt", value: 0.2, label: "$0.2" },
  { key: "points_200", weight: 25, type: "points", value: 200, label: "200 pts" },
  { key: "spin_1", weight: 25, type: "free_spin", value: 1, label: "+1 🎡" },
  { key: "nothing", weight: 15, type: "nothing", value: 0, label: "❌" },
];

function WheelSVG({ prizes, isSpinning }) {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  const segments = [];
  let cumulativeDeg = 0;

  prizes.forEach((prize) => {
    const segmentDeg = (prize.weight / totalWeight) * 360;
    const midDeg = cumulativeDeg + segmentDeg / 2;
    segments.push({
      ...prize,
      startDeg: cumulativeDeg,
      endDeg: cumulativeDeg + segmentDeg,
      midDeg,
    });
    cumulativeDeg += segmentDeg;
  });

  const colors = ["#ffd873", "#6b3fb8", "#ff3fa4", "#00d9a3", "#f5a623", "#8b5cf6"];

  return (
    <svg width="280" height="280" viewBox="0 0 280 280" style={{ filter: "drop-shadow(0 0 20px rgba(255,216,115,0.2))", transform: isSpinning ? "rotate(0deg)" : "rotate(0deg)" }}>
      {segments.map((seg, i) => {
        const color = colors[i % colors.length];
        const startRad = (seg.startDeg * Math.PI) / 180;
        const endRad = (seg.endDeg * Math.PI) / 180;
        const r = 120;
        const x1 = 140 + r * Math.cos(startRad);
        const y1 = 140 + r * Math.sin(startRad);
        const x2 = 140 + r * Math.cos(endRad);
        const y2 = 140 + r * Math.sin(endRad);
        const largeArc = seg.endDeg - seg.startDeg > 180 ? 1 : 0;
        const pathData = `M 140 140 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        const labelRad = (seg.midDeg * Math.PI) / 180;
        const labelR = 85;
        const labelX = 140 + labelR * Math.cos(labelRad);
        const labelY = 140 + labelR * Math.sin(labelRad);

        return (
          <g key={seg.key}>
            <path d={pathData} fill={color} stroke="#ffd873" strokeWidth="2" />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#0f0620"
              fontSize="12"
              fontWeight="700"
              transform={`rotate(${seg.midDeg + 90} ${labelX} ${labelY})`}
            >
              {seg.label}
            </text>
          </g>
        );
      })}

      {/* Center gem */}
      <circle cx="140" cy="140" r="32" fill="url(#gemGradient)" stroke="#ffd873" strokeWidth="2" />
      <text x="140" y="145" textAnchor="middle" fill="#0f0620" fontSize="20" fontWeight="700">
        TAP
      </text>

      {/* Gradients */}
      <defs>
        <radialGradient id="gemGradient" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#fff9e6" />
          <stop offset="100%" stopColor="#ffd873" />
        </radialGradient>
      </defs>
    </svg>
  );
}

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
          <div style={{ position: "relative", transform: `rotate(0deg)`, transition: "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" }} ref={wheelRef}>
            <div className="wheel-pointer" />
            <WheelSVG prizes={STANDARD_PRIZES} isSpinning={spinning} />
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

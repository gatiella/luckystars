import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

// Wheel segments mirror the server prize tables in backend/src/routes/spin.js.
// Display order is cosmetic (outcomes are matched by key), arranged to mix prize types.
const STANDARD_PRIZES = [
  { key: "points_20", label: "20 pts" },
  { key: "usdt_0.05", label: "$0.05" },
  { key: "points_50", label: "50 pts" },
  { key: "stars_1", label: "1 ⭐" },
  { key: "nothing", label: "MISS" },
  { key: "points_100", label: "100 pts" },
  { key: "usdt_0.1", label: "$0.10" },
  { key: "spin_1", label: "+1 SPIN" },
  { key: "stars_3", label: "3 ⭐" },
  { key: "usdt_0.25", label: "$0.25" },
];

const PREMIUM_PRIZES = [
  { key: "points_200", label: "200 pts" },
  { key: "usdt_0.2", label: "$0.20" },
  { key: "stars_5", label: "5 ⭐" },
  { key: "nothing", label: "MISS" },
  { key: "usdt_0.5", label: "$0.50" },
  { key: "points_500", label: "500 pts" },
  { key: "spin_1", label: "+1 SPIN" },
  { key: "usdt_1", label: "$1" },
  { key: "stars_10", label: "10 ⭐" },
  { key: "usdt_2", label: "$2" },
];

// Segment fill + readable label color pairs, cycled around the wheel
const SEGMENT_COLORS = [
  { fill: "#ffd873", text: "#241245" },
  { fill: "#7c3aed", text: "#ffffff" },
  { fill: "#ff3fa4", text: "#ffffff" },
  { fill: "#35e0a1", text: "#0f0620" },
  { fill: "#4f8ef7", text: "#ffffff" },
];

const SIZE = 300;
const C = SIZE / 2; // center
const R_SEG = 128; // segment radius
const R_RIM = 140; // rim radius
const R_LABEL = 86; // label anchor radius

function polar(deg, r) {
  const rad = ((deg - 90) * Math.PI) / 180; // 0° = top, clockwise
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function WheelSVG({ prizes }) {
  const seg = 360 / prizes.length;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block" }}>
      <defs>
        <radialGradient id="hubGradient" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#fff9e6" />
          <stop offset="100%" stopColor="#ffd873" />
        </radialGradient>
        <linearGradient id="rimGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffe9a8" />
          <stop offset="45%" stopColor="#d9a12e" />
          <stop offset="100%" stopColor="#8a5f14" />
        </linearGradient>
      </defs>

      {/* Rim */}
      <circle cx={C} cy={C} r={R_RIM} fill="none" stroke="url(#rimGradient)" strokeWidth="12" />

      {/* Segments */}
      {prizes.map((prize, i) => {
        const start = i * seg;
        const end = start + seg;
        const mid = start + seg / 2;
        const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        const [x1, y1] = polar(start, R_SEG);
        const [x2, y2] = polar(end, R_SEG);
        const [lx, ly] = polar(mid, R_LABEL);

        return (
          <g key={prize.key}>
            <path
              d={`M ${C} ${C} L ${x1} ${y1} A ${R_SEG} ${R_SEG} 0 0 1 ${x2} ${y2} Z`}
              fill={color.fill}
              stroke="#1a0b33"
              strokeWidth="1.5"
            />
            {/* Radial label: reads from the hub toward the rim */}
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={color.text}
              fontSize="13"
              fontWeight="800"
              fontFamily="'Space Grotesk', 'Sora', sans-serif"
              transform={`rotate(${mid - 90} ${lx} ${ly})`}
            >
              {prize.label}
            </text>
          </g>
        );
      })}

      {/* Rim lights at segment boundaries */}
      {prizes.map((prize, i) => {
        const [bx, by] = polar(i * seg, R_RIM);
        return (
          <circle
            key={`light-${prize.key}`}
            cx={bx}
            cy={by}
            r="3.5"
            fill={i % 2 === 0 ? "#fff9e6" : "#ffd873"}
            style={{ filter: "drop-shadow(0 0 3px rgba(255,216,115,0.9))" }}
          />
        );
      })}

      {/* Hub */}
      <circle cx={C} cy={C} r="34" fill="url(#hubGradient)" stroke="#8a5f14" strokeWidth="3" />
      <circle cx={C} cy={C} r="26" fill="none" stroke="rgba(138,95,20,0.35)" strokeWidth="1" />
      <text x={C} y={C + 1} textAnchor="middle" dominantBaseline="middle" fontSize="26">
        ⭐
      </text>
    </svg>
  );
}

export default function Wheel({ user, onChange }) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [displayTier, setDisplayTier] = useState("standard");
  const wheelRef = useRef(null);
  const rotationRef = useRef(0);

  async function doSpin(tier, cost) {
    if (spinning) return;
    const wheelTier = tier === "premium" ? "premium" : "standard";
    setDisplayTier(wheelTier);
    setSpinning(true);
    setResult(null);
    try {
      // Step 1: server generates + stores the seed, we only get the hash (commit)
      const prepared = await api.spinPrepare(tier, cost);
      // Step 2: resolve — server looks up the stored seed by nonce, we never sent it
      const res = await api.spin(prepared.nonce);

      // Land the pointer on the segment that was actually won
      const prizes = wheelTier === "premium" ? PREMIUM_PRIZES : STANDARD_PRIZES;
      const segDeg = 360 / prizes.length;
      const idx = Math.max(0, prizes.findIndex((p) => p.key === res.prize.key));
      const jitter = (Math.random() - 0.5) * segDeg * 0.6;
      const targetWithinTurn = (360 - (idx * segDeg + segDeg / 2 + jitter)) % 360;
      const fullTurns = 5 + Math.floor(Math.random() * 2);
      const base = rotationRef.current - (rotationRef.current % 360);
      const target = base + fullTurns * 360 + targetWithinTurn;
      rotationRef.current = target;

      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${target}deg)`;
      }

      setTimeout(async () => {
        setResult(res);
        setSpinning(false);
        await onChange();
      }, 4700);
    } catch (err) {
      setSpinning(false);
      setResult({ error: err.data?.error || "spin_failed" });
    }
  }

  function prizeText(prize) {
    if (prize.type === "usdt") return `$${prize.value} USDT`;
    if (prize.type === "free_spin") return `+${prize.value} Free Spin`;
    if (prize.type === "stars") return `+${prize.value} ⭐`;
    return `+${prize.value} Points`;
  }

  return (
    <>
      <div className="card">
        <div className="section-title">✨ Spin the Wheel</div>

        <div className="tier-tabs">
          <button
            className={"tier-tab" + (displayTier === "standard" ? " active" : "")}
            onClick={() => !spinning && setDisplayTier("standard")}
          >
            🎡 Standard
          </button>
          <button
            className={"tier-tab" + (displayTier === "premium" ? " active" : "")}
            onClick={() => !spinning && setDisplayTier("premium")}
          >
            👑 Premium
          </button>
        </div>

        <div className="wheel-wrap">
          <div className="wheel-stage">
            <div className="wheel-pointer" />
            <div className="wheel-spinner" ref={wheelRef}>
              <WheelSVG prizes={displayTier === "premium" ? PREMIUM_PRIZES : STANDARD_PRIZES} />
            </div>
          </div>
        </div>

        <p className="muted" style={{ textAlign: "center", marginBottom: 16 }}>
          Free spins available: <span style={{ color: "#ffd873", fontWeight: 600 }}>{user?.free_spins ?? 0}</span>
        </p>
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
          👑 Premium Spin (50 ⭐ — bigger prizes)
        </button>

        <div style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 8, fontWeight: 700 }}>Pay-with-Stars Spins</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[5, 10, 20].map((amt) => (
              <button
                key={amt}
                className={"btn secondary" + (spinning || (user?.stars_balance ?? 0) < amt ? " disabled" : "")}
                onClick={() => doSpin("stars", amt)}
              >
                ⭐ {amt}
              </button>
            ))}
          </div>
        </div>

        {result && !result.error && (
          <div className={"spin-result" + (result.prize.type === "nothing" ? "" : " win")}>
            <p style={{ fontWeight: 800, fontSize: 18, margin: "0 0 6px" }}>
              {result.prize.type === "nothing" ? "😔 No luck this time" : `🎉 You won ${prizeText(result.prize)}!`}
            </p>
            <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
              Hash: {result.result_hash.slice(0, 8)}… | Seed: {result.server_seed.slice(0, 8)}…
            </span>
          </div>
        )}
        {result?.error && (
          <div className="spin-result">
            <p style={{ fontWeight: 700, margin: 0 }}>⚠️ {result.error}</p>
          </div>
        )}
        {!spinning && !user?.free_spins && (
          <p className="muted" style={{ textAlign: "center", marginTop: 12, marginBottom: 0 }}>
            Out of free spins? <Link to="/earn" style={{ color: "var(--gold-400)", fontWeight: 700 }}>Earn more on the Tasks tab →</Link>
          </p>
        )}
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api.js";

const AVATAR_COLORS = ["#7c3aed", "#ff3fa4", "#35e0a1", "#4f8ef7", "#f5a623"];

function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function Countdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, nextMonday().getTime() - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div className="countdown">
      {[["Days", d], ["Hrs", h], ["Min", m], ["Sec", s]].map(([label, v]) => (
        <div className="countdown-cell" key={label}>
          <div className="countdown-num">{pad(v)}</div>
          <div className="countdown-label">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Avatar({ name, index, size = 40 }) {
  return (
    <div
      className="rank-avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
    >
      {(name || "P").slice(0, 1).toUpperCase()}
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function prizeText(a) {
  if (a.prize_type === "usdt") return `$${Number(a.prize_value)} USDT`;
  if (a.prize_type === "stars") return `${Number(a.prize_value)} ⭐`;
  if (a.prize_type === "free_spin") return `+${Number(a.prize_value)} free spin`;
  return `${Number(a.prize_value)} pts`;
}

export default function Leaderboard({ user }) {
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.leaderboard().then((r) => { setRows(r.leaderboard); setMe(r.me); }).catch(() => {});
    const load = () => api.statsOverview().then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 20000); // keep the wins feed fresh
    return () => clearInterval(t);
  }, []);

  function shareInvite() {
    const bot = import.meta.env.VITE_BOT_USERNAME || "your_bot";
    const link = `https://t.me/share/url?url=${encodeURIComponent(
      `https://t.me/${bot}?start=${user?.tg_id}`
    )}&text=${encodeURIComponent("Spin, open Lucky Boxes, and cash out real USDT — join me on LuckyStars! 🎰")}`;
    window.Telegram?.WebApp?.openTelegramLink?.(link);
  }

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  // podium display order: #2 left, #1 center, #3 right
  const podiumOrder = [podium[1], podium[0], podium[2]];

  return (
    <>
      {/* Weekly contest banner */}
      <div className="card contest-banner">
        <div className="contest-flare">🏆</div>
        <div className="section-title" style={{ marginBottom: 4 }}>Weekly Invite Contest</div>
        <p className="muted" style={{ margin: "0 0 10px" }}>
          Prize pool split among the top inviters every Monday. Every invite = 1 free spin, instantly.
        </p>
        <Countdown />
        <button className="btn" style={{ marginTop: 14 }} onClick={shareInvite}>
          🚀 Invite &amp; Climb the Ranks
        </button>
      </div>

      {/* Real global stats */}
      {stats && (
        <div className="stats-strip">
          <div className="stat-tile">
            <div className="stat-num">{stats.players}</div>
            <div className="stat-label">Players</div>
          </div>
          <div className="stat-tile">
            <div className="stat-num">{stats.spins_24h}</div>
            <div className="stat-label">Spins · 24h</div>
          </div>
          <div className="stat-tile">
            <div className="stat-num">${Number(stats.usdt_won).toFixed(2)}</div>
            <div className="stat-label">USDT won</div>
          </div>
        </div>
      )}

      {/* Podium */}
      <div className="card">
        <div className="section-title">🏆 Top Referrers This Week</div>
        {rows.length === 0 ? (
          <div className="podium-empty">
            <div style={{ fontSize: 34 }}>👑</div>
            <p style={{ fontWeight: 700, margin: "6px 0 2px" }}>The podium is wide open!</p>
            <p className="muted" style={{ margin: 0 }}>
              Nobody has claimed #1 this week yet — a single invite could put you on top.
            </p>
            <button className="btn" style={{ marginTop: 12 }} onClick={shareInvite}>
              Claim the #1 Spot
            </button>
          </div>
        ) : (
          <>
            <div className="podium">
              {podiumOrder.map((r, i) => {
                if (!r) return <div className="podium-slot" key={i} />;
                const place = i === 1 ? 1 : i === 0 ? 2 : 3;
                return (
                  <div className={`podium-slot place-${place}`} key={place}>
                    <div className="podium-medal">{place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉"}</div>
                    <Avatar name={r.first_name || r.username} index={place} size={place === 1 ? 54 : 42} />
                    <div className="podium-name">{r.first_name || r.username || "Player"}</div>
                    <div className="podium-count">{r.invite_count} invites</div>
                    <div className={`podium-bar bar-${place}`} />
                  </div>
                );
              })}
            </div>
            {rest.map((r, i) => (
              <div className="list-row" key={i + 3}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="rank-num">#{i + 4}</span>
                  <Avatar name={r.first_name || r.username} index={i} size={30} />
                  {r.first_name || r.username || "Player"}
                </span>
                <span className="muted">{r.invite_count} invites</span>
              </div>
            ))}
          </>
        )}

        {/* Your rank */}
        <div className="my-rank">
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="rank-num" style={{ color: "#ffd873" }}>{me ? `#${me.rank}` : "—"}</span>
            <Avatar name={user?.first_name || user?.username} index={2} size={30} />
            You
          </span>
          <span className="muted">
            {me ? `${me.invite_count} invites this week` : "Invite 1 friend to enter the ranks"}
          </span>
        </div>
      </div>

      {/* Live wins feed (real events) */}
      <div className="card">
        <div className="section-title">
          <span className="live-dot" /> Latest Wins
        </div>
        {(!stats || stats.activity.length === 0) && (
          <p className="muted">Wins will appear here as players spin — go take the first one! 🎡</p>
        )}
        {stats?.activity.map((a, i) => (
          <div className="win-row" key={`${a.created_at}-${i}`} style={{ animationDelay: `${i * 60}ms` }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span>{a.source === "box" ? "🎁" : "🎡"}</span>
              <span className="win-name">{a.name}</span>
              <span className="muted">won</span>
              <span className="win-prize">{prizeText(a)}</span>
            </span>
            <span className="muted" style={{ flexShrink: 0 }}>{timeAgo(a.created_at)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.leaderboard().then((r) => setRows(r.leaderboard)).catch(() => {});
  }, []);

  return (
    <div className="card">
      <div className="section-title">🏆 Top Referrers This Week</div>
      <p className="muted">Prize pool split among the top inviters every Monday.</p>
      {rows.length === 0 && <p className="muted">No data yet this week — be the first!</p>}
      {rows.map((r, i) => (
        <div className="list-row" key={i}>
          <span>#{i + 1} {r.first_name || r.username || "Player"}</span>
          <span className="muted">{r.invite_count} invites</span>
        </div>
      ))}
    </div>
  );
}

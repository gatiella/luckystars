import { Link } from "react-router-dom";

export default function Header({ user }) {
  return (
    <div className="header">
      <div className="header-top">
        <div className="logo">✨ LuckyStars</div>
        <Link to="/topup" className="topup-btn">＋ Top up</Link>
      </div>
      <div className="balance-bar">
        <div className="balance-chip">
          <span className="chip-icon">💵</span>
          <div>
            <div className="chip-value usdt">${Number(user?.usdt_balance || 0).toFixed(2)}</div>
            <div className="chip-label">USDT</div>
          </div>
        </div>
        <div className="balance-chip">
          <span className="chip-icon">⭐</span>
          <div>
            <div className="chip-value">{user?.stars_balance ?? 0}</div>
            <div className="chip-label">Stars</div>
          </div>
        </div>
        <div className="balance-chip">
          <span className="chip-icon">🔷</span>
          <div>
            <div className="chip-value">{user?.points_balance ?? 0}</div>
            <div className="chip-label">Points</div>
          </div>
        </div>
      </div>
    </div>
  );
}

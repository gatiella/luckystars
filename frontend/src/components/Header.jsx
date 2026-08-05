export default function Header({ user }) {
  return (
    <div className="header">
      <div className="logo">✨ LuckyStars</div>
      <div className="balance-pill">
        <span className="usdt">${Number(user?.usdt_balance || 0).toFixed(2)}</span>
        <span>
          ⭐ {user?.stars_balance ?? 0}
          <button
            className="btn"
            style={{ marginLeft: 8, padding: "4px 8px", fontSize: 12 }}
            onClick={() => (window.location = "/topup")}
          >
            Top up
          </button>
        </span>
        <span>🔷 {user?.points_balance ?? 0}</span>
      </div>
    </div>
  );
}

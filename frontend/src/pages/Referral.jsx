import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Referral({ user }) {
  const [tree, setTree] = useState([]);
  const [botUsername] = useState(import.meta.env.VITE_BOT_USERNAME || "LuckystarsApp_bot");

  useEffect(() => {
    api.referralTree().then((r) => setTree(r.referrals)).catch(() => {});
  }, []);

  const link = `https://t.me/${botUsername}?start=${user?.tg_id}`;
  const inviteCount = tree.length;

  function copyLink() {
    navigator.clipboard.writeText(link);
    window.Telegram?.WebApp?.showPopup?.({ message: "Invite link copied!" });
  }

  function shareLink() {
    window.Telegram?.WebApp?.openTelegramLink?.(
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Spin, open Lucky Boxes, and cash out real USDT — join me on LuckyStars! 🎰")}`
    );
  }

  const milestones = [
    { count: 5, label: "Bonus spins", reached: inviteCount >= 5 },
    { count: 20, label: "VIP badge", reached: inviteCount >= 20 },
    { count: 50, label: "Withdrawal fee waived", reached: inviteCount >= 50 },
  ];

  return (
    <>
      <div className="card">
        <div className="section-title">Invite Friends</div>
        <p className="muted">Get a free spin for every friend who joins. No limit.</p>
        <button className="btn" onClick={shareLink}>Share Invite Link</button>
        <div style={{ height: 10 }} />
        <button className="btn secondary" onClick={copyLink}>Copy Link</button>
      </div>

      <div className="card">
        <div className="section-title">Milestones — {inviteCount} invites so far</div>
        {milestones.map((m) => (
          <div className="list-row" key={m.count}>
            <span>Invite {m.count} → {m.label}</span>
            <span className={"badge" + (m.reached ? "" : " pending")}>{m.reached ? "Unlocked" : "Locked"}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">Your Referrals</div>
        {tree.length === 0 && <p className="muted">No invites yet — share your link to start earning.</p>}
        {tree.map((t) => (
          <div className="list-row" key={t.id}>
            <span>{t.first_name || t.username || "Friend"}</span>
            <span className="muted">{t.sub_invites} sub-invites</span>
          </div>
        ))}
      </div>
    </>
  );
}

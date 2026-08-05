import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Header from "./components/Header.jsx";
import Wheel from "./pages/Wheel.jsx";
import Box from "./pages/Box.jsx";
import Referral from "./pages/Referral.jsx";
import Withdraw from "./pages/Withdraw.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import TopUp from "./pages/TopUp.jsx";
import { api } from "./api.js";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const { user } = await api.me();
    setUser(user);
    return user;
  }

  useEffect(() => {
    (async () => {
      try {
        const u = await refresh();
        // handle referral deep link: t.me/bot?start=<tg_id> -> WebApp start_param
        const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
        if (startParam && !u.referred_by) {
          await api.referralClaim(startParam).catch(() => {});
          await refresh();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading LuckyStars…</div>;
  }

  return (
    <>
      <Header user={user} />
      <Routes>
        <Route path="/" element={<Wheel user={user} onChange={refresh} />} />
        <Route path="/box" element={<Box user={user} onChange={refresh} />} />
        <Route path="/referral" element={<Referral user={user} />} />
        <Route path="/withdraw" element={<Withdraw user={user} onChange={refresh} />} />
        <Route path="/topup" element={<TopUp user={user} onChange={refresh} />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Routes>
      <Nav />
    </>
  );
}

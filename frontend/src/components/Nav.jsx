import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", icon: "🎡", label: "Wheel" },
  { to: "/box", icon: "🎁", label: "Boxes" },
  { to: "/earn", icon: "🎯", label: "Tasks" },
  { to: "/referral", icon: "👥", label: "Invite" },
  { to: "/withdraw", icon: "💵", label: "Withdraw" },
  { to: "/leaderboard", icon: "🏆", label: "Ranks" },
];

export default function Nav() {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => "tab" + (isActive ? " active" : "")} end={t.to === "/"}>
          <span className="icon">{t.icon}</span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

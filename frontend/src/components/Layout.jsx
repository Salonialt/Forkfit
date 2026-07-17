import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Leaf, LayoutDashboard, Utensils, Camera, MessageSquare, ShoppingBasket, LogOut, User } from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/meal-plan", label: "Meal Plan", icon: Utensils, tid: "nav-meal-plan" },
  { to: "/scan", label: "Food Scan", icon: Camera, tid: "nav-scan" },
  { to: "/chat", label: "AI Coach", icon: MessageSquare, tid: "nav-chat" },
  { to: "/grocery", label: "Grocery", icon: ShoppingBasket, tid: "nav-grocery" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 font-display font-bold text-xl" style={{ color: "var(--text)" }} data-testid="brand-logo">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}>
              <Leaf size={18} color="white" />
            </span>
            forkfit
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((it) => (
              <NavLink key={it.to} to={it.to} data-testid={it.tid}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
                    isActive ? "bg-[#4A6B53] text-white" : "text-[#1E2B22] hover:bg-[#EFEDE9]"
                  }`
                }>
                <it.icon size={16} /> {it.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
              <User size={16} /> {user?.name || "You"}
            </div>
            <button className="pill-btn pill-btn-ghost text-sm flex items-center gap-2" data-testid="logout-btn"
              onClick={async () => { await logout(); nav("/login"); }}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
        <nav className="md:hidden border-t flex overflow-x-auto" style={{ borderColor: "var(--border)" }}>
          {navItems.map((it) => (
            <NavLink key={it.to} to={it.to} data-testid={`m-${it.tid}`}
              className={({ isActive }) =>
                `flex-1 min-w-fit text-center py-2 px-3 text-xs ${isActive ? "text-[#4A6B53] font-semibold" : "text-[#5E7363]"}`}>
              {it.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
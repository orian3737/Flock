import React, { useEffect, useState } from "react";
import {
  Bird,
  ClipboardList,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Scale,
  Settings,
  TrendingUp,
  Tractor,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useFarm } from "../context/FarmContext";
import { getQueue } from "../services/scaleHouseApi";
import { getOpenFollowUps } from "../services/observationsApi";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/flocks", label: "Flocks", icon: Bird },
  { to: "/log", label: "Farm Log", icon: ClipboardList },
  { to: "/scale-house", label: "Scale House", icon: Scale },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/financials", label: "Financials", icon: TrendingUp },
  { to: "/export", label: "Export", icon: Download },
  { to: "/farm-setup", label: "Farm Setup", icon: Tractor },
  { to: "/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { farmName, userId } = useFarm();
  const [unfedCount, setUnfedCount] = useState(0);
  const [followUpCount, setFollowUpCount] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  useEffect(() => {
    let mounted = true;

    async function loadBadge() {
      if (!userId) { setUnfedCount(0); return; }
      try {
        const queue = await getQueue(userId);
        if (mounted) setUnfedCount(queue.filter((f) => !f.fed_today).length);
      } catch {
        if (mounted) setUnfedCount(0);
      }
    }

    loadBadge();
    const intervalId = window.setInterval(loadBadge, 60000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    async function loadFollowUps() {
      if (!userId) { setFollowUpCount(0); return; }
      try {
        const data = await getOpenFollowUps(userId);
        if (mounted) setFollowUpCount(data.length);
      } catch {
        if (mounted) setFollowUpCount(0);
      }
    }
    loadFollowUps();
    const id = window.setInterval(loadFollowUps, 60000);
    return () => { mounted = false; window.clearInterval(id); };
  }, [userId]);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="lg:grid min-h-screen" style={{ gridTemplateColumns: "240px minmax(0,1fr)" }}>

      {/* ── Mobile top bar (hidden on desktop) ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-[60] flex items-center gap-3 h-14 px-4 bg-base-200 border-b border-[var(--border)]">
        <button
          className="inline-flex items-center justify-center bg-transparent border-0 text-[var(--text-secondary)] h-9 w-9 p-0 flex-none"
          type="button"
          aria-label="Open menu"
          onClick={() => setNavOpen(true)}
        >
          <Menu size={22} />
        </button>
        <span className="display-font text-[22px] leading-none text-[var(--text-primary)]">Flock</span>
        <span className="text-[var(--text-muted)] text-xs truncate min-w-0">{farmName || "Flock Farm"}</span>
      </div>

      {/* ── Backdrop (mobile only, when drawer open) ── */}
      {navOpen ? (
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-black/60"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      {/* ── Sidebar / drawer ── */}
      <aside
        className={[
          "bg-base-200 border-r border-[var(--border)] fixed top-0 left-0 flex flex-col h-screen w-60 px-4 py-6",
          "z-[60] transition-transform duration-200",
          "lg:z-auto lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ gap: "2rem" }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="display-font text-[30px] leading-none text-[var(--text-primary)]">Flock</div>
            <div className="text-[var(--text-secondary)] text-xs mt-2">{farmName || "Flock Farm"}</div>
          </div>
          <button
            className="lg:hidden inline-flex items-center justify-center bg-transparent border-0 text-[var(--text-secondary)] h-9 w-9 p-0 flex-none mt-1"
            type="button"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="grid gap-1.5 flex-1 overflow-y-auto" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 min-h-[42px] px-3 py-2.5 rounded-md border-l-[3px] transition-colors ${
                    isActive
                      ? "bg-base-300 border-l-primary text-[var(--text-primary)]"
                      : "border-l-transparent text-[var(--text-secondary)] hover:bg-base-300 hover:text-[var(--text-primary)]"
                  }`
                }
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                {item.to === "/scale-house" && unfedCount > 0 ? (
                  <span className="ml-auto flex items-center justify-center bg-warning text-[#071107] font-mono text-[11px] font-bold rounded-full h-[22px] min-w-[22px] px-1.5">
                    {unfedCount}
                  </span>
                ) : null}
                {item.to === "/log" && followUpCount > 0 ? (
                  <span className="ml-auto flex items-center justify-center bg-[var(--accent-warn)] text-[#071107] font-mono text-[11px] font-bold rounded-full h-[22px] min-w-[22px] px-1.5">
                    {followUpCount}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <button
          className="flex items-center gap-2.5 justify-start min-h-[42px] px-3 py-2.5 w-full rounded-md border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-base-300 hover:text-[var(--text-primary)] transition-colors"
          type="button"
          onClick={handleSignOut}
        >
          <LogOut size={18} aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </aside>

      {/* ── Main content ── */}
      {/* pt-20 reserves space below the fixed mobile top bar (h-14=56px + p-6=24px) */}
      <main className="bg-base-100 lg:col-start-2 min-h-screen p-6 pt-20 lg:pt-6">
        <div className="max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AppLayout;

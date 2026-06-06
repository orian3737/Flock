import React, { useEffect, useState } from "react";
import {
  Bird,
  Download,
  LayoutDashboard,
  LogOut,
  Package,
  Scale,
  Settings,
  TrendingUp,
  Tractor,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useFarm } from "../context/FarmContext";
import { getQueue } from "../services/scaleHouseApi";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/flocks", label: "Flocks", icon: Bird },
  { to: "/scale-house", label: "Scale House", icon: Scale },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/financials", label: "Financials", icon: TrendingUp },
  { to: "/export", label: "Export", icon: Download },
  { to: "/farm-setup", label: "Farm Setup", icon: Tractor },
  { to: "/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { farmName, userId } = useFarm();
  const [unfedCount, setUnfedCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadBadge() {
      if (!userId) {
        setUnfedCount(0);
        return;
      }
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

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="grid min-h-screen" style={{ gridTemplateColumns: "240px minmax(0,1fr)" }}>
      <aside
        className="bg-base-200 border-r border-[var(--border)] fixed top-0 left-0 flex flex-col h-screen w-60 px-4 py-6"
        style={{ gap: "2rem" }}
      >
        <div>
          <div className="display-font text-[30px] leading-none text-[var(--text-primary)]">
            Flock
          </div>
          <div className="text-[var(--text-secondary)] text-xs mt-2">
            {farmName || "Flock Farm"}
          </div>
        </div>

        <nav className="grid gap-2 flex-1" aria-label="Primary">
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

      <main className="bg-base-100 col-start-2 min-h-screen p-6">
        <div className="max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AppLayout;

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
        if (mounted) {
          setUnfedCount(queue.filter((flock) => !flock.fed_today).length);
        }
      } catch {
        if (mounted) {
          setUnfedCount(0);
        }
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
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="display-font farm-logo">Flock</div>
          <div className="farm-subtitle">{farmName || "Flock Farm"}</div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                {item.to === "/scale-house" && unfedCount > 0 ? (
                  <span className="nav-badge">{unfedCount}</span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <button className="signout-button" type="button" onClick={handleSignOut}>
          <LogOut size={18} aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </aside>

      <main className="app-main">
        <div className="app-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AppLayout;

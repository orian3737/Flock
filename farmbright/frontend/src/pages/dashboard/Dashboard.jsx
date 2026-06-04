import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Circle, CircleArrowDown, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { FarmContext } from "../../context/FarmContext";
import { dismissInventoryAlert, getDashboardOverview } from "../../services/dashboardApi";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

const numberFormatter = new Intl.NumberFormat("en-US");

function formatMoney(value = 0) {
  return moneyFormatter.format(Number(value) || 0);
}

function formatNumber(value = 0) {
  return numberFormatter.format(Number(value) || 0);
}

function formatSignedMoney(value = 0) {
  const numericValue = Number(value) || 0;
  const formatted = formatMoney(Math.abs(numericValue));
  return `${numericValue >= 0 ? "+" : "-"}${formatted}`;
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function feedNames(flock) {
  if (!flock?.assigned_feeds?.length) {
    return "No feed assigned";
  }

  return flock.assigned_feeds.join(", ");
}

function statusIcon(status) {
  if (status === "fed") {
    return <Check size={16} aria-hidden="true" />;
  }

  if (status === "skipped") {
    return <CircleArrowDown size={16} aria-hidden="true" />;
  }

  return <Circle size={16} aria-hidden="true" />;
}

function Dashboard() {
  const navigate = useNavigate();
  const { userId } = useContext(FarmContext);
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverview = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await getDashboardOverview(userId);
      setOverview(data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Dashboard data could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchOverview();
    const intervalId = window.setInterval(fetchOverview, 60000);

    return () => window.clearInterval(intervalId);
  }, [fetchOverview]);

  const today = overview?.today || {};
  const yesterday = overview?.yesterday || {};
  const flocks = useMemo(() => {
    const source = today.flocks || today.flocks_pending || [];
    return [...source].sort((left, right) => left.name.localeCompare(right.name));
  }, [today.flocks, today.flocks_pending]);
  const fedCount = today.flocks_fed || 0;
  const totalFlocks = today.flocks_total || 0;
  const hasStarted = fedCount > 0;
  const allFed = totalFlocks > 0 && fedCount === totalFlocks;
  const hasProductionFlocks = flocks.some((flock) => ["layer", "breeder", "mixed"].includes(flock.designation));
  const feedProgress = totalFlocks ? Math.round((fedCount / totalFlocks) * 100) : 0;
  const feedingPanelState = allFed ? "complete" : hasStarted ? "compact" : "prominent";
  const flocksFedTone = allFed ? "var(--accent-primary)" : hasStarted ? "var(--accent-warn)" : "var(--border)";
  const pnlPositive = Number(yesterday.net_pl || 0) >= 0;

  async function handleDismissAlert(alertId) {
    await dismissInventoryAlert(alertId);
    fetchOverview();
  }

  if (isLoading) {
    return <section className="panel-card">Loading dashboard...</section>;
  }

  return (
    <section className="dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Farm overview</p>
          <h1 className="display-font">{overview?.farm_name || "Dashboard"}</h1>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {overview?.alerts?.length ? (
        <section className="dashboard-alert-bar" aria-label="Feed stock alerts">
          <AlertTriangle size={22} aria-hidden="true" />
          <div className="dashboard-alert-list">
            {overview.alerts.map((alert) => (
              <div className="dashboard-alert-row" key={alert.alert_id}>
                <span>
                  {alert.feed_name} is low - {formatNumber(alert.current_on_hand)} {alert.unit} remaining
                  {" "}
                  (par: {formatNumber(alert.par_level)} {alert.unit})
                </span>
                <button
                  aria-label={`Dismiss ${alert.feed_name} alert`}
                  className="dashboard-dismiss-alert"
                  onClick={() => handleDismissAlert(alert.alert_id)}
                  type="button"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className={`dashboard-main dashboard-main-${feedingPanelState}`}>
        <aside className={`feeding-panel feeding-panel-${feedingPanelState}`}>
          <div className="feeding-panel-header">
            <div>
              <h2 className="display-font">Today's Feeding</h2>
              <p>
                {fedCount} of {totalFlocks} flocks fed
              </p>
            </div>
          </div>

          {allFed ? (
            <div className="feeding-complete-card">All flocks fed {"\u2713"}</div>
          ) : null}

          <div className="flock-feed-list">
            {flocks.length ? (
              flocks.map((flock) => (
                <div className={`flock-feed-row ${flock.status || "pending"}`} key={flock.flock_id}>
                  <span className="flock-feed-icon">{statusIcon(flock.status)}</span>
                  <div className="flock-feed-main">
                    <strong>{flock.name}</strong>
                    <span>
                      {flock.breed_name}
                      <span className="designation-badge">{flock.designation}</span>
                    </span>
                    {flock.status === "fed" && flock.fed_at ? (
                      <small>Fed at {formatTime(flock.fed_at)}</small>
                    ) : null}
                  </div>
                  <span className="flock-feed-name">{feedNames(flock)}</span>
                </div>
              ))
            ) : (
              <div className="muted">No flocks are configured yet.</div>
            )}
          </div>

          <button
            className="primary-button dashboard-day-button display-font"
            onClick={() => navigate("/scale-house?mode=daily")}
            type="button"
          >
            {hasStarted ? "Continue Day \u2192" : "Start Day \u2192"}
          </button>
        </aside>

        <div className="dashboard-kpis">
          <article className="dashboard-kpi-card" style={{ borderLeftColor: "var(--accent-danger)" }}>
            <div className="number-font dashboard-kpi-number">{formatMoney(today.total_feed_cost)}</div>
            <div className="dashboard-kpi-label">Feed Cost Today</div>
            <p>Yesterday: {formatMoney(yesterday.total_feed_cost)}</p>
          </article>

          {hasProductionFlocks ? (
            <article className="dashboard-kpi-card" style={{ borderLeftColor: "var(--accent-primary)" }}>
              <div className="number-font dashboard-kpi-number">{formatNumber(today.total_eggs)}</div>
              <div className="dashboard-kpi-label">Eggs Collected</div>
              <p>Yesterday: {formatNumber(yesterday.total_eggs)}</p>
            </article>
          ) : null}

          <article className="dashboard-kpi-card" style={{ borderLeftColor: flocksFedTone }}>
            <div className="number-font dashboard-kpi-number">
              {fedCount} / {totalFlocks}
            </div>
            <div className="dashboard-kpi-label">Flocks Fed Today</div>
            <div className="dashboard-progress-bar" aria-label={`${feedProgress}% of flocks fed`}>
              <span style={{ width: `${feedProgress}%` }} />
            </div>
          </article>

          <article
            className="dashboard-kpi-card"
            style={{ borderLeftColor: pnlPositive ? "var(--accent-primary)" : "var(--accent-danger)" }}
          >
            <div
              className="number-font dashboard-kpi-number"
              style={{ color: pnlPositive ? "var(--accent-primary)" : "var(--accent-danger)" }}
            >
              {formatSignedMoney(yesterday.net_pl)}
            </div>
            <div className="dashboard-kpi-label">Yesterday's P&amp;L</div>
          </article>
        </div>
      </div>

      <div className="dashboard-bottom-strip">
        <section className="feed-stock-panel">
          <div className="feed-stock-row">
            {overview?.feed_stocks?.length ? (
              overview.feed_stocks.map((feed) => {
                const fillPercent = feed.par_level
                  ? Math.min(100, Math.round((feed.current_on_hand / (feed.par_level * 2)) * 100))
                  : 100;

                return (
                  <button
                    className={`feed-stock-pill ${feed.status}`}
                    key={feed.name}
                    onClick={() => navigate("/inventory")}
                    type="button"
                  >
                    <span className="feed-status-dot" />
                    <strong>{feed.name}</strong>
                    <span>
                      {formatNumber(feed.current_on_hand)} {feed.unit}
                    </span>
                    <span className="mini-stock-bar" aria-hidden="true">
                      <span style={{ width: `${fillPercent}%` }} />
                    </span>
                  </button>
                );
              })
            ) : (
              <span className="muted">No feed stocks configured.</span>
            )}
          </div>
        </section>

        <section className="quick-stats-panel">
          Total Fed: {formatNumber(today.total_feed_used_lbs)} lbs {"\u00b7"} Cost: {formatMoney(today.total_feed_cost)}{" "}
          {"\u00b7"} Eggs:{" "}
          {formatNumber(today.total_eggs)}
        </section>
      </div>
    </section>
  );
}

export default Dashboard;

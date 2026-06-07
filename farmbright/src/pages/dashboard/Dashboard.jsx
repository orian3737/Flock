import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Circle, CircleArrowDown, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getAnimalEmoji, getClassConfig } from "../../utils/animalClass";
import { FarmContext } from "../../context/FarmContext";
import { dismissInventoryAlert, getDashboardOverview } from "../../services/dashboardApi";

const moneyFormatter = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });
const numberFormatter = new Intl.NumberFormat("en-US");

function formatMoney(value = 0)  { return moneyFormatter.format(Number(value) || 0); }
function formatNumber(value = 0) { return numberFormatter.format(Number(value) || 0); }

function formatSignedMoney(value = 0) {
  const n = Number(value) || 0;
  return `${n >= 0 ? "+" : "-"}${formatMoney(Math.abs(n))}`;
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function feedNames(flock) {
  if (!flock?.assigned_feeds?.length) return "No feed assigned";
  return flock.assigned_feeds.join(", ");
}

function statusIcon(status) {
  if (status === "fed")     return <Check size={16} aria-hidden="true" />;
  if (status === "skipped") return <CircleArrowDown size={16} aria-hidden="true" />;
  return <Circle size={16} aria-hidden="true" />;
}

function Dashboard() {
  const navigate = useNavigate();
  const { userId } = useContext(FarmContext);
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverview = useCallback(async () => {
    if (!userId) { setIsLoading(false); return; }
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
    const id = window.setInterval(fetchOverview, 60000);
    return () => window.clearInterval(id);
  }, [fetchOverview]);

  const today     = overview?.today || {};
  const yesterday = overview?.yesterday || {};
  const flocks    = useMemo(() => {
    const source = today.flocks || today.flocks_pending || [];
    return [...source].sort((a, b) => a.name.localeCompare(b.name));
  }, [today.flocks, today.flocks_pending]);

  const fedCount    = today.flocks_fed   || 0;
  const totalFlocks = today.flocks_total || 0;
  const hasStarted  = fedCount > 0;
  const allFed      = totalFlocks > 0 && fedCount === totalFlocks;
  const hasEggProduction = flocks.some((f) => getClassConfig(f.class_type).producesEggs);
  const feedProgress  = totalFlocks ? Math.round((fedCount / totalFlocks) * 100) : 0;
  const feedingPanelState = allFed ? "complete" : hasStarted ? "compact" : "prominent";
  const flocksFedTone = allFed ? "var(--accent-primary)" : hasStarted ? "var(--accent-warn)" : "var(--border)";
  const pnlPositive   = Number(yesterday.net_pl || 0) >= 0;

  async function handleDismissAlert(alertId) {
    await dismissInventoryAlert(alertId);
    fetchOverview();
  }

  if (isLoading) return <section className="panel-card">Loading dashboard...</section>;

  return (
    <section className="grid gap-4">
      <header className="page-header">
        <div>
          <p className="eyebrow">Farm overview</p>
          <h1 className="display-font">{overview?.farm_name || "Dashboard"}</h1>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {overview?.alerts?.length ? (
        <section
          className="flex gap-3 items-start bg-[rgba(255,143,0,0.14)] border border-[rgba(255,143,0,0.4)] border-l-[8px] border-l-[var(--accent-warn)] rounded-lg text-[var(--text-primary)] p-4"
          aria-label="Feed stock alerts"
        >
          <AlertTriangle size={22} className="text-[var(--accent-warn)] flex-none" aria-hidden="true" />
          <div className="grid flex-1 gap-2">
            {overview.alerts.map((alert) => (
              <div className="flex items-center gap-3 justify-between" key={alert.alert_id}>
                <span>
                  {alert.feed_name} is low — {formatNumber(alert.current_on_hand)} {alert.unit} remaining
                  {" "}(par: {formatNumber(alert.par_level)} {alert.unit})
                </span>
                <button
                  aria-label={`Dismiss ${alert.feed_name} alert`}
                  className="inline-flex items-center justify-center flex-none bg-transparent border border-[rgba(255,143,0,0.45)] rounded-md text-[var(--text-primary)] h-[30px] w-[30px] p-0"
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

      <div
        className={`grid gap-4 ${feedingPanelState === "compact" ? "lg:[grid-template-columns:280px_minmax(0,1fr)]" : "lg:[grid-template-columns:380px_minmax(0,1fr)]"}`}
      >
        <aside
          className="bg-[var(--bg-surface)] border-r border-[var(--border)] rounded-lg flex flex-col gap-4 min-w-0 p-5"
          style={{ minHeight: feedingPanelState === "prominent" ? "480px" : undefined }}
        >
          <div>
            <h2 className="display-font text-2xl leading-none m-0">Today's Feeding</h2>
            <p className="text-[var(--text-muted)] text-xs mt-2 mb-0">
              {fedCount} of {totalFlocks} flocks fed
            </p>
          </div>

          {allFed ? (
            <div className="bg-[rgba(76,175,80,0.16)] border border-[rgba(76,175,80,0.55)] rounded-lg text-[var(--text-primary)] font-bold p-3.5">
              All flocks fed ✓
            </div>
          ) : null}

          <div className="grid gap-2.5 min-w-0">
            {flocks.length ? (
              flocks.map((flock) => (
                <div
                  className="items-center bg-[rgba(15,26,15,0.5)] border border-[rgba(46,125,50,0.55)] rounded-lg grid gap-2.5 min-h-[70px] p-2.5"
                  style={{ gridTemplateColumns: "24px minmax(0,1fr) minmax(82px,30%)" }}
                  key={flock.flock_id}
                >
                  <span
                    className={`inline-flex items-center justify-center rounded-full h-6 w-6 ${
                      flock.status === "fed"
                        ? "bg-[var(--accent-primary)] text-[#071107]"
                        : flock.status === "skipped"
                        ? "text-[var(--accent-warn)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {statusIcon(flock.status)}
                  </span>
                  <div className="grid gap-1 min-w-0">
                    <strong className="text-[var(--text-primary)] break-words">
                      <span aria-hidden="true">{getAnimalEmoji(flock)} </span>
                      {flock.name}
                    </strong>
                    <span className="text-[var(--text-muted)] text-xs">
                      {flock.breed_name}
                      <span className="designation-badge ml-2">{flock.designation}</span>
                    </span>
                    {flock.status === "fed" && flock.fed_at ? (
                      <small className="text-[var(--text-muted)] text-xs">Fed at {formatTime(flock.fed_at)}</small>
                    ) : null}
                  </div>
                  <span className="text-[var(--text-muted)] text-xs text-right break-words">{feedNames(flock)}</span>
                </div>
              ))
            ) : (
              <div className="muted">No flocks are configured yet.</div>
            )}
          </div>

          <button
            className="primary-button display-font mt-auto w-full text-base"
            onClick={() => navigate("/scale-house?mode=daily")}
            type="button"
          >
            {hasStarted ? "Continue Day →" : "Start Day →"}
          </button>

          {hasStarted ? (
            <div className="flex gap-2">
              <button
                className="btn btn-xs btn-ghost font-mono border border-[var(--border)] text-[var(--text-secondary)] flex-1"
                type="button"
                onClick={() => navigate("/scale-house?panel=review")}
              >
                Review Day
              </button>
              <button
                className="btn btn-xs btn-ghost font-mono border border-[var(--border)] text-[var(--text-secondary)] flex-1"
                type="button"
                onClick={() => navigate("/scale-house?panel=edit")}
              >
                Edit Day
              </button>
            </div>
          ) : null}
        </aside>

        <div className="grid grid-cols-2 gap-4 content-start min-w-0">
          <article
            className="bg-[var(--bg-surface)] border border-[var(--border)] border-l-4 rounded-lg grid gap-2.5 min-h-[140px] lg:min-h-[188px] p-4 lg:p-5 min-w-0"
            style={{ borderLeftColor: "var(--accent-danger)" }}
          >
            <div className="number-font text-[22px] lg:text-[36px] font-bold leading-none break-all">{formatMoney(today.total_feed_cost)}</div>
            <div className="text-[var(--text-secondary)] text-xs uppercase">Feed Cost Today</div>
            <p className="text-[var(--text-muted)] text-xs m-0">Yesterday: {formatMoney(yesterday.total_feed_cost)}</p>
          </article>

          {hasEggProduction ? (
            <article
              className="bg-[var(--bg-surface)] border border-[var(--border)] border-l-4 rounded-lg grid gap-2.5 min-h-[140px] lg:min-h-[188px] p-4 lg:p-5 min-w-0"
              style={{ borderLeftColor: "var(--accent-primary)" }}
            >
              <div className="number-font text-[22px] lg:text-[36px] font-bold leading-none break-all">{formatNumber(today.total_eggs)}</div>
              <div className="text-[var(--text-secondary)] text-xs uppercase">Eggs Collected</div>
              <p className="text-[var(--text-muted)] text-xs m-0">Yesterday: {formatNumber(yesterday.total_eggs)}</p>
            </article>
          ) : null}

          <article
            className="bg-[var(--bg-surface)] border border-[var(--border)] border-l-4 rounded-lg grid gap-2.5 min-h-[140px] lg:min-h-[188px] p-4 lg:p-5 min-w-0"
            style={{ borderLeftColor: flocksFedTone }}
          >
            <div className="number-font text-[22px] lg:text-[36px] font-bold leading-none break-all">
              {fedCount} / {totalFlocks}
            </div>
            <div className="text-[var(--text-secondary)] text-xs uppercase">Flocks Fed Today</div>
            <div
              className="block w-full h-2 rounded-full overflow-hidden bg-[rgba(85,139,90,0.25)]"
              aria-label={`${feedProgress}% of flocks fed`}
            >
              <span className="block h-full bg-[var(--accent-primary)]" style={{ width: `${feedProgress}%` }} />
            </div>
          </article>

          <article
            className="bg-[var(--bg-surface)] border border-[var(--border)] border-l-4 rounded-lg grid gap-2.5 min-h-[140px] lg:min-h-[188px] p-4 lg:p-5 min-w-0"
            style={{ borderLeftColor: pnlPositive ? "var(--accent-primary)" : "var(--accent-danger)" }}
          >
            <div
              className="number-font text-[22px] lg:text-[36px] font-bold leading-none break-all"
              style={{ color: pnlPositive ? "var(--accent-primary)" : "var(--accent-danger)" }}
            >
              {formatSignedMoney(yesterday.net_pl)}
            </div>
            <div className="text-[var(--text-secondary)] text-xs uppercase">Yesterday's P&amp;L</div>
          </article>
        </div>
      </div>

      <div className="grid gap-4 lg:[grid-template-columns:minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-3.5">
          <div className="flex gap-2.5 overflow-x-auto pb-0.5">
            {overview?.feed_stocks?.length ? (
              overview.feed_stocks.map((feed) => {
                const fillPercent = feed.par_level
                  ? Math.min(100, Math.round((feed.current_on_hand / (feed.par_level * 2)) * 100))
                  : 100;
                const dotColor =
                  feed.status === "critical" ? "var(--accent-danger)"
                  : feed.status === "warning"  ? "var(--accent-warn)"
                  : "var(--accent-primary)";
                return (
                  <button
                    className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] grid gap-[7px] flex-none w-[190px] p-3 text-left"
                    style={{ gridTemplateColumns: "10px minmax(0,1fr)" }}
                    key={feed.name}
                    onClick={() => navigate("/inventory")}
                    type="button"
                  >
                    <span
                      className="self-center inline-block rounded-full h-[10px] w-[10px]"
                      style={{ background: dotColor }}
                    />
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap">{feed.name}</strong>
                    <span className="col-span-2 overflow-hidden text-ellipsis whitespace-nowrap">
                      {formatNumber(feed.current_on_hand)} {feed.unit}
                    </span>
                    <span
                      className="col-span-2 block w-full h-1.5 rounded-full overflow-hidden bg-[rgba(85,139,90,0.25)]"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full"
                        style={{ width: `${fillPercent}%`, background: dotColor }}
                      />
                    </span>
                  </button>
                );
              })
            ) : (
              <span className="muted">No feed stocks configured.</span>
            )}
          </div>
        </section>

        <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-3.5 flex items-center text-[var(--text-secondary)] text-[13px] break-words">
          Total Fed: {formatNumber(today.total_feed_used_lbs)} lbs · Cost: {formatMoney(today.total_feed_cost)} · Eggs:{" "}
          {formatNumber(today.total_eggs)}
        </section>
      </div>
    </section>
  );
}

export default Dashboard;

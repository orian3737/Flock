import React, { useContext, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { FarmContext } from "../../context/FarmContext";
import { createRevenue, getFinancialSummary, getFlockFinancials } from "../../services/financialsApi";
import { getQueue } from "../../services/scaleHouseApi";

const todayString = () => new Date().toISOString().slice(0, 10);
const moneyFormatter = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

function formatMoney(value = 0) { return moneyFormatter.format(Number(value) || 0); }

function rangeFor(period) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (period === "today") return { start_date: end, end_date: end };
  if (period === "week") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { start_date: start.toISOString().slice(0, 10), end_date: end };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start_date: start.toISOString().slice(0, 10), end_date: end };
}

function Financials() {
  const { userId } = useContext(FarmContext);
  const navigate = useNavigate();
  const [period, setPeriod]           = useState("month");
  const [customRange, setCustomRange] = useState(rangeFor("month"));
  const [summary, setSummary]         = useState(null);
  const [flocks, setFlocks]           = useState([]);
  const [queue, setQueue]             = useState([]);
  const [sort, setSort]               = useState({ field: "net_pl", direction: "asc" });
  const [modalOpen, setModalOpen]     = useState(false);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");

  const params = period === "custom" ? customRange : rangeFor(period);

  async function refresh(isInitial = false) {
    if (!userId) { setLoading(false); return; }
    if (isInitial) setLoading(true); else setRefreshing(true);
    setError("");
    try {
      const [summaryData, flockData, queueData] = await Promise.all([
        getFinancialSummary(params),
        getFlockFinancials(params),
        getQueue(userId),
      ]);
      setSummary(summaryData);
      setFlocks(flockData);
      setQueue(queueData);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Financials could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { refresh(true); }, [userId]);
  useEffect(() => {
    if (!loading) refresh(false);
  }, [period, customRange.start_date, customRange.end_date]);

  const avgCostPerBird = useMemo(() => {
    const headcount = flocks.reduce((sum, f) => sum + Number(f.headcount || 0), 0);
    return headcount ? (summary?.total_feed_cost || 0) / headcount : 0;
  }, [flocks, summary]);

  const sortedFlocks = useMemo(() => {
    return [...flocks].sort((a, b) => {
      const av = a[sort.field] ?? "";
      const bv = b[sort.field] ?? "";
      const result = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? result : -result;
    });
  }, [flocks, sort]);

  const totals = sortedFlocks.reduce(
    (acc, f) => ({ feed: acc.feed + Number(f.total_feed_cost || 0), revenue: acc.revenue + Number(f.total_revenue || 0), net: acc.net + Number(f.net_pl || 0) }),
    { feed: 0, revenue: 0, net: 0 },
  );

  function toggleSort(field) {
    setSort((p) => ({ field, direction: p.field === field && p.direction === "asc" ? "desc" : "asc" }));
  }

  async function submitRevenue(payload) {
    await createRevenue({ ...payload, user_id: userId });
    setModalOpen(false);
    await refresh(false);
  }

  if (loading) return <section className="panel-card">Loading financials...</section>;

  return (
    <section className={`grid gap-4 pb-20 transition-opacity duration-150 ${refreshing ? "opacity-60 pointer-events-none" : ""}`}>
      <header className="sticky top-14 lg:top-0 z-[4] flex flex-wrap items-start justify-between gap-3 bg-[rgba(15,26,15,0.92)] border-b border-[var(--border)] pb-3">
        <div>
          <p className="eyebrow">Farm economics</p>
          <h1 className="display-font text-[32px] leading-none m-0">Financials</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {["today", "week", "month", "custom"].map((item) => (
            <button
              key={item}
              className={`border rounded-full min-h-[34px] px-3 py-[7px] transition-colors ${
                period === item
                  ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold"
                  : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)]"
              }`}
              type="button"
              onClick={() => setPeriod(item)}
            >
              {item === "week" ? "This Week" : item === "month" ? "This Month" : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
          {period === "custom" ? (
            <>
              <input
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[34px] px-[9px] py-[7px]"
                type="date"
                value={customRange.start_date}
                onChange={(e) => setCustomRange((r) => ({ ...r, start_date: e.target.value }))}
              />
              <input
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[34px] px-[9px] py-[7px]"
                type="date"
                value={customRange.end_date}
                onChange={(e) => setCustomRange((r) => ({ ...r, end_date: e.target.value }))}
              />
            </>
          ) : null}
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Feed Cost"     value={formatMoney(summary?.total_feed_cost)} tone="var(--accent-danger)" />
        <Kpi label="Revenue"       value={formatMoney(summary?.total_revenue)}   tone="var(--accent-primary)" />
        <Kpi
          label="Net P&L"
          value={formatMoney(summary?.net_pl)}
          tone={(summary?.net_pl || 0) >= 0 ? "var(--accent-primary)" : "var(--accent-danger)"}
        />
        <Kpi label="Avg Cost/Bird" value={formatMoney(avgCostPerBird)}           tone="var(--border)" />
      </div>

      <div className="grid gap-4 lg:[grid-template-columns:3fr_2fr]">
        <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-4">
          <h2 className="text-[var(--text-secondary)] text-[13px] m-0 mb-3 uppercase" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
            Daily Feed Cost vs Revenue
          </h2>
          <ResponsiveContainer height={280} width="100%">
            <AreaChart data={summary?.feed_cost_by_day || []}>
              <CartesianGrid stroke="rgba(76, 175, 80, 0.25)" />
              <XAxis dataKey="date" stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#162416", border: "1px solid #2e7d32" }} />
              <Area dataKey="cost"    fill="rgba(198, 40, 40, 0.4)"  stroke="#c62828" name="Feed Cost" />
              <Area dataKey="revenue" fill="rgba(76, 175, 80, 0.4)"  stroke="#4caf50" name="Revenue" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-4">
          <h2 className="text-[var(--text-secondary)] text-[13px] m-0 mb-3 uppercase" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
            P&L by Flock
          </h2>
          <ResponsiveContainer height={280} width="100%">
            <BarChart data={flocks}>
              <CartesianGrid stroke="rgba(76, 175, 80, 0.25)" />
              <XAxis dataKey="name" stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#162416", border: "1px solid #2e7d32" }} />
              <Bar dataKey="net_pl">
                {flocks.map((f) => (
                  <Cell fill={f.net_pl >= 0 ? "#4caf50" : "#c62828"} key={f.flock_id} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-4 overflow-x-auto">
        <table className="border-collapse w-full" style={{ minWidth: "900px" }}>
          <thead>
            <tr>
              {["name", "breed_name", "designation", "headcount", "total_feed_cost", "total_revenue", "net_pl", "cost_per_bird", "cost_per_dozen"].map((field) => (
                <th
                  key={field}
                  className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-xs p-[11px] text-left cursor-pointer capitalize"
                  onClick={() => toggleSort(field)}
                >
                  {field.replaceAll("_", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedFlocks.map((flock) => (
              <tr
                key={flock.flock_id}
                className="cursor-pointer hover:bg-[rgba(30,50,30,0.45)]"
                onClick={() => navigate(`/flocks/${flock.flock_id}`)}
              >
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{flock.name}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{flock.breed_name}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">
                  <span
                    className={`inline-flex border rounded-full text-xs py-[3px] px-2 capitalize ${
                      flock.designation === "layer"   ? "border-[#42a5f5] text-[#90caf9]"
                      : flock.designation === "breeder" ? "border-[#ab47bc] text-[#ce93d8]"
                      : flock.designation === "meat"    ? "border-[var(--accent-warn)] text-[#ffcc80]"
                      : "border-[var(--border)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {flock.designation}
                  </span>
                </td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{flock.headcount}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{formatMoney(flock.total_feed_cost)}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{formatMoney(flock.total_revenue)}</td>
                <td className={`border-b border-[rgba(46,125,50,0.55)] text-xs p-[11px] inline-flex items-center gap-1 ${flock.net_pl >= 0 ? "positive" : "negative"}`}>
                  {flock.net_pl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {formatMoney(flock.net_pl)}
                </td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{formatMoney(flock.cost_per_bird)}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">
                  {["layer", "breeder"].includes(flock.designation) && flock.cost_per_dozen !== null
                    ? formatMoney(flock.cost_per_dozen)
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="4" className="text-[var(--text-primary)] font-bold text-xs p-[11px]">Totals</td>
              <td className="text-[var(--text-primary)] font-bold text-xs p-[11px]">{formatMoney(totals.feed)}</td>
              <td className="text-[var(--text-primary)] font-bold text-xs p-[11px]">{formatMoney(totals.revenue)}</td>
              <td className="text-[var(--text-primary)] font-bold text-xs p-[11px]">{formatMoney(totals.net)}</td>
              <td colSpan="2" />
            </tr>
          </tfoot>
        </table>
      </section>

      <button
        className="fixed bottom-6 right-6 inline-flex items-center justify-center bg-[var(--accent-primary)] border-0 rounded-full text-[#071107] h-14 w-14 z-[8]"
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="Log revenue"
      >
        <Plus size={24} aria-hidden="true" />
      </button>

      {modalOpen ? (
        <RevenueModal flocks={queue} onClose={() => setModalOpen(false)} onSubmit={submitRevenue} />
      ) : null}
    </section>
  );
}

function Kpi({ label, tone, value }) {
  return (
    <article
      className="bg-[var(--bg-surface)] border border-[var(--border)] border-l-4 rounded-lg grid gap-2 p-[18px]"
      style={{ borderLeftColor: tone }}
    >
      <strong className="number-font text-[22px] lg:text-[36px] leading-none break-all min-w-0" style={{ color: tone }}>{value}</strong>
      <span className="text-[var(--text-secondary)] text-xs uppercase">{label}</span>
    </article>
  );
}

function RevenueModal({ flocks, onClose, onSubmit }) {
  const [amount, setAmount]   = useState("");
  const [source, setSource]   = useState("egg_sales");
  const [flockId, setFlockId] = useState("");
  const [date, setDate]       = useState(todayString());
  const [notes, setNotes]     = useState("");

  function submit(event) {
    event.preventDefault();
    onSubmit({ amount: Number(amount), source, flock_id: flockId ? Number(flockId) : null, date, notes });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-[0_24px_80px_rgba(0,0,0,0.45)] p-[18px] w-full max-w-[460px] max-h-[calc(100vh-40px)] overflow-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Log Revenue"
      >
        <header className="flex items-center justify-between gap-3 mb-4">
          <h2 className="display-font text-2xl leading-none m-0">Log Revenue</h2>
          <button className="inline-flex items-center justify-center flex-none h-12 w-12 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[#e8f5e9] hover:bg-[rgba(198,40,40,0.18)] hover:border-[rgba(198,40,40,0.7)] hover:text-[var(--accent-danger)] transition-colors p-0" type="button" onClick={onClose} aria-label="Close revenue modal">
            <X size={28} />
          </button>
        </header>
        <form className="grid gap-3" onSubmit={submit}>
          <label className="field">
            <span>Amount</span>
            <input required min="0" step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {["egg_sales", "meat_sales", "breeding_sales", "other"].map((item) => (
              <button
                key={item}
                className={`border rounded-full min-h-[34px] px-3 py-[7px] transition-colors ${
                  source === item
                    ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold"
                    : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)]"
                }`}
                type="button"
                onClick={() => setSource(item)}
              >
                {item.replace("_", " ")}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Flock</span>
            <select value={flockId} onChange={(e) => setFlockId(e.target.value)}>
              <option value="">Farm-wide</option>
              {flocks.map((f) => <option key={f.flock_id} value={f.flock_id}>{f.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Date</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <button className="primary-button full-width" type="submit">Save Revenue</button>
        </form>
      </div>
    </div>
  );
}

export default Financials;

import React, { useContext, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FarmContext } from "../../context/FarmContext";
import { createRevenue, getFinancialSummary, getFlockFinancials } from "../../services/financialsApi";
import { getQueue } from "../../services/scaleHouseApi";

const todayString = () => new Date().toISOString().slice(0, 10);

const moneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

function formatMoney(value = 0) {
  return moneyFormatter.format(Number(value) || 0);
}

function rangeFor(period) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (period === "today") {
    return { start_date: end, end_date: end };
  }
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
  const [period, setPeriod] = useState("month");
  const [customRange, setCustomRange] = useState(rangeFor("month"));
  const [summary, setSummary] = useState(null);
  const [flocks, setFlocks] = useState([]);
  const [queue, setQueue] = useState([]);
  const [sort, setSort] = useState({ field: "net_pl", direction: "asc" });
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = period === "custom" ? customRange : rangeFor(period);

  async function refresh() {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const [summaryData, flockData, queueData] = await Promise.all([
        getFinancialSummary(userId, params),
        getFlockFinancials(userId, params),
        getQueue(userId),
      ]);
      setSummary(summaryData);
      setFlocks(flockData);
      setQueue(queueData);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Financials could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [userId, period, customRange.start_date, customRange.end_date]);

  const avgCostPerBird = useMemo(() => {
    const headcount = flocks.reduce((sum, flock) => sum + Number(flock.headcount || 0), 0);
    return headcount ? (summary?.total_feed_cost || 0) / headcount : 0;
  }, [flocks, summary]);

  const sortedFlocks = useMemo(() => {
    return [...flocks].sort((left, right) => {
      const leftValue = left[sort.field] ?? "";
      const rightValue = right[sort.field] ?? "";
      const result = typeof leftValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
      return sort.direction === "asc" ? result : -result;
    });
  }, [flocks, sort]);

  const totals = sortedFlocks.reduce(
    (acc, flock) => ({
      feed: acc.feed + Number(flock.total_feed_cost || 0),
      revenue: acc.revenue + Number(flock.total_revenue || 0),
      net: acc.net + Number(flock.net_pl || 0),
    }),
    { feed: 0, revenue: 0, net: 0 },
  );

  function toggleSort(field) {
    setSort((previous) => ({
      field,
      direction: previous.field === field && previous.direction === "asc" ? "desc" : "asc",
    }));
  }

  async function submitRevenue(payload) {
    await createRevenue({ ...payload, user_id: userId });
    setModalOpen(false);
    await refresh();
  }

  if (loading) {
    return <section className="panel-card">Loading financials...</section>;
  }

  return (
    <section className="financials-page">
      <header className="financials-period-bar">
        <div>
          <p className="eyebrow">Farm economics</p>
          <h1 className="display-font">Financials</h1>
        </div>
        <div className="period-controls">
          {["today", "week", "month", "custom"].map((item) => (
            <button className={period === item ? "selected" : ""} key={item} type="button" onClick={() => setPeriod(item)}>
              {item === "week" ? "This Week" : item === "month" ? "This Month" : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
          {period === "custom" ? (
            <>
              <input type="date" value={customRange.start_date} onChange={(event) => setCustomRange((r) => ({ ...r, start_date: event.target.value }))} />
              <input type="date" value={customRange.end_date} onChange={(event) => setCustomRange((r) => ({ ...r, end_date: event.target.value }))} />
            </>
          ) : null}
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="financial-kpi-grid">
        <Kpi label="Feed Cost" value={formatMoney(summary?.total_feed_cost)} tone="var(--accent-danger)" />
        <Kpi label="Revenue" value={formatMoney(summary?.total_revenue)} tone="var(--accent-primary)" />
        <Kpi
          label="Net P&L"
          value={formatMoney(summary?.net_pl)}
          tone={(summary?.net_pl || 0) >= 0 ? "var(--accent-primary)" : "var(--accent-danger)"}
        />
        <Kpi label="Avg Cost/Bird" value={formatMoney(avgCostPerBird)} tone="var(--border)" />
      </div>

      <div className="financial-chart-row">
        <section className="financial-chart-card wide">
          <h2>Daily Feed Cost vs Revenue</h2>
          <ResponsiveContainer height={280} width="100%">
            <AreaChart data={summary?.feed_cost_by_day || []}>
              <CartesianGrid stroke="rgba(76, 175, 80, 0.25)" />
              <XAxis dataKey="date" stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#162416", border: "1px solid #2e7d32" }} />
              <Area dataKey="cost" fill="rgba(198, 40, 40, 0.4)" stroke="#c62828" name="Feed Cost" />
              <Area dataKey="revenue" fill="rgba(76, 175, 80, 0.4)" stroke="#4caf50" name="Revenue" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="financial-chart-card">
          <h2>P&L by Flock</h2>
          <ResponsiveContainer height={280} width="100%">
            <BarChart data={flocks}>
              <CartesianGrid stroke="rgba(76, 175, 80, 0.25)" />
              <XAxis dataKey="name" stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#162416", border: "1px solid #2e7d32" }} />
              <Bar dataKey="net_pl">
                {flocks.map((flock) => (
                  <Cell fill={flock.net_pl >= 0 ? "#4caf50" : "#c62828"} key={flock.flock_id} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="financial-table-card">
        <table>
          <thead>
            <tr>
              {["name", "breed_name", "designation", "headcount", "total_feed_cost", "total_revenue", "net_pl", "cost_per_bird", "cost_per_dozen"].map((field) => (
                <th key={field} onClick={() => toggleSort(field)}>
                  {field.replaceAll("_", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedFlocks.map((flock) => (
              <tr key={flock.flock_id} onClick={() => navigate(`/flocks/${flock.flock_id}`)}>
                <td>{flock.name}</td>
                <td>{flock.breed_name}</td>
                <td><span className={`finance-designation ${flock.designation}`}>{flock.designation}</span></td>
                <td>{flock.headcount}</td>
                <td>{formatMoney(flock.total_feed_cost)}</td>
                <td>{formatMoney(flock.total_revenue)}</td>
                <td className={flock.net_pl >= 0 ? "positive" : "negative"}>
                  {flock.net_pl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {formatMoney(flock.net_pl)}
                </td>
                <td>{formatMoney(flock.cost_per_bird)}</td>
                <td>{["layer", "breeder"].includes(flock.designation) && flock.cost_per_dozen !== null ? formatMoney(flock.cost_per_dozen) : "-"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="4">Totals</td>
              <td>{formatMoney(totals.feed)}</td>
              <td>{formatMoney(totals.revenue)}</td>
              <td>{formatMoney(totals.net)}</td>
              <td colSpan="2" />
            </tr>
          </tfoot>
        </table>
      </section>

      <button className="revenue-fab" type="button" onClick={() => setModalOpen(true)} aria-label="Log revenue">
        <Plus size={24} aria-hidden="true" />
      </button>

      {modalOpen ? <RevenueModal flocks={queue} onClose={() => setModalOpen(false)} onSubmit={submitRevenue} /> : null}
    </section>
  );
}

function Kpi({ label, tone, value }) {
  return (
    <article className="financial-kpi" style={{ borderLeftColor: tone }}>
      <strong className="number-font" style={{ color: tone }}>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function RevenueModal({ flocks, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("egg_sales");
  const [flockId, setFlockId] = useState("");
  const [date, setDate] = useState(todayString());
  const [notes, setNotes] = useState("");

  function submit(event) {
    event.preventDefault();
    onSubmit({
      amount: Number(amount),
      source,
      flock_id: flockId ? Number(flockId) : null,
      date,
      notes,
    });
  }

  return (
    <div className="inventory-modal-backdrop">
      <div className="inventory-modal">
        <header>
          <h2 className="display-font">Log Revenue</h2>
          <button type="button" onClick={onClose} aria-label="Close revenue modal"><X size={18} /></button>
        </header>
        <form className="inventory-modal-form" onSubmit={submit}>
          <label>Amount<input required min="0" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <div className="revenue-source-pills">
            {["egg_sales", "meat_sales", "breeding_sales", "other"].map((item) => (
              <button className={source === item ? "selected" : ""} key={item} type="button" onClick={() => setSource(item)}>
                {item.replace("_", " ")}
              </button>
            ))}
          </div>
          <label>Flock<select value={flockId} onChange={(event) => setFlockId(event.target.value)}>
            <option value="">Farm-wide</option>
            {flocks.map((flock) => <option key={flock.flock_id} value={flock.flock_id}>{flock.name}</option>)}
          </select></label>
          <label>Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button className="primary-button full-width" type="submit">Save Revenue</button>
        </form>
      </div>
    </div>
  );
}

export default Financials;

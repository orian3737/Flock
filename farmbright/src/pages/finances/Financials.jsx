import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { FarmContext } from "../../context/FarmContext";
import { getFinancialSummary, getFlockFinancials } from "../../services/financialsApi";
import { getLocalDateString, getDaysAgoString, getMonthStartString } from "../../utils/date";

const moneyFormatter = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

function formatMoney(value = 0) { return moneyFormatter.format(Number(value) || 0); }

function rangeFor(period) {
  const end = getLocalDateString();
  if (period === "today") return { start_date: end, end_date: end };
  if (period === "week") return { start_date: getDaysAgoString(6), end_date: end };
  return { start_date: getMonthStartString(), end_date: end };
}

function Financials() {
  const { userId } = useContext(FarmContext);
  const navigate = useNavigate();
  const [period, setPeriod]           = useState("month");
  const [customRange, setCustomRange] = useState(rangeFor("month"));
  const [summary, setSummary]         = useState(null);
  const [flocks, setFlocks]           = useState([]);
  const [sort, setSort]               = useState({ field: "total_feed_cost", direction: "desc" });
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");

  const params = period === "custom" ? customRange : rangeFor(period);

  async function refresh(isInitial = false) {
    if (!userId) { setLoading(false); return; }
    if (isInitial) setLoading(true); else setRefreshing(true);
    setError("");
    try {
      const [summaryData, flockData] = await Promise.all([
        getFinancialSummary(params),
        getFlockFinancials(params),
      ]);
      setSummary(summaryData);
      setFlocks(flockData);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Costs could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { refresh(true); }, [userId]);
  useEffect(() => {
    if (!loading) refresh(false);
  }, [period, customRange.start_date, customRange.end_date]);

  const avgCostPerAnimal = useMemo(() => {
    const headcount = flocks.reduce((sum, flock) => sum + Number(flock.headcount || 0), 0);
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

  const totalFeedCost = sortedFlocks.reduce((sum, flock) => sum + Number(flock.total_feed_cost || 0), 0);

  function toggleSort(field) {
    setSort((previous) => ({
      field,
      direction: previous.field === field && previous.direction === "asc" ? "desc" : "asc",
    }));
  }

  if (loading) return <section className="panel-card">Loading costs...</section>;

  return (
    <section className={`grid gap-4 pb-20 transition-opacity duration-150 ${refreshing ? "opacity-60 pointer-events-none" : ""}`}>
      <header className="sticky top-14 lg:top-0 z-[4] flex flex-wrap items-start justify-between gap-3 bg-[rgba(15,26,15,0.92)] border-b border-[var(--border)] pb-3">
        <div>
          <p className="eyebrow">Farm economics</p>
          <h1 className="display-font text-[32px] leading-none m-0">Costs</h1>
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
                onChange={(e) => setCustomRange((range) => ({ ...range, start_date: e.target.value }))}
              />
              <input
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[34px] px-[9px] py-[7px]"
                type="date"
                value={customRange.end_date}
                onChange={(e) => setCustomRange((range) => ({ ...range, end_date: e.target.value }))}
              />
            </>
          ) : null}
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Kpi label="Feed Cost" value={formatMoney(summary?.total_feed_cost)} tone="var(--accent-danger)" />
        <Kpi label="Avg Cost/Animal" value={formatMoney(avgCostPerAnimal)} tone="var(--border)" />
        <Kpi label="Top Cost Flock" value={summary?.top_cost_flock?.name || "None"} detail={formatMoney(summary?.top_cost_flock?.cost)} tone="var(--accent-primary)" />
      </div>

      <div className="grid gap-4 lg:[grid-template-columns:3fr_2fr]">
        <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-4">
          <h2 className="text-[var(--text-secondary)] text-[13px] m-0 mb-3 uppercase" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
            Daily Feed Cost
          </h2>
          <ResponsiveContainer height={280} width="100%">
            <AreaChart data={summary?.feed_cost_by_day || []}>
              <CartesianGrid stroke="rgba(76, 175, 80, 0.25)" />
              <XAxis dataKey="date" stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#162416", border: "1px solid #2e7d32" }} formatter={(value) => formatMoney(value)} />
              <Area dataKey="cost" fill="rgba(198, 40, 40, 0.35)" stroke="#c62828" name="Feed Cost" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-4">
          <h2 className="text-[var(--text-secondary)] text-[13px] m-0 mb-3 uppercase" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
            Feed Cost by Flock
          </h2>
          <ResponsiveContainer height={280} width="100%">
            <BarChart data={flocks} layout="vertical" margin={{ left: 18 }}>
              <CartesianGrid stroke="rgba(76, 175, 80, 0.25)" />
              <XAxis type="number" stroke="#a5d6a7" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" stroke="#a5d6a7" tick={{ fontSize: 11 }} width={88} />
              <Tooltip contentStyle={{ background: "#162416", border: "1px solid #2e7d32" }} formatter={(value) => formatMoney(value)} />
              <Bar dataKey="total_feed_cost" fill="var(--accent-primary)" name="Feed Cost" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-4 overflow-x-auto">
        <table className="border-collapse w-full" style={{ minWidth: "760px" }}>
          <thead>
            <tr>
              {[
                ["name", "Flock"],
                ["breed_name", "Breed"],
                ["designation", "Designation"],
                ["headcount", "Headcount"],
                ["total_feed_cost", "Feed Cost"],
                ["cost_per_animal", "Cost/Animal"],
                ["cost_per_dozen", "Cost/Dozen"],
              ].map(([field, label]) => (
                <th
                  key={field}
                  className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-xs p-[11px] text-left cursor-pointer"
                  onClick={() => toggleSort(field)}
                >
                  {label}
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
                  <span className="inline-flex border rounded-full text-xs py-[3px] px-2 capitalize border-[var(--border)] text-[var(--text-secondary)]">
                    {flock.designation}
                  </span>
                </td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{flock.headcount}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{formatMoney(flock.total_feed_cost)}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">{formatMoney(flock.cost_per_animal)}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-[11px]">
                  {["layer", "breeder", "mixed"].includes(flock.designation) && flock.cost_per_dozen !== null
                    ? formatMoney(flock.cost_per_dozen)
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="4" className="text-[var(--text-primary)] font-bold text-xs p-[11px]">Totals</td>
              <td className="text-[var(--text-primary)] font-bold text-xs p-[11px]">{formatMoney(totalFeedCost)}</td>
              <td colSpan="2" />
            </tr>
          </tfoot>
        </table>
      </section>

      <PriceBenchmarks flocks={flocks} />
    </section>
  );
}

function Kpi({ detail, label, tone, value }) {
  return (
    <article
      className="bg-[var(--bg-surface)] border border-[var(--border)] border-l-4 rounded-lg grid gap-2 p-[18px]"
      style={{ borderLeftColor: tone }}
    >
      <strong className="number-font text-[22px] lg:text-[36px] leading-none break-words min-w-0" style={{ color: tone }}>{value}</strong>
      {detail ? <span className="text-[var(--text-muted)] text-xs">{detail}</span> : null}
      <span className="text-[var(--text-secondary)] text-xs uppercase">{label}</span>
    </article>
  );
}

function PriceBenchmarks({ flocks }) {
  const benchmarkFlocks = flocks.filter((flock) =>
    (flock.produces_eggs && Number(flock.egg_price_per_dozen || 0) > 0) ||
    (flock.produces_meat && (Number(flock.meat_price_per_lb || 0) > 0 || Number(flock.meat_price_per_bird || 0) > 0)),
  );

  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="display-font text-xl text-[var(--text-primary)] mb-3">Price Benchmarks</h3>
      <p className="font-mono text-xs text-[var(--text-muted)] mb-4">
        Market price references set in Farm Setup. Used to calculate cost efficiency ratios, not recorded as revenue.
      </p>
      {benchmarkFlocks.length ? (
        <div className="grid gap-3">
          {benchmarkFlocks.map((flock) => {
            const feedCostPerEgg = flock.cost_per_dozen != null ? flock.cost_per_dozen / 12 : 0;
            const benchmarkPerEgg = Number(flock.egg_price_per_dozen || 0) / 12;
            const eggEfficiency = benchmarkPerEgg > 0 ? feedCostPerEgg / benchmarkPerEgg : 0;
            return (
              <div key={flock.flock_id} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr]">
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{flock.name}</span>
                {flock.produces_eggs && benchmarkPerEgg > 0 ? (
                  <>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">Feed cost/egg: ${feedCostPerEgg.toFixed(3)}</span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">Benchmark: ${benchmarkPerEgg.toFixed(3)}/egg</span>
                    <span className={`font-mono text-xs ${eggEfficiency > 0.3 ? "text-[var(--accent-danger)]" : "text-[var(--accent-primary)]"}`}>
                      Feed = {(eggEfficiency * 100).toFixed(1)}% of market price
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">Meat/lb: {formatMoney(flock.meat_price_per_lb)}</span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">Meat/head: {formatMoney(flock.meat_price_per_bird)}</span>
                    <span className="font-mono text-xs text-[var(--text-muted)]">Benchmark only</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="font-mono text-xs text-[var(--text-muted)] m-0">No price benchmarks set yet.</p>
      )}
    </section>
  );
}

export default Financials;

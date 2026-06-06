import { supabase } from "./supabaseClient";

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  };
}

function dateRange(startDate, endDate) {
  const dates = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Farm-level financial summary ─────────────────────────────

export async function getFinancialSummary({ start_date, end_date } = {}) {
  const range = currentMonthRange();
  const sd = start_date || range.start_date;
  const ed = end_date || range.end_date;

  const [flocksResult, feedingResult, revenueResult] = await Promise.all([
    supabase.from("flocks").select("id, name"),
    supabase
      .from("feeding_events")
      .select("flock_id, date, total_weight, cost_per_lb_at_time")
      .gte("date", sd)
      .lte("date", ed),
    supabase
      .from("revenues")
      .select("flock_id, date, amount")
      .gte("date", sd)
      .lte("date", ed),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load flocks.");
  if (feedingResult.error) throw fmt(feedingResult.error, "Could not load feeding data.");
  if (revenueResult.error) throw fmt(revenueResult.error, "Could not load revenue data.");

  const flocks = flocksResult.data || [];
  const feedings = feedingResult.data || [];
  const revenues = revenueResult.data || [];

  // Build day-indexed maps
  const feedCostByDay = new Map();
  const feedCostByFlock = new Map();
  for (const ev of feedings) {
    const cost = (ev.total_weight || 0) * (ev.cost_per_lb_at_time || 0);
    feedCostByDay.set(ev.date, (feedCostByDay.get(ev.date) || 0) + cost);
    feedCostByFlock.set(ev.flock_id, (feedCostByFlock.get(ev.flock_id) || 0) + cost);
  }

  const revenueByDay = new Map();
  for (const r of revenues) {
    revenueByDay.set(r.date, (revenueByDay.get(r.date) || 0) + r.amount);
  }

  const totalFeedCost = [...feedCostByDay.values()].reduce((s, v) => s + v, 0);
  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);

  const topFlockId = flocks.reduce(
    (best, f) => (feedCostByFlock.get(f.id) || 0) > (feedCostByFlock.get(best) || 0) ? f.id : best,
    null
  );
  const topFlock = flocks.find((f) => f.id === topFlockId);

  return {
    total_feed_cost: Math.round(totalFeedCost * 100) / 100,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    net_pl: Math.round((totalRevenue - totalFeedCost) * 100) / 100,
    feed_cost_by_day: dateRange(sd, ed).map((date) => {
      const cost = feedCostByDay.get(date) || 0;
      const rev = revenueByDay.get(date) || 0;
      return {
        date,
        cost: Math.round(cost * 100) / 100,
        revenue: Math.round(rev * 100) / 100,
        net: Math.round((rev - cost) * 100) / 100,
      };
    }),
    top_cost_flock: {
      name: topFlock?.name || null,
      cost: Math.round((feedCostByFlock.get(topFlockId) || 0) * 100) / 100,
    },
  };
}

// ── Per-flock P&L list ────────────────────────────────────────

export async function getFlockFinancials({ start_date, end_date } = {}) {
  const range = currentMonthRange();
  const sd = start_date || range.start_date;
  const ed = end_date || range.end_date;

  const [flocksResult, feedingResult, revenueResult, productionResult] = await Promise.all([
    supabase
      .from("flocks")
      .select("id, name, designation, current_headcount, breeds(name)")
      .order("name"),
    supabase
      .from("feeding_events")
      .select("flock_id, date, total_weight, cost_per_lb_at_time")
      .gte("date", sd)
      .lte("date", ed),
    supabase
      .from("revenues")
      .select("flock_id, date, amount")
      .gte("date", sd)
      .lte("date", ed),
    supabase
      .from("production_logs")
      .select("flock_id, date, egg_count")
      .gte("date", sd)
      .lte("date", ed),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load flocks.");

  const feedings = feedingResult.data || [];
  const revenues = revenueResult.data || [];
  const production = productionResult.data || [];

  return (flocksResult.data || []).map((flock) => {
    const flockFeedings = feedings.filter((e) => e.flock_id === flock.id);
    const flockRevenues = revenues.filter((r) => r.flock_id === flock.id);
    const flockProduction = production.filter((p) => p.flock_id === flock.id);

    const feedCostByDay = new Map();
    const revByDay = new Map();
    let totalFeedCost = 0;
    let totalRevenue = 0;

    for (const ev of flockFeedings) {
      const cost = (ev.total_weight || 0) * (ev.cost_per_lb_at_time || 0);
      feedCostByDay.set(ev.date, (feedCostByDay.get(ev.date) || 0) + cost);
      totalFeedCost += cost;
    }
    for (const r of flockRevenues) {
      revByDay.set(r.date, (revByDay.get(r.date) || 0) + r.amount);
      totalRevenue += r.amount;
    }
    const totalEggs = flockProduction.reduce((s, p) => s + (p.egg_count || 0), 0);
    const headcount = flock.current_headcount || 0;
    const costPerDozen = totalEggs ? (totalFeedCost / totalEggs) * 12 : null;

    return {
      flock_id: flock.id,
      name: flock.name,
      breed_name: flock.breeds?.name || "",
      designation: flock.designation,
      headcount,
      total_feed_cost: Math.round(totalFeedCost * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      net_pl: Math.round((totalRevenue - totalFeedCost) * 100) / 100,
      cost_per_bird: headcount ? Math.round((totalFeedCost / headcount) * 1000) / 1000 : 0,
      cost_per_dozen: costPerDozen !== null ? Math.round(costPerDozen * 100) / 100 : null,
      daily_breakdown: dateRange(sd, ed).map((date) => {
        const fc = feedCostByDay.get(date) || 0;
        const rv = revByDay.get(date) || 0;
        return {
          date,
          feed_cost: Math.round(fc * 100) / 100,
          revenue: Math.round(rv * 100) / 100,
          net: Math.round((rv - fc) * 100) / 100,
        };
      }),
    };
  });
}

// ── Revenue ───────────────────────────────────────────────────

export async function createRevenue({ user_id, flock_id, date, amount, source, notes }) {
  const { data, error } = await supabase
    .from("revenues")
    .insert({
      user_id,
      flock_id: flock_id || null,
      date: date || new Date().toISOString().slice(0, 10),
      amount: Number(amount),
      source,
      notes: notes || null,
    })
    .select("id, user_id, flock_id, date, amount, source, notes, flocks(name)")
    .single();
  if (error) throw fmt(error, "Could not create revenue entry.");
  return revenueJson(data);
}

export async function getRevenueHistory({ start_date, end_date } = {}) {
  const range = currentMonthRange();
  const sd = start_date || range.start_date;
  const ed = end_date || range.end_date;

  const { data, error } = await supabase
    .from("revenues")
    .select("id, user_id, flock_id, date, amount, source, notes, flocks(name)")
    .gte("date", sd)
    .lte("date", ed)
    .order("date", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw fmt(error, "Could not load revenue history.");
  return (data || []).map(revenueJson);
}

function revenueJson(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    flock_id: r.flock_id,
    flock_name: r.flocks?.name || null,
    date: r.date,
    amount: Math.round(r.amount * 100) / 100,
    source: r.source,
    notes: r.notes,
  };
}

import { supabase } from "./supabaseClient";
import { getLocalDateString } from "../utils/date";

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start_date: getLocalDateString(start),
    end_date: getLocalDateString(end),
  };
}

function dateRange(startDate, endDate) {
  const dates = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cur <= end) {
    dates.push(getLocalDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export async function getFinancialSummary({ start_date, end_date } = {}) {
  const range = currentMonthRange();
  const sd = start_date || range.start_date;
  const ed = end_date || range.end_date;

  const [flocksResult, feedingResult] = await Promise.all([
    supabase.from("flocks").select("id, name"),
    supabase
      .from("feeding_events")
      .select("flock_id, date, total_weight, cost_per_lb_at_time")
      .gte("date", sd)
      .lte("date", ed),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load flocks.");
  if (feedingResult.error) throw fmt(feedingResult.error, "Could not load feeding data.");

  const flocks = flocksResult.data || [];
  const feedings = feedingResult.data || [];
  const feedCostByDay = new Map();
  const feedCostByFlock = new Map();

  for (const ev of feedings) {
    const cost = (ev.total_weight || 0) * (ev.cost_per_lb_at_time || 0);
    feedCostByDay.set(ev.date, (feedCostByDay.get(ev.date) || 0) + cost);
    feedCostByFlock.set(ev.flock_id, (feedCostByFlock.get(ev.flock_id) || 0) + cost);
  }

  const totalFeedCost = [...feedCostByDay.values()].reduce((sum, value) => sum + value, 0);
  const topFlockId = flocks.reduce(
    (best, flock) => (feedCostByFlock.get(flock.id) || 0) > (feedCostByFlock.get(best) || 0) ? flock.id : best,
    null,
  );
  const topFlock = flocks.find((flock) => flock.id === topFlockId);

  return {
    total_feed_cost: round2(totalFeedCost),
    feed_cost_by_day: dateRange(sd, ed).map((date) => ({
      date,
      cost: round2(feedCostByDay.get(date) || 0),
    })),
    top_cost_flock: {
      name: topFlock?.name || null,
      cost: round2(feedCostByFlock.get(topFlockId) || 0),
    },
  };
}

export async function getFlockFinancials({ start_date, end_date } = {}) {
  const range = currentMonthRange();
  const sd = start_date || range.start_date;
  const ed = end_date || range.end_date;

  const [flocksResult, feedingResult, productionResult] = await Promise.all([
    supabase
      .from("flocks")
      .select(
        "id, name, designation, current_headcount, egg_price_per_dozen, meat_price_per_lb, meat_price_per_bird, breeds(name, animal_types(produces_eggs, produces_meat))",
      )
      .order("name"),
    supabase
      .from("feeding_events")
      .select("flock_id, date, total_weight, cost_per_lb_at_time")
      .gte("date", sd)
      .lte("date", ed),
    supabase
      .from("production_logs")
      .select("flock_id, date, egg_count")
      .gte("date", sd)
      .lte("date", ed),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load flocks.");
  if (feedingResult.error) throw fmt(feedingResult.error, "Could not load feeding data.");
  if (productionResult.error) throw fmt(productionResult.error, "Could not load production data.");

  const feedings = feedingResult.data || [];
  const production = productionResult.data || [];

  return (flocksResult.data || []).map((flock) => {
    const flockFeedings = feedings.filter((event) => event.flock_id === flock.id);
    const flockProduction = production.filter((event) => event.flock_id === flock.id);

    const feedCostByDay = new Map();
    let totalFeedCost = 0;

    for (const ev of flockFeedings) {
      const cost = (ev.total_weight || 0) * (ev.cost_per_lb_at_time || 0);
      feedCostByDay.set(ev.date, (feedCostByDay.get(ev.date) || 0) + cost);
      totalFeedCost += cost;
    }

    const totalEggs = flockProduction.reduce((sum, log) => sum + (log.egg_count || 0), 0);
    const headcount = flock.current_headcount || 0;
    const costPerDozen = totalEggs ? (totalFeedCost / totalEggs) * 12 : null;

    return {
      flock_id: flock.id,
      name: flock.name,
      breed_name: flock.breeds?.name || "",
      designation: flock.designation,
      headcount,
      produces_eggs: flock.breeds?.animal_types?.produces_eggs ?? false,
      produces_meat: flock.breeds?.animal_types?.produces_meat ?? true,
      egg_price_per_dozen: Number(flock.egg_price_per_dozen || 0),
      meat_price_per_lb: Number(flock.meat_price_per_lb || 0),
      meat_price_per_bird: Number(flock.meat_price_per_bird || 0),
      total_feed_cost: round2(totalFeedCost),
      cost_per_animal: headcount ? round3(totalFeedCost / headcount) : 0,
      cost_per_dozen: costPerDozen !== null ? round2(costPerDozen) : null,
      daily_breakdown: dateRange(sd, ed).map((date) => ({
        date,
        feed_cost: round2(feedCostByDay.get(date) || 0),
      })),
    };
  });
}

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((n || 0) * 1000) / 1000;
}

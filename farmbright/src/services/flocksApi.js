import { supabase } from "./supabaseClient";

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

// ── Flock List ───────────────────────────────────────────────
// Returns flocks with breed name, animal class name, and assigned feeds.
// Stats (last_fed, today_fed, totals) are derived from feeding_events and
// production_logs fetched in a second parallel query.

export async function getFlocks() {
  const today = new Date().toISOString().slice(0, 10);

  const [flocksResult, feedingResult] = await Promise.all([
    supabase
      .from("flocks")
      .select(
        `id, name, designation, pen_name, current_headcount, created_at,
         breeds ( name, animal_classes ( name, class_type ) ),
         feed_assignments (
           id, feed_type_id,
           feed_types ( name, unit, cost_per_unit, current_on_hand, par_level, bag_weight, bag_price )
         )`
      )
      .order("name"),
    supabase
      .from("feeding_events")
      .select("flock_id, date, timestamp, total_weight, cost_per_lb_at_time"),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load flocks.");
  if (feedingResult.error) throw fmt(feedingResult.error, "Could not load feeding events.");

  const allFeedings = feedingResult.data || [];

  // Aggregate feeding data per flock in JS
  const feedingByFlock = new Map();
  for (const ev of allFeedings) {
    const existing = feedingByFlock.get(ev.flock_id) || {
      last_fed: null,
      today_fed: false,
      total_feed_cost_alltime: 0,
    };
    const cost = (ev.total_weight || 0) * (ev.cost_per_lb_at_time || 0);
    existing.total_feed_cost_alltime += cost;
    if (!existing.last_fed || ev.timestamp > existing.last_fed) {
      existing.last_fed = ev.timestamp;
    }
    if (ev.date === today) existing.today_fed = true;
    feedingByFlock.set(ev.flock_id, existing);
  }

  // Also get egg totals per flock
  const flockIds = (flocksResult.data || []).map((f) => f.id);
  let eggsByFlock = new Map();
  if (flockIds.length) {
    const { data: eggRows } = await supabase
      .from("production_logs")
      .select("flock_id, egg_count")
      .in("flock_id", flockIds);
    for (const row of eggRows || []) {
      eggsByFlock.set(row.flock_id, (eggsByFlock.get(row.flock_id) || 0) + (row.egg_count || 0));
    }
  }

  return (flocksResult.data || []).map((flock) => {
    const stats = feedingByFlock.get(flock.id) || {
      last_fed: null,
      today_fed: false,
      total_feed_cost_alltime: 0,
    };
    return {
      id: flock.id,
      name: flock.name,
      designation: flock.designation,
      pen_name: flock.pen_name,
      current_headcount: flock.current_headcount,
      created_at: flock.created_at,
      breed_name: flock.breeds?.name || "",
      animal_class_name: flock.breeds?.animal_classes?.name || "",
      class_type: flock.breeds?.animal_classes?.class_type || 'poultry',
      assigned_feeds: (flock.feed_assignments || []).map((a) => ({
        feed_type_id: a.feed_type_id,
        name: a.feed_types?.name || "",
        cost_per_lb: a.feed_types?.cost_per_unit || 0,
        current_on_hand: a.feed_types?.current_on_hand || 0,
        unit: a.feed_types?.unit || "lbs",
        status: feedStatus(a.feed_types),
      })),
      last_fed: stats.last_fed,
      today_fed: stats.today_fed,
      total_feed_cost_alltime: Math.round(stats.total_feed_cost_alltime * 100) / 100,
      total_eggs_alltime: eggsByFlock.get(flock.id) || 0,
    };
  });
}

// ── Flock Detail ─────────────────────────────────────────────

export async function getFlockDetail(flockId) {
  const today = new Date().toISOString().slice(0, 10);
  const start14 = offsetDate(-13);
  const start30 = offsetDate(-29);

  const [flockResult, feedingResult, productionResult, casualtyResult] = await Promise.all([
    supabase
      .from("flocks")
      .select(
        `id, name, designation, pen_name, current_headcount, created_at,
         breeds ( name, animal_classes ( name, class_type ) ),
         feed_assignments (
           id, feed_type_id,
           feed_types ( id, name, unit, cost_per_unit, current_on_hand, par_level )
         )`
      )
      .eq("id", flockId)
      .single(),
    supabase
      .from("feeding_events")
      .select("id, date, timestamp, feed_type_id, total_weight, cost_per_lb_at_time, input_method, feed_types(name)")
      .eq("flock_id", flockId)
      .order("date", { ascending: false })
      .order("timestamp", { ascending: false }),
    supabase
      .from("production_logs")
      .select("id, date, egg_count, water_consumed, notes")
      .eq("flock_id", flockId)
      .order("date", { ascending: false }),
    supabase
      .from("casualty_logs")
      .select("id, date, change_amount, notes")
      .eq("flock_id", flockId)
      .order("date", { ascending: false }),
  ]);

  if (flockResult.error) throw fmt(flockResult.error, "Could not load flock.");
  if (feedingResult.error) throw fmt(feedingResult.error, "Could not load feeding history.");
  if (productionResult.error) throw fmt(productionResult.error, "Could not load production history.");
  if (casualtyResult.error) throw fmt(casualtyResult.error, "Could not load casualty history.");

  const flock = flockResult.data;
  const allFeedings = feedingResult.data || [];
  const allProduction = productionResult.data || [];
  const casualties = casualtyResult.data || [];

  const headcount = Math.max(flock.current_headcount || 0, 1);
  const isLayer = ["layer", "breeder", "mixed"].includes(flock.designation);

  // 30-day stats
  const last30Feedings = allFeedings.filter((e) => e.date >= start30 && e.date <= today);
  const last30FeedCost = last30Feedings.reduce((sum, e) => sum + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0), 0);
  const last30Eggs = allProduction
    .filter((p) => p.date >= start30 && p.date <= today)
    .reduce((sum, p) => sum + (p.egg_count || 0), 0);
  const days = 30;

  const totalFeedCost = allFeedings.reduce((sum, e) => sum + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0), 0);
  const totalEggs = allProduction.reduce((sum, p) => sum + (p.egg_count || 0), 0);

  const costPerDozen = isLayer && last30Eggs ? (last30FeedCost / last30Eggs) * 12 : null;

  // Headcount timeline from casualty logs
  const sortedCasualties = [...casualties].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id
  );
  const startingHeadcount = (flock.current_headcount || 0) - sortedCasualties.reduce((s, c) => s + c.change_amount, 0);
  const headcountTimeline = [
    { date: flock.created_at ? flock.created_at.slice(0, 10) : null, headcount: startingHeadcount },
  ];
  let running = startingHeadcount;
  for (const c of sortedCasualties) {
    running += c.change_amount;
    headcountTimeline.push({ date: c.date, headcount: running });
  }

  return {
    flock: {
      id: flock.id,
      name: flock.name,
      designation: flock.designation,
      pen_name: flock.pen_name,
      current_headcount: flock.current_headcount,
      breed_name: flock.breeds?.name || "",
      animal_class_name: flock.breeds?.animal_classes?.name || "",
      class_type: flock.breeds?.animal_classes?.class_type || 'poultry',
      created_at: flock.created_at,
    },
    assigned_feeds: (flock.feed_assignments || []).map((a) => ({
      feed_type_id: a.feed_type_id,
      name: a.feed_types?.name || "",
      cost_per_lb: a.feed_types?.cost_per_unit || 0,
      current_on_hand: a.feed_types?.current_on_hand || 0,
      unit: a.feed_types?.unit || "lbs",
      status: feedStatus(a.feed_types),
    })),
    stats: {
      total_feed_cost_alltime: round2(totalFeedCost),
      total_eggs_alltime: totalEggs,
      avg_cost_per_bird_per_day: round4(last30FeedCost / headcount / days),
      avg_eggs_per_day: isLayer ? round2(last30Eggs / days) : null,
      current_cost_per_dozen: costPerDozen !== null ? round2(costPerDozen) : null,
    },
    recent_feedings: allFeedings
      .filter((e) => e.date >= start14)
      .map((e) => feedingJson(e, flock.current_headcount)),
    recent_production: allProduction.filter((p) => p.date >= start14).map(productionJson),
    casualty_history: casualties.map(casualtyJson),
    headcount_timeline: headcountTimeline,
  };
}

// ── Feeding History (paginated) ──────────────────────────────

export async function getFeedingHistory(flockId, { start_date, end_date, page = 1, per_page = 50 } = {}) {
  let query = supabase
    .from("feeding_events")
    .select("id, date, timestamp, feed_type_id, total_weight, cost_per_lb_at_time, input_method, feed_types(name)", {
      count: "exact",
    })
    .eq("flock_id", flockId)
    .order("date", { ascending: false })
    .order("timestamp", { ascending: false });

  if (start_date) query = query.gte("date", start_date);
  if (end_date) query = query.lte("date", end_date);

  const from = (page - 1) * per_page;
  query = query.range(from, from + per_page - 1);

  const { data, error, count } = await query;
  if (error) throw fmt(error, "Could not load feeding history.");

  const headcount = await getFlockHeadcount(flockId);
  return {
    items: (data || []).map((e) => feedingJson(e, headcount)),
    page,
    per_page,
    total: count || 0,
    pages: Math.ceil((count || 0) / per_page),
  };
}

// ── Production History (paginated) ───────────────────────────

export async function getProductionHistory(flockId, { start_date, end_date, page = 1, per_page = 50 } = {}) {
  let query = supabase
    .from("production_logs")
    .select("id, date, egg_count, water_consumed, notes", { count: "exact" })
    .eq("flock_id", flockId)
    .order("date", { ascending: false });

  if (start_date) query = query.gte("date", start_date);
  if (end_date) query = query.lte("date", end_date);

  const from = (page - 1) * per_page;
  query = query.range(from, from + per_page - 1);

  const { data, error, count } = await query;
  if (error) throw fmt(error, "Could not load production history.");

  return {
    items: (data || []).map(productionJson),
    page,
    per_page,
    total: count || 0,
    pages: Math.ceil((count || 0) / per_page),
  };
}

// ── Mutations ─────────────────────────────────────────────────

export async function logProduction(flockId, payload) {
  const { data, error } = await supabase
    .from("production_logs")
    .insert({
      flock_id: flockId,
      date: payload.date || new Date().toISOString().slice(0, 10),
      egg_count: payload.egg_count != null ? Number(payload.egg_count) : null,
      water_consumed: payload.water_consumed != null ? Number(payload.water_consumed) : null,
      notes: payload.notes || null,
    })
    .select()
    .single();
  if (error) throw fmt(error, "Could not log production.");
  return productionJson(data);
}

export async function logCasualty(flockId, payload) {
  const { data, error } = await supabase
    .from("casualty_logs")
    .insert({
      flock_id: flockId,
      date: payload.date || new Date().toISOString().slice(0, 10),
      change_amount: Number(payload.change_amount),
      notes: payload.notes || null,
    })
    .select()
    .single();
  if (error) throw fmt(error, "Could not log casualty.");
  // current_headcount is updated by the Postgres trigger
  const { data: flock } = await supabase.from("flocks").select("current_headcount").eq("id", flockId).single();
  return { updated_headcount: flock?.current_headcount, change_amount: data.change_amount };
}

// ── Helpers ───────────────────────────────────────────────────

async function getFlockHeadcount(flockId) {
  const { data } = await supabase.from("flocks").select("current_headcount").eq("id", flockId).single();
  return data?.current_headcount || 0;
}

function feedingJson(event, headcount) {
  const hc = Math.max(headcount || 0, 1);
  const costTotal = (event.total_weight || 0) * (event.cost_per_lb_at_time || 0);
  return {
    id: event.id,
    date: event.date,
    timestamp: event.timestamp,
    feed_name: event.feed_types?.name || "",
    total_weight: round2(event.total_weight || 0),
    weight_per_bird: round3((event.total_weight || 0) / hc),
    cost_total: round2(costTotal),
    cost_per_bird: round3(costTotal / hc),
    input_method: event.input_method,
  };
}

function productionJson(log) {
  return {
    id: log.id,
    date: log.date,
    egg_count: log.egg_count,
    water_consumed: log.water_consumed,
    notes: log.notes,
  };
}

function casualtyJson(log) {
  return { id: log.id, date: log.date, change_amount: log.change_amount, notes: log.notes };
}

function feedStatus(ft) {
  if (!ft) return "ok";
  if (ft.current_on_hand <= ft.par_level) return "critical";
  if (ft.current_on_hand <= ft.par_level * 2) return "warning";
  return "ok";
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
function round4(n) { return Math.round(n * 10000) / 10000; }

import { supabase } from "./supabaseClient";

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

function feedStatus(ft) {
  if (!ft) return "ok";
  if (ft.current_on_hand <= ft.par_level) return "critical";
  if (ft.current_on_hand <= ft.par_level * 2) return "warning";
  return "ok";
}

export async function getDashboardOverview() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = offsetDate(-1);

  // Run all reads in parallel
  const [
    flocksResult,
    feedTypesResult,
    todayFeedingResult,  
    todayProductionResult,
    yesterdayFeedingResult,
    yesterdayProductionResult,
    yesterdayRevenueResult,
    alertsResult,
  ] = await Promise.all([
    supabase
      .from("flocks")
      .select(
        `id, name, designation, current_headcount,
         breeds ( name, animal_types ( name, emoji, produces_eggs, animal_classes ( name, class_type ) ) ),
         feed_assignments ( feed_types ( name ) )`
      )
      .order("name"),
    supabase
      .from("feed_types")
      .select("name, current_on_hand, par_level, unit")
      .order("name"),
    supabase
      .from("feeding_events")
      .select("flock_id, total_weight, cost_per_lb_at_time, timestamp")
      .eq("date", today),
    supabase
      .from("production_logs")
      .select("flock_id, egg_count")
      .eq("date", today),
    supabase
      .from("feeding_events")
      .select("flock_id, total_weight, cost_per_lb_at_time")
      .eq("date", yesterday),
    supabase
      .from("production_logs")
      .select("egg_count")
      .eq("date", yesterday),
    supabase
      .from("revenues")
      .select("amount")
      .eq("date", yesterday),
    supabase
      .from("alerts")
      .select("id, feed_type_id, alert_type, is_read, feed_types(name, current_on_hand, par_level, unit)")
      .eq("is_read", false)
      .eq("alert_type", "low_feed")
      .order("created_at", { ascending: false }),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load flocks.");
  if (feedTypesResult.error) throw fmt(feedTypesResult.error, "Could not load feed types.");

  const flocks = flocksResult.data || [];
  const flockIds = new Set(flocks.map((f) => f.id));

  // Today feeding data per flock
  const todayFeedingByFlock = new Map();
  for (const ev of todayFeedingResult.data || []) {
    if (!flockIds.has(ev.flock_id)) continue;
    const list = todayFeedingByFlock.get(ev.flock_id) || [];
    list.push(ev);
    todayFeedingByFlock.set(ev.flock_id, list);
  }

  const fedFlockIds = new Set(todayFeedingByFlock.keys());
  const pendingFlocks = flocks
    .filter((f) => !fedFlockIds.has(f.id))
    .map((f) => ({
      flock_id: f.id,
      name: f.name,
      breed_name: f.breeds?.name || "",
      designation: f.designation,
      assigned_feeds: (f.feed_assignments || []).map((a) => a.feed_types?.name).filter(Boolean),
    }));

  // Today production
  const todayEggs = (todayProductionResult.data || []).reduce((s, p) => s + (p.egg_count || 0), 0);

  // Today totals
  const allTodayEvents = [...todayFeedingByFlock.values()].flat();
  const todayFeedUsed = allTodayEvents.reduce((s, e) => s + (e.total_weight || 0), 0);
  const todayFeedCost = allTodayEvents.reduce(
    (s, e) => s + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0),
    0
  );

  // Yesterday
  const yFeedCost = (yesterdayFeedingResult.data || [])
    .filter((e) => flockIds.has(e.flock_id))
    .reduce((s, e) => s + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0), 0);
  const yEggs = (yesterdayProductionResult.data || []).reduce((s, p) => s + (p.egg_count || 0), 0);
  const yRevenue = (yesterdayRevenueResult.data || []).reduce((s, r) => s + (r.amount || 0), 0);

  // Deduplicate active alerts
  const seen = new Set();
  const activeAlerts = (alertsResult.data || [])
    .filter((a) => {
      const ft = a.feed_types;
      if (!ft || ft.current_on_hand > ft.par_level) return false;
      if (seen.has(a.feed_type_id)) return false;
      seen.add(a.feed_type_id);
      return true;
    })
    .map((a) => ({
      alert_id: a.id,
      feed_name: a.feed_types?.name || "Feed",
      current_on_hand: a.feed_types?.current_on_hand ?? 0,
      par_level: a.feed_types?.par_level ?? 0,
      unit: a.feed_types?.unit || "lbs",
    }));

  return {
    today: {
      date: today,
      flocks_total: flocks.length,
      flocks_fed: fedFlockIds.size,
      flocks_pending: pendingFlocks,
      flocks: flocks.map((f) => {
        const events = todayFeedingByFlock.get(f.id) || [];
        const fedAt = events.reduce(
          (min, e) => (e.timestamp && (!min || e.timestamp < min) ? e.timestamp : min),
          null
        );
        return {
          flock_id: f.id,
          name: f.name,
          breed_name: f.breeds?.name || "",
          designation: f.designation,
          class_type: f.breeds?.animal_types?.animal_classes?.class_type || 'other',
          emoji: f.breeds?.animal_types?.emoji || '🐾',
          produces_eggs: f.breeds?.animal_types?.produces_eggs ?? false,
          breeds: f.breeds,
          assigned_feeds: (f.feed_assignments || []).map((a) => a.feed_types?.name).filter(Boolean),
          status: events.length ? "fed" : "pending",
          fed_at: fedAt || null,
        };
      }),
      total_feed_used_lbs: Math.round(todayFeedUsed * 100) / 100,
      total_feed_cost: Math.round(todayFeedCost * 100) / 100,
      total_eggs: todayEggs,
    },
    alerts: activeAlerts,
    yesterday: {
      total_feed_cost: Math.round(yFeedCost * 100) / 100,
      total_eggs: yEggs,
      net_pl: Math.round((yRevenue - yFeedCost) * 100) / 100,
    },
    feed_stocks: (feedTypesResult.data || []).map((ft) => ({
      name: ft.name,
      current_on_hand: ft.current_on_hand,
      par_level: ft.par_level,
      unit: ft.unit,
      status: feedStatus(ft),
    })),
  };
}

export async function dismissInventoryAlert(alertId) {
  const { error } = await supabase.from("alerts").update({ is_read: true }).eq("id", alertId);
  if (error) throw fmt(error, "Could not dismiss alert.");
  return { success: true };
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

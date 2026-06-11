import { supabase } from "./supabaseClient";

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

function getLocalDateString() {
  const now = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function feedStatus(ft) {
  if (!ft) return "ok";
  if (ft.current_on_hand <= ft.par_level) return "critical";
  if (ft.current_on_hand <= ft.par_level * 2) return "warning";
  return "ok";
}

// ── Queue ─────────────────────────────────────────────────────

export async function getQueue() {
  const today = getLocalDateString();

  const [flocksResult, todayFeedingResult] = await Promise.all([
    supabase
      .from("flocks")
      .select(
        `id, name, designation, pen_name, current_headcount,
         breeds ( name, animal_types ( name, emoji, produces_eggs, produces_milk, produces_meat, produces_young, working_animal, animal_classes ( name, class_type ) ) ),
         feed_assignments (
           id, feed_type_id,
           feed_types ( id, name, unit, cost_per_unit, current_on_hand, par_level, bag_weight, bag_price )
         )`
      )
      .order("name"),
    supabase
      .from("feeding_events")
      .select("flock_id, timestamp")
      .eq("date", today),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load queue.");

  const todayByFlock = new Map();
  for (const ev of todayFeedingResult.data || []) {
    const existing = todayByFlock.get(ev.flock_id);
    if (!existing || ev.timestamp < existing) {
      todayByFlock.set(ev.flock_id, ev.timestamp);
    }
  }

  return (flocksResult.data || []).map((flock) => ({
    flock_id: flock.id,
    name: flock.name,
    breeds: flock.breeds,
    breed_name: flock.breeds?.name || "",
    animal_class_name: flock.breeds?.animal_types?.animal_classes?.name || "",
    class_type: flock.breeds?.animal_types?.animal_classes?.class_type || 'other',
    emoji: flock.breeds?.animal_types?.emoji || '🐾',
    produces_eggs: flock.breeds?.animal_types?.produces_eggs ?? false,
    produces_milk: flock.breeds?.animal_types?.produces_milk ?? false,
    produces_meat: flock.breeds?.animal_types?.produces_meat ?? true,
    produces_young: flock.breeds?.animal_types?.produces_young ?? true,
    working_animal: flock.breeds?.animal_types?.working_animal ?? false,
    designation: flock.designation,
    pen_name: flock.pen_name,
    current_headcount: flock.current_headcount,
    assigned_feeds: (flock.feed_assignments || [])
      .filter((a) => a.feed_types)
      .map((a) => ({
        feed_type_id: a.feed_type_id,
        name: a.feed_types.name,
        unit: a.feed_types.unit,
        cost_per_unit: a.feed_types.cost_per_unit,
        cost_per_lb: a.feed_types.cost_per_unit,
        bag_weight: a.feed_types.bag_weight,
        bag_price: a.feed_types.bag_price,
        current_on_hand: a.feed_types.current_on_hand,
      })),
    fed_today: todayByFlock.has(flock.id),
    fed_at: todayByFlock.get(flock.id) || null,
  }));
}

// ── Queue summary ─────────────────────────────────────────────

export async function getQueueSummary() {
  const today = getLocalDateString();

  const [flocksResult, feedingResult, productionResult, casualtyResult] = await Promise.all([
    supabase.from("flocks").select("id, current_headcount"),
    supabase.from("feeding_events").select("flock_id, total_weight, cost_per_lb_at_time").eq("date", today),
    supabase.from("production_logs").select("flock_id, egg_count").eq("date", today),
    supabase
      .from("casualty_logs")
      .select("flock_id, change_amount")
      .eq("date", today)
      .lt("change_amount", 0),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load summary.");

  const flocks = flocksResult.data || [];
  const flockIds = new Set(flocks.map((f) => f.id));

  const fedFlockIds = new Set(
    (feedingResult.data || []).filter((e) => flockIds.has(e.flock_id)).map((e) => e.flock_id)
  );
  const totalHeadcount = flocks.reduce((s, f) => s + Math.max(f.current_headcount || 0, 0), 0);

  const userEvents = (feedingResult.data || []).filter((e) => flockIds.has(e.flock_id));
  const totalFeedCost = userEvents.reduce(
    (s, e) => s + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0),
    0
  );
  const totalFeedUsed = userEvents.reduce((s, e) => s + (e.total_weight || 0), 0);
  const totalEggs = (productionResult.data || [])
    .filter((p) => flockIds.has(p.flock_id))
    .reduce((s, p) => s + (p.egg_count || 0), 0);
  const casualties = Math.abs(
    (casualtyResult.data || [])
      .filter((c) => flockIds.has(c.flock_id))
      .reduce((s, c) => s + (c.change_amount || 0), 0)
  );

  return {
    date: today,
    total_flocks: flocks.length,
    flocks_fed: fedFlockIds.size,
    flocks_pending: Math.max(flocks.length - fedFlockIds.size, 0),
    total_feed_used_lbs: Math.round(totalFeedUsed * 100) / 100,
    total_feed_cost: Math.round(totalFeedCost * 100) / 100,
    total_eggs: totalEggs,
    cost_per_bird: totalHeadcount ? Math.round((totalFeedCost / totalHeadcount) * 1000) / 1000 : 0,
    casualties,
    all_done: flocks.length > 0 && fedFlockIds.size === flocks.length,
  };
}

// ── Log session ───────────────────────────────────────────────
// Inserts casualty (optional), feeding event, and production log (optional)
// as sequential Data API calls. Triggers handle all side effects.

export async function logSession({ flock_id, feeding, production, headcount_change, casualty_notes, date }) {
  const targetDate = date || getLocalDateString();
  const results = {};

  if (headcount_change && headcount_change !== 0) {
    const { data, error } = await supabase
      .from("casualty_logs")
      .insert({
        flock_id,
        date: targetDate,
        change_amount: Number(headcount_change),
        notes: casualty_notes || null,
      })
      .select()
      .single();
    if (error) throw fmt(error, "Could not log headcount change.");
    results.casualty = data;
  }

  const { data: feedingEvent, error: feedingError } = await supabase
    .from("feeding_events")
    .insert({
      flock_id,
      feed_type_id: feeding.feed_type_id,
      date: targetDate,
      total_weight: Number(feeding.total_weight),
      input_method: feeding.input_method || "manual",
    })
    .select("id, flock_id, feed_type_id, date, timestamp, total_weight, cost_per_lb_at_time, input_method")
    .single();
  if (feedingError) throw fmt(feedingError, "Could not log feeding event.");
  results.feeding_event = feedingEvent;

  if (production && hasProductionData(production)) {
    const { data, error } = await supabase
      .from("production_logs")
      .insert({
        flock_id,
        date: targetDate,
        egg_count:     production.egg_count     != null ? Number(production.egg_count)     : null,
        water_consumed: production.water_consumed != null ? Number(production.water_consumed) : null,
        litter_count:  production.litter_count  != null ? Number(production.litter_count)  : null,
        litter_size:   production.litter_size   != null ? Number(production.litter_size)   : null,
        litter_notes:  production.litter_notes  || null,
        milk_gallons:  production.milk_gallons  != null ? Number(production.milk_gallons)  : null,
        notes:         production.notes || null,
      })
      .select()
      .single();
    if (error) throw fmt(error, "Could not log production.");
    results.production = data;
  }

  // Fetch updated state after triggers have run
  const [flockResult, feedResult] = await Promise.all([
    supabase.from("flocks").select("current_headcount").eq("id", flock_id).single(),
    supabase
      .from("feed_types")
      .select("current_on_hand, par_level")
      .eq("id", feeding.feed_type_id)
      .single(),
  ]);

  const nextFlock = await getNextUnfedFlock(flock_id, targetDate);

  return {
    success: true,
    feeding_event: feedingEventJson(results.feeding_event),
    updated_headcount: flockResult.data?.current_headcount,
    feed_remaining: Math.round((feedResult.data?.current_on_hand || 0) * 100) / 100,
    low_feed_alert: (feedResult.data?.current_on_hand || 0) <= (feedResult.data?.par_level || 0),
    next_flock: nextFlock,
  };
}

// ── Today events ──────────────────────────────────────────────

export async function getTodayEvents() {
  const today = getLocalDateString();

  const [eventsResult, flocksResult] = await Promise.all([
    supabase
      .from("feeding_events")
      .select("id, flock_id, feed_type_id, date, timestamp, total_weight, cost_per_lb_at_time, input_method, flocks(id, name, current_headcount, breeds(name, animal_types(name, emoji))), feed_types(name)")
      .eq("date", today)
      .order("timestamp", { ascending: false }),
    supabase
      .from("flocks")
      .select("id, name, current_headcount"),
  ]);

  if (eventsResult.error) throw fmt(eventsResult.error, "Could not load today's events.");

  const events = eventsResult.data || [];
  const flocks = flocksResult.data || [];
  const flockIds = flocks.map((f) => f.id);

  const productionResult = flockIds.length
    ? await supabase.from("production_logs").select("flock_id, egg_count, water_consumed").eq("date", today).in("flock_id", flockIds)
    : { data: [] };

  const prodByFlock = {};
  for (const p of productionResult.data || []) {
    prodByFlock[p.flock_id] = p;
  }

  const totalWeight = events.reduce((s, e) => s + (e.total_weight || 0), 0);
  const totalCost = events.reduce((s, e) => s + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0), 0);

  const breakdown = flocks.map((f) => {
    const flockEvents = events.filter((e) => e.flock_id === f.id);
    return {
      flock_id: f.id,
      flock_name: f.name,
      feed_used_lbs: Math.round(flockEvents.reduce((s, e) => s + (e.total_weight || 0), 0) * 100) / 100,
      cost: Math.round(flockEvents.reduce((s, e) => s + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0), 0) * 100) / 100,
      eggs: prodByFlock[f.id]?.egg_count || 0,
      final_count: f.current_headcount,
    };
  });

  return {
    events: events.map((e) => ({
      ...feedingEventJson(e),
      flocks: e.flocks,
      feed_types: e.feed_types,
      egg_count: prodByFlock[e.flock_id]?.egg_count ?? null,
      water_consumed: prodByFlock[e.flock_id]?.water_consumed ?? null,
    })),
    breakdown,
    totals: {
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      eventCount: events.length,
    },
  };
}

// ── Delete event ──────────────────────────────────────────────
// Trigger restores inventory and creates a reversal transaction.

export async function deleteEvent(eventId) {
  const { data: eventRow } = await supabase
    .from("feeding_events")
    .select("feed_type_id")
    .eq("id", eventId)
    .single();

  const { error } = await supabase.from("feeding_events").delete().eq("id", eventId);
  if (error) throw fmt(error, "Could not delete feeding event.");

  const { data: feedType } = await supabase
    .from("feed_types")
    .select("current_on_hand")
    .eq("id", eventRow?.feed_type_id)
    .single();

  return {
    success: true,
    feed_remaining: Math.round((feedType?.current_on_hand || 0) * 100) / 100,
  };
}

// ── Patch event ───────────────────────────────────────────────
// Trigger handles inventory delta when total_weight or feed_type_id changes.

export async function patchEvent(eventId, { feed_type_id, total_weight, date }) {
  const patch = {};
  if (feed_type_id != null) patch.feed_type_id = feed_type_id;
  if (total_weight != null) patch.total_weight = Number(total_weight);
  if (date != null) patch.date = date;

  const { data, error } = await supabase
    .from("feeding_events")
    .update(patch)
    .eq("id", eventId)
    .select("id, flock_id, feed_type_id, date, timestamp, total_weight, cost_per_lb_at_time, input_method, flocks(name, current_headcount), feed_types(name)")
    .single();
  if (error) throw fmt(error, "Could not update feeding event.");
  return { ...feedingEventJson(data), flock_name: data.flocks?.name || "", feed_name: data.feed_types?.name || "" };
}

// ── Helpers ───────────────────────────────────────────────────

async function getNextUnfedFlock(currentFlockId, targetDate) {
  const { data: flocks } = await supabase.from("flocks").select("id, name").order("name");
  if (!flocks?.length) return null;

  const { data: fedToday } = await supabase
    .from("feeding_events")
    .select("flock_id")
    .eq("date", targetDate)
    .in("flock_id", flocks.map((f) => f.id));

  const fedIds = new Set((fedToday || []).map((e) => e.flock_id));
  const next = flocks.find((f) => !fedIds.has(f.id));
  return next ? { flock_id: next.id, name: next.name } : null;
}

function feedingEventJson(event) {
  const headcount = event.flocks?.current_headcount || 1;
  const hc = Math.max(headcount, 1);
  const costTotal = (event.total_weight || 0) * (event.cost_per_lb_at_time || 0);
  return {
    id: event.id,
    date: event.date,
    timestamp: event.timestamp,
    flock_id: event.flock_id,
    feed_type_id: event.feed_type_id,
    total_weight: Math.round((event.total_weight || 0) * 100) / 100,
    cost_per_lb_at_time: event.cost_per_lb_at_time != null
      ? Math.round(event.cost_per_lb_at_time * 10000) / 10000
      : null,
    weight_per_bird: Math.round(((event.total_weight || 0) / hc) * 1000) / 1000,
    cost_total: Math.round(costTotal * 100) / 100,
    cost_per_bird: Math.round((costTotal / hc) * 1000) / 1000,
    input_method: event.input_method,
  };
}

function hasProductionData(p) {
  return p && (
    p.egg_count     != null ||
    p.water_consumed != null ||
    p.litter_count  != null ||
    p.litter_size   != null ||
    p.milk_gallons  != null ||
    p.notes
  );
}

// ── Deferred: DYMO HID scale (hardware bridge removed with Flask) ──────────
// The live scale stream is not available in the Supabase-only MVP.
// ScaleHouse.jsx checks `connected: false` and shows manual-entry mode.

export function getScaleStatus() {
  return Promise.resolve({ connected: false, device: null });
}

export function openScaleStream(_onReading, onError) {
  onError(new Error("Live scale not available in manual mode."));
  return { close: () => {} };
}

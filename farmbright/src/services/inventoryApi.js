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

function feedTypeJson(ft) {
  const costPerLb = ft.bag_weight > 0 ? Math.round((ft.bag_price / ft.bag_weight) * 10000) / 10000 : 0;
  return {
    id: ft.id,
    user_id: ft.user_id,
    name: ft.name,
    unit: ft.unit,
    cost_per_unit: ft.cost_per_unit,
    cost_per_lb: costPerLb,
    bag_weight: ft.bag_weight,
    bag_price: ft.bag_price,
    par_level: ft.par_level,
    current_on_hand: ft.current_on_hand,
    status: feedStatus(ft),
  };
}

// ── Inventory list ────────────────────────────────────────────

export async function getInventory() {
  const { data, error } = await supabase
    .from("feed_types")
    .select("id,user_id,name,unit,cost_per_unit,bag_weight,bag_price,par_level,current_on_hand")
    .order("name");
  if (error) throw fmt(error, "Could not load inventory.");
  return (data || []).map(feedTypeJson);
}

// ── Alerts ────────────────────────────────────────────────────

export async function getInventoryAlerts() {
  const { data, error } = await supabase
    .from("alerts")
    .select(
      `alert_id:id, feed_type_id,
       message, created_at, is_read,
       feed_types ( name, current_on_hand, par_level, unit )`
    )
    .eq("is_read", false)
    .eq("alert_type", "low_feed")
    .order("created_at", { ascending: false });
  if (error) throw fmt(error, "Could not load alerts.");

  // Deduplicate: keep only the first (latest) alert per feed_type_id that is still critical
  const seen = new Set();
  return (data || [])
    .filter((a) => {
      const ft = a.feed_types;
      if (!ft || ft.current_on_hand > ft.par_level) return false;
      if (seen.has(a.feed_type_id)) return false;
      seen.add(a.feed_type_id);
      return true;
    })
    .map((a) => ({
      alert_id: a.alert_id,
      feed_type_id: a.feed_type_id,
      feed_name: a.feed_types?.name || "Feed",
      message: a.message,
      current_on_hand: a.feed_types?.current_on_hand ?? 0,
      par_level: a.feed_types?.par_level ?? 0,
      unit: a.feed_types?.unit || "lbs",
      created_at: a.created_at,
    }));
}

// ── Transactions ──────────────────────────────────────────────

export async function getFeedTransactions(feedId, { start_date, end_date } = {}) {
  let query = supabase
    .from("inventory_transactions")
    .select("id,feed_type_id,date,transaction_type,quantity_change,unit_cost,bag_weight,bag_price,cost_per_lb,notes")
    .eq("feed_type_id", feedId)
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (start_date) query = query.gte("date", start_date);
  if (end_date) query = query.lte("date", end_date);

  const [txResult, feedResult] = await Promise.all([
    query,
    supabase.from("feed_types").select("current_on_hand").eq("id", feedId).single(),
  ]);

  if (txResult.error) throw fmt(txResult.error, "Could not load transactions.");
  if (feedResult.error) throw fmt(feedResult.error, "Could not load feed type.");

  const transactions = txResult.data || [];
  const currentOnHand = feedResult.data?.current_on_hand || 0;

  // Compute running balance forward from the starting balance
  const totalChange = transactions.reduce((s, t) => s + (t.quantity_change || 0), 0);
  let runningBalance = currentOnHand - totalChange;

  const rows = transactions.map((t) => {
    runningBalance += t.quantity_change || 0;
    return {
      id: t.id,
      feed_type_id: t.feed_type_id,
      date: t.date,
      transaction_type: t.transaction_type,
      quantity_change: Math.round((t.quantity_change || 0) * 100) / 100,
      unit_cost: t.unit_cost != null ? Math.round(t.unit_cost * 10000) / 10000 : null,
      bag_weight: t.bag_weight != null ? Math.round(t.bag_weight * 100) / 100 : null,
      bag_price: t.bag_price != null ? Math.round(t.bag_price * 100) / 100 : null,
      cost_per_lb: t.cost_per_lb != null ? Math.round(t.cost_per_lb * 10000) / 10000 : null,
      notes: t.notes,
      running_balance: Math.round(runningBalance * 100) / 100,
    };
  });

  return rows.reverse();
}

// ── Purchase ──────────────────────────────────────────────────
// Uses the purchase_feed RPC which atomically updates the feed type,
// creates the transaction, and clears low-feed alerts.

export async function purchaseFeed({ feed_type_id, num_bags, bag_weight, bag_price, date, supplier }) {
  const { data, error } = await supabase.rpc("purchase_feed", {
    p_feed_type_id: feed_type_id,
    p_num_bags: Number(num_bags),
    p_bag_weight: Number(bag_weight),
    p_bag_price: Number(bag_price),
    p_date: date || new Date().toISOString().slice(0, 10),
    p_supplier: supplier || null,
  });
  if (error) throw fmt(error, "Could not record purchase.");
  return feedTypeJson(data);
}

// ── Adjustment ────────────────────────────────────────────────

export async function adjustFeed({ feed_type_id, quantity_change, reason, date }) {
  const { data, error } = await supabase.rpc("adjust_feed", {
    p_feed_type_id: feed_type_id,
    p_quantity_change: Number(quantity_change),
    p_reason: reason,
    p_date: date || new Date().toISOString().slice(0, 10),
  });
  if (error) throw fmt(error, "Could not record adjustment.");
  return feedTypeJson(data);
}

// ── Update feed metadata ──────────────────────────────────────

export async function updateFeed(feedId, payload) {
  const patch = {};
  if ("name" in payload) patch.name = payload.name;
  if ("par_level" in payload) patch.par_level = Number(payload.par_level);
  if ("bag_weight" in payload) patch.bag_weight = Number(payload.bag_weight);
  if ("bag_price" in payload) patch.bag_price = Number(payload.bag_price);

  const { data, error } = await supabase
    .from("feed_types")
    .update(patch)
    .eq("id", feedId)
    .select("id,user_id,name,unit,cost_per_unit,bag_weight,bag_price,par_level,current_on_hand")
    .single();
  if (error) throw fmt(error, "Could not update feed.");
  return feedTypeJson(data);
}

// ── Dismiss alert ─────────────────────────────────────────────

export async function dismissInventoryAlert(alertId) {
  const { error } = await supabase.from("alerts").update({ is_read: true }).eq("id", alertId);
  if (error) throw fmt(error, "Could not dismiss alert.");
  return { success: true };
}

import { supabase } from "./supabaseClient";
import { getLocalDateString } from "../utils/date";

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

// ── Preview ────────────────────────────────────────────────────
// Returns { headers: string[], rows: any[][] } for the preview table.

export async function getExportPreview({ report_type, start_date, end_date }) {
  const section = report_type === "full" ? "feeding_log" : report_type;
  const sd = start_date || getLocalDateString();
  const ed = end_date || getLocalDateString();

  if (section === "feeding_log") return fetchFeedingRows(sd, ed, [], 10);
  if (section === "production_log") return fetchProductionRows(sd, ed, [], 10);
  if (section === "financial_summary") return fetchFinancialRows(sd, ed);
  if (section === "inventory") return fetchInventoryRows();
  return { headers: [], rows: [] };
}

// ── Generate ───────────────────────────────────────────────────
// CSV only for MVP. Returns { data: string, headers: { "content-type": string } }
// so Export.jsx can create a Blob and trigger a download exactly as before.
// PDF and XLSX throw to surface a user-visible error message.

export async function generateExport({ format, report_type, flock_ids, start_date, end_date }) {
  if (format === "pdf" || format === "xlsx") {
    throw new Error(`${format.toUpperCase()} export is not yet available — use CSV for now.`);
  }

  const section = report_type === "full" ? "feeding_log" : report_type;
  const sd = start_date || getLocalDateString();
  const ed = end_date || getLocalDateString();
  const ids = flock_ids || [];

  let result;
  if (section === "feeding_log") result = await fetchFeedingRows(sd, ed, ids, null);
  else if (section === "production_log") result = await fetchProductionRows(sd, ed, ids, null);
  else if (section === "financial_summary") result = await fetchFinancialRows(sd, ed);
  else if (section === "inventory") result = await fetchInventoryRows();
  else result = { headers: [], rows: [] };

  const csvString = [result.headers, ...result.rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\r\n");

  return { data: csvString, headers: { "content-type": "text/csv" } };
}

// ── Report builders ────────────────────────────────────────────

async function fetchFeedingRows(sd, ed, flockIds, limit) {
  let query = supabase
    .from("feeding_events")
    .select(
      "date, timestamp, total_weight, cost_per_lb_at_time, input_method, " +
      "flocks(name, current_headcount, breeds(name)), feed_types(name)"
    )
    .gte("date", sd)
    .lte("date", ed)
    .order("date")
    .order("timestamp");

  if (flockIds?.length) query = query.in("flock_id", flockIds);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw fmt(error, "Could not load feeding data for export.");

  const headers = ["Date", "Time", "Flock", "Breed", "Feed", "Weight (lb)", "Wt/Animal", "Cost ($)", "Cost/Animal", "Method"];
  const rows = (data || []).map((ev) => {
    const hc = Math.max(ev.flocks?.current_headcount || 1, 1);
    const costTotal = (ev.total_weight || 0) * (ev.cost_per_lb_at_time || 0);
    const time = ev.timestamp ? ev.timestamp.slice(11, 16) : "";
    return [
      ev.date,
      time,
      ev.flocks?.name || "",
      ev.flocks?.breeds?.name || "",
      ev.feed_types?.name || "",
      round2(ev.total_weight),
      round3((ev.total_weight || 0) / hc),
      round2(costTotal),
      round3(costTotal / hc),
      ev.input_method || "",
    ];
  });

  return { headers, rows };
}

async function fetchProductionRows(sd, ed, flockIds, limit) {
  let query = supabase
    .from("production_logs")
    .select("date, egg_count, water_consumed, notes, flocks(name)")
    .gte("date", sd)
    .lte("date", ed)
    .order("date");

  if (flockIds?.length) query = query.in("flock_id", flockIds);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw fmt(error, "Could not load production data for export.");

  const headers = ["Date", "Flock", "Egg Count", "Water Consumed (gal)", "Notes"];
  const rows = (data || []).map((log) => [
    log.date,
    log.flocks?.name || "",
    log.egg_count ?? "",
    log.water_consumed ?? "",
    log.notes || "",
  ]);

  return { headers, rows };
}

async function fetchFinancialRows(sd, ed) {
  const [flocksResult, feedingResult, productionResult] = await Promise.all([
    supabase.from("flocks").select("id, name, designation, current_headcount").order("name"),
    supabase.from("feeding_events").select("flock_id, total_weight, cost_per_lb_at_time").gte("date", sd).lte("date", ed),
    supabase.from("production_logs").select("flock_id, egg_count").gte("date", sd).lte("date", ed),
  ]);

  if (flocksResult.error) throw fmt(flocksResult.error, "Could not load financial data for export.");

  const feedings = feedingResult.data || [];
  const production = productionResult.data || [];

  const headers = ["Flock", "Designation", "Headcount", "Feed Cost ($)", "Cost/Animal", "Cost/Dozen"];
  const rows = (flocksResult.data || []).map((flock) => {
    const feedCost = feedings
      .filter((e) => e.flock_id === flock.id)
      .reduce((s, e) => s + (e.total_weight || 0) * (e.cost_per_lb_at_time || 0), 0);
    const eggs = production
      .filter((p) => p.flock_id === flock.id)
      .reduce((s, p) => s + (p.egg_count || 0), 0);
    const hc = flock.current_headcount || 0;
    return [
      flock.name,
      flock.designation || "",
      hc,
      round2(feedCost),
      hc ? round3(feedCost / hc) : 0,
      eggs ? round2((feedCost / eggs) * 12) : "",
    ];
  });

  return { headers, rows };
}

async function fetchInventoryRows() {
  const { data, error } = await supabase
    .from("feed_types")
    .select("name, unit, current_on_hand, par_level, bag_weight, bag_price, cost_per_unit")
    .order("name");
  if (error) throw fmt(error, "Could not load inventory data for export.");

  const headers = ["Feed", "Unit", "On Hand", "Par Level", "Bag Weight (lb)", "Bag Price ($)", "Cost/Lb"];
  const rows = (data || []).map((ft) => [
    ft.name,
    ft.unit,
    round2(ft.current_on_hand),
    round2(ft.par_level),
    round2(ft.bag_weight),
    round2(ft.bag_price),
    round4(ft.cost_per_unit),
  ]);

  return { headers, rows };
}

// ── Helpers ────────────────────────────────────────────────────

function round2(n) { return Math.round((n || 0) * 100) / 100; }
function round3(n) { return Math.round((n || 0) * 1000) / 1000; }
function round4(n) { return Math.round((n || 0) * 10000) / 10000; }

function toCsvCell(value) {
  if (value == null) return "";
  const str = String(value);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

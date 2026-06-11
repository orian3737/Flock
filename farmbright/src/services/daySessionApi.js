import { supabase } from './supabaseClient';

function getLocalDateString(date = new Date()) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getTodaySession(date = null) {
  const sessionDate = date || getLocalDateString();

  const [feedResult, prodResult, casResult] = await Promise.all([
    supabase
      .from('feeding_events')
      .select(`
        id, flock_id, date, timestamp,
        total_weight, cost_per_lb_at_time,
        input_method,
        feed_types ( id, name, unit, cost_per_unit ),
        flocks (
          id, name, current_headcount,
          breeds (
            name,
            animal_types (
              name, emoji,
              produces_eggs, produces_milk,
              produces_meat, produces_young,
              working_animal,
              animal_classes ( name, class_type )
            )
          )
        )
      `)
      .eq('date', sessionDate)
      .order('timestamp', { ascending: true }),
    supabase
      .from('production_logs')
      .select('id, flock_id, date, egg_count, water_consumed, litter_count, litter_size, litter_notes, notes, flocks ( name )')
      .eq('date', sessionDate),
    supabase
      .from('casualty_logs')
      .select('id, flock_id, date, change_amount, notes, flocks ( name )')
      .eq('date', sessionDate),
  ]);

  if (feedResult.error) throw feedResult.error;
  if (prodResult.error) throw prodResult.error;
  if (casResult.error) throw casResult.error;

  const feedings = (feedResult.data || []).map((e) => {
    const headcount = Math.max(e.flocks?.current_headcount || 1, 1);
    const cost_total = (e.total_weight || 0) * (e.cost_per_lb_at_time || 0);
    return {
      ...e,
      cost_total,
      weight_per_bird: (e.total_weight || 0) / headcount,
      cost_per_bird: cost_total / headcount,
    };
  });
  const production = prodResult.data || [];
  const casualties = casResult.data || [];

  const totalFeedCost    = feedings.reduce((s, e) => s + (e.cost_total || 0), 0);
  const totalFeedUsedLbs = feedings.reduce((s, e) => s + (e.total_weight || 0), 0);
  const totalEggs        = production.reduce((s, p) => s + (p.egg_count || 0), 0);
  const totalCasualties  = casualties.reduce((s, c) => s + (c.change_amount < 0 ? Math.abs(c.change_amount) : 0), 0);
  const totalAdditions   = casualties.reduce((s, c) => s + (c.change_amount > 0 ? c.change_amount : 0), 0);
  const flocksWithFeeding = [...new Set(feedings.map((e) => e.flock_id))];

  return {
    date: sessionDate,
    feedings,
    production,
    casualties,
    summary: {
      flocks_fed:        flocksWithFeeding.length,
      total_feed_cost:   totalFeedCost,
      total_feed_used:   totalFeedUsedLbs,
      total_eggs:        totalEggs,
      total_casualties:  totalCasualties,
      total_additions:   totalAdditions,
      cost_per_bird_avg: flocksWithFeeding.length > 0 ? totalFeedCost / flocksWithFeeding.length : 0,
    },
  };
}

// Postgres trigger (feeding_event_adjust_inventory) handles inventory on UPDATE.
// We compute derived fields client-side and pass them in the update payload.
export async function updateFeedingEvent(eventId, updates) {
  const { data, error } = await supabase
    .from('feeding_events')
    .update(updates)
    .eq('id', eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Postgres trigger (restore_feed_on_feeding_event_delete) handles inventory restore on DELETE.
export async function deleteFeedingEvent(eventId) {
  const { error } = await supabase
    .from('feeding_events')
    .delete()
    .eq('id', eventId);
  if (error) throw error;
  return true;
}

export async function updateProductionLog(logId, updates) {
  const { data, error } = await supabase
    .from('production_logs')
    .update(updates)
    .eq('id', logId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Postgres trigger fires per-row on DELETE, restoring inventory for each feeding event.
export async function deleteAllTodayFeedings(date) {
  const { error } = await supabase
    .from('feeding_events')
    .delete()
    .eq('date', date);
  if (error) throw error;
  return true;
}

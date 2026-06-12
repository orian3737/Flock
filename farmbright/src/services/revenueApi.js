import { supabase } from './supabaseClient';

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

export async function logYoungSale(payload) {
  // payload: { flock_id, date, quantity, price_per_head, notes }
  const { data, error } = await supabase
    .from('young_sales')
    .insert({
      flock_id:      payload.flock_id,
      date:          payload.date,
      quantity:      Number(payload.quantity),
      price_per_head: Number(payload.price_per_head),
      notes:         payload.notes || null,
    })
    .select()
    .single();
  if (error) throw fmt(error, 'Could not log young sale.');
  return data;
}

export async function getYoungSales(startDate, endDate) {
  const { data, error } = await supabase
    .from('young_sales')
    .select(`
      *,
      flocks (
        id, name,
        breeds ( name, animal_types ( name, animal_classes ( name, class_type ) ) )
      )
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  if (error) throw fmt(error, 'Could not load young sales.');
  return data || [];
}

export async function getFlockYoungSales(flockId) {
  const { data, error } = await supabase
    .from('young_sales')
    .select('id, date, quantity, price_per_head, total_amount, notes')
    .eq('flock_id', flockId)
    .order('date', { ascending: false });
  if (error) throw fmt(error, 'Could not load young sales.');
  return data || [];
}

export async function deleteYoungSale(id) {
  const { error } = await supabase
    .from('young_sales')
    .delete()
    .eq('id', id);
  if (error) throw fmt(error, 'Could not delete young sale.');
  return true;
}

import { supabase } from './supabaseClient'

// ── Observation CRUD ──────────────────────────

export async function logObservation(payload) {
  const { data: obs, error: obsErr } = await supabase
    .from('observation_logs')
    .insert({
      flock_id:           payload.flock_id,
      animal_id:          payload.animal_id || null,
      date:               payload.date,
      category:           payload.category,
      detail:             payload.detail || null,
      severity:           payload.severity || 'normal',
      follow_up_needed:   payload.follow_up_needed || false,
      follow_up_resolved: false,
      created_by:         payload.created_by || null,
    })
    .select()
    .single()
  if (obsErr) throw obsErr

  if (payload.animal_id && ['physical', 'behavior'].includes(payload.category)) {
    await supabase.from('animal_health_logs').insert({
      animal_id:      payload.animal_id,
      observation_id: obs.id,
      date:           payload.date,
      log_type:       'observation',
      description:    payload.detail || payload.category,
      resolved:       false,
    })
  }

  return obs
}

export async function getTodayObservations(userId) {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('observation_logs')
    .select(`
      id, flock_id, animal_id, date, category,
      detail, severity, follow_up_needed,
      follow_up_resolved, created_at,
      flocks (
        id, name,
        breeds ( name,
          animal_types ( name, emoji,
            animal_classes ( name, class_type )
          )
        )
      ),
      animals ( id, identifier )
    `)
    .eq('date', today)
    .order('severity', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getObservationHistory(userId, startDate, endDate, filters = {}) {
  let query = supabase
    .from('observation_logs')
    .select(`
      id, flock_id, animal_id, date, category,
      detail, severity, follow_up_needed,
      follow_up_resolved, created_at,
      flocks (
        id, name,
        breeds ( name,
          animal_types ( name, emoji,
            animal_classes ( name, class_type )
          )
        )
      ),
      animals ( id, identifier )
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .order('severity', { ascending: false })

  if (filters.flockId)     query = query.eq('flock_id', filters.flockId)
  if (filters.severity)    query = query.eq('severity', filters.severity)
  if (filters.category)    query = query.eq('category', filters.category)
  if (filters.followUpOnly)
    query = query.eq('follow_up_needed', true).eq('follow_up_resolved', false)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function resolveFollowUp(observationId) {
  const { data, error } = await supabase
    .from('observation_logs')
    .update({ follow_up_resolved: true })
    .eq('id', observationId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteObservation(observationId) {
  const { error } = await supabase
    .from('observation_logs')
    .delete()
    .eq('id', observationId)
  if (error) throw error
  return true
}

export async function getOpenFollowUps(userId) {
  const { data, error } = await supabase
    .from('observation_logs')
    .select(`
      id, flock_id, animal_id, date, category,
      detail, severity, created_at,
      flocks ( id, name,
        breeds ( name,
          animal_types ( name, emoji )
        )
      ),
      animals ( id, identifier )
    `)
    .eq('follow_up_needed', true)
    .eq('follow_up_resolved', false)
    .order('severity', { ascending: false })
    .order('date', { ascending: true })
  if (error) throw error
  return data || []
}

// ── Animal CRUD ───────────────────────────────

export async function getFlockAnimals(flockId, status = 'active') {
  let query = supabase
    .from('animals')
    .select(`
      id, identifier, sex, status, source,
      date_of_birth, date_acquired, notes,
      sire:sire_id ( id, identifier ),
      dam:dam_id   ( id, identifier ),
      animal_weight_logs (
        id, date, weight_lbs, input_method
      ),
      animal_health_logs (
        id, resolved
      )
    `)
    .eq('flock_id', flockId)
    .order('identifier')
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(a => ({
    ...a,
    latest_weight:      a.animal_weight_logs?.[0]?.weight_lbs ?? null,
    latest_weight_date: a.animal_weight_logs?.[0]?.date ?? null,
    open_health_issues: a.animal_health_logs?.filter(h => !h.resolved).length ?? 0,
  }))
}

export async function createAnimal(payload) {
  const { data, error } = await supabase
    .from('animals')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function bulkCreateAnimals(flockId, animals) {
  const { data, error } = await supabase
    .from('animals')
    .insert(animals.map(a => ({ ...a, flock_id: flockId })))
    .select()
  if (error) throw error
  return data
}

export async function updateAnimal(animalId, updates) {
  const { data, error } = await supabase
    .from('animals')
    .update(updates)
    .eq('id', animalId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getAnimalDetail(animalId) {
  const { data, error } = await supabase
    .from('animals')
    .select(`
      *,
      sire:sire_id ( id, identifier, sex ),
      dam:dam_id   ( id, identifier, sex ),
      animal_weight_logs (
        id, date, weight_lbs, input_method, notes
      ),
      animal_health_logs (
        id, date, log_type, description,
        resolved, resolved_at, observation_id
      ),
      observation_logs (
        id, date, category, detail, severity,
        follow_up_needed, follow_up_resolved
      )
    `)
    .eq('id', animalId)
    .single()
  if (error) throw error
  return data
}

export async function logWeight(animalId, payload) {
  const { data, error } = await supabase
    .from('animal_weight_logs')
    .insert({ ...payload, animal_id: animalId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function enableFlockTracking(flockId, enabled) {
  const { data, error } = await supabase
    .from('flocks')
    .update({ individual_tracking_enabled: enabled })
    .eq('id', flockId)
    .select()
    .single()
  if (error) throw error
  return data
}

import { supabase } from "./supabaseClient";

function fmt(error, fallback) {
  return new Error(error?.message || fallback);
}

async function insert(table, payload, fallback) {
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw fmt(error, fallback);
  return data;
}

async function update(table, id, payload, fallback) {
  const { data, error } = await supabase.from(table).update(payload).eq("id", id).select().single();
  if (error) throw fmt(error, fallback);
  return data;
}

async function remove(table, id, fallback) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw fmt(error, fallback);
  return { success: true };
}

async function selectOrThrow(query, fallback) {
  const { data, error } = await query;
  if (error) throw fmt(error, fallback);
  return data || [];
}

// ── Animal Classes ────────────────────────────────────────
// In the new schema animal_classes just hold name + class_type.
// Production flags live on animal_types.

export async function createAnimalClass(userId, { name, class_type = 'other' }) {
  const { data, error } = await supabase.from('animal_classes')
    .insert({ user_id: userId, name: name.trim(), class_type })
    .select()
    .single();
  if (error) throw fmt(error, 'Could not create animal class.');
  return data;
}

export function updateAnimalClass(id, { name, class_type }) {
  const patch = { name: name.trim() };
  if (class_type) patch.class_type = class_type;
  return update("animal_classes", id, patch, "Could not update animal class.");
}

export async function deleteAnimalClass(id) {
  const { count } = await supabase
    .from('animal_types')
    .select('id', { count: 'exact', head: true })
    .eq('animal_class_id', id);
  if (count > 0) {
    throw new Error(`This class has ${count} animal type${count > 1 ? 's' : ''}. Remove types first.`);
  }
  return remove("animal_classes", id, "Could not delete animal class.");
}

// ── Animal Types ──────────────────────────────────────────

export async function createAnimalType(animalClassId, {
  name,
  species        = 'custom',
  emoji          = '🐾',
  produces_eggs  = false,
  produces_milk  = false,
  produces_meat  = true,
  produces_young = true,
  working_animal = false,
}) {
  const { data, error } = await supabase.from('animal_types')
    .insert({
      animal_class_id: animalClassId,
      name: name.trim(),
      species,
      emoji,
      produces_eggs,
      produces_milk,
      produces_meat,
      produces_young,
      working_animal,
      produces_fiber: false,
      produces_honey: false,
    })
    .select()
    .single();
  if (error) throw fmt(error, 'Could not create animal type.');
  return data;
}

export async function updateAnimalType(animalTypeId, fields) {
  const patch = {};
  if ('name'           in fields) patch.name           = fields.name.trim();
  if ('emoji'          in fields) patch.emoji          = fields.emoji;
  if ('produces_eggs'  in fields) patch.produces_eggs  = fields.produces_eggs;
  if ('produces_milk'  in fields) patch.produces_milk  = fields.produces_milk;
  if ('produces_meat'  in fields) patch.produces_meat  = fields.produces_meat;
  if ('produces_young' in fields) patch.produces_young = fields.produces_young;
  if ('working_animal' in fields) patch.working_animal = fields.working_animal;
  return update('animal_types', animalTypeId, patch, 'Could not update animal type.');
}

export async function deleteAnimalType(animalTypeId) {
  const { count } = await supabase
    .from('breeds')
    .select('id', { count: 'exact', head: true })
    .eq('animal_type_id', animalTypeId);
  if (count > 0) {
    throw new Error(`This type has ${count} breed${count > 1 ? 's' : ''}. Remove breeds first.`);
  }
  const { error } = await supabase.from('animal_types').delete().eq('id', animalTypeId);
  if (error) throw fmt(error, 'Could not delete animal type.');
  return { success: true };
}

// ── Breeds ────────────────────────────────────────────────
// breeds.animal_type_id (was animal_class_id)

export function createBreed(animalTypeId, name) {
  return insert("breeds", { animal_type_id: animalTypeId, name: name.trim() }, "Could not create breed.");
}

export function updateBreed(breedId, name) {
  return update("breeds", breedId, { name: name.trim() }, "Could not update breed.");
}

export async function deleteBreed(breedId) {
  const { count } = await supabase
    .from("flocks")
    .select("id", { count: "exact", head: true })
    .eq("breed_id", breedId);
  if (count > 0) {
    throw new Error(
      `This breed has ${count} flock${count > 1 ? "s" : ""} assigned. ` +
      `Remove or reassign those flocks before deleting this breed.`
    );
  }
  const { error } = await supabase.from("breeds").delete().eq("id", breedId);
  if (error) throw fmt(error, "Could not delete breed.");
  return true;
}

export async function getAllBreedsGrouped(userId) {
  const { data, error } = await supabase
    .from('animal_classes')
    .select(`
      id, name, class_type,
      animal_types (
        id, name, emoji,
        breeds ( id, name )
      )
    `)
    .eq('user_id', userId)
    .order('name');
  if (error) throw fmt(error, 'Could not load breeds.');
  return data || [];
}

// ── Flocks ────────────────────────────────────────────────

export function createFlock({ breed_id, name, designation, pen_name, current_headcount }) {
  return insert(
    "flocks",
    {
      breed_id,
      name: name.trim(),
      designation,
      pen_name: pen_name?.trim() || null,
      current_headcount: Number(current_headcount),
    },
    "Could not create flock."
  );
}

export function updateFlock(id, payload) {
  const patch = {};
  if ("name" in payload) patch.name = payload.name.trim();
  if ("designation" in payload) patch.designation = payload.designation;
  if ("pen_name" in payload) patch.pen_name = payload.pen_name?.trim() || null;
  if ("current_headcount" in payload) patch.current_headcount = Number(payload.current_headcount);
  if ("egg_price_per_dozen" in payload) patch.egg_price_per_dozen = Number(payload.egg_price_per_dozen || 0);
  if ("meat_price_per_lb" in payload) patch.meat_price_per_lb = Number(payload.meat_price_per_lb || 0);
  if ("meat_price_per_bird" in payload) patch.meat_price_per_bird = Number(payload.meat_price_per_bird || 0);
  return update("flocks", id, patch, "Could not update flock.");
}

export function deleteFlock(id) {
  return remove("flocks", id, "Could not delete flock.");
}

// ── Feed Types ────────────────────────────────────────────

export function createFeedType({ user_id, name, unit, bag_weight, bag_price, par_level, current_on_hand }) {
  const bw = Number(bag_weight);
  const bp = Number(bag_price);
  return insert(
    "feed_types",
    {
      user_id,
      name: name.trim(),
      unit,
      bag_weight: bw,
      bag_price: bp,
      cost_per_unit: bw > 0 ? bp / bw : 0,
      par_level: Number(par_level),
      current_on_hand: Number(current_on_hand),
    },
    "Could not create feed type."
  );
}

export function updateFeedType(id, payload) {
  const patch = {};
  if ("name" in payload) patch.name = payload.name.trim();
  if ("unit" in payload) patch.unit = payload.unit;
  if ("bag_weight" in payload) patch.bag_weight = Number(payload.bag_weight);
  if ("bag_price" in payload) patch.bag_price = Number(payload.bag_price);
  if ("par_level" in payload) patch.par_level = Number(payload.par_level);
  if ("current_on_hand" in payload) patch.current_on_hand = Number(payload.current_on_hand);
  return update("feed_types", id, patch, "Could not update feed type.");
}

export function deleteFeedType(id) {
  return remove("feed_types", id, "Could not delete feed type.");
}

// ── Feed Assignments ──────────────────────────────────────

export async function createFeedAssignment({ flock_id, feed_type_id }) {
  return insert("feed_assignments", { flock_id, feed_type_id }, "Could not create feed assignment.");
}

export function deleteFeedAssignment(id) {
  return remove("feed_assignments", id, "Could not delete feed assignment.");
}

// ── Full Hierarchy ─────────────────────────────────────────
// Returns: [{ id, name, class_type, animal_types: [{ id, name, emoji, ...flags, breeds: [{ id, name, flocks: [...] }] }] }]

export async function getFullHierarchy(userId) {
  if (!userId) return [];

  const { data: classes, error: ce } = await supabase
    .from('animal_classes')
    .select('id, name, class_type')
    .eq('user_id', userId)
    .order('name');
  if (ce) throw fmt(ce, 'Could not load animal classes.');
  if (!classes?.length) return [];

  const classIds = classes.map(c => c.id);

  const { data: types, error: te } = await supabase
    .from('animal_types')
    .select('id, animal_class_id, name, species, emoji, produces_eggs, produces_milk, produces_meat, produces_young, working_animal')
    .in('animal_class_id', classIds)
    .order('name');
  if (te) throw fmt(te, 'Could not load animal types.');

  const typeIds = (types || []).map(t => t.id);

  const { data: breeds, error: be } = typeIds.length
    ? await supabase.from('breeds').select('id, animal_type_id, name').in('animal_type_id', typeIds).order('name')
    : { data: [], error: null };
  if (be) throw fmt(be, 'Could not load breeds.');

  const breedIds = (breeds || []).map(b => b.id);

  const { data: flocks, error: fe } = breedIds.length
    ? await supabase.from('flocks').select('id, breed_id, name, designation, pen_name, current_headcount, created_at, egg_price_per_dozen, meat_price_per_lb, meat_price_per_bird').in('breed_id', breedIds).order('name')
    : { data: [], error: null };
  if (fe) throw fmt(fe, 'Could not load flocks.');

  const flockIds = (flocks || []).map(f => f.id);
  const { data: assignments } = flockIds.length
    ? await supabase.from('feed_assignments').select('id, flock_id, feed_type_id').in('flock_id', flockIds)
    : { data: [] };

  const assignByFlock = new Map();
  for (const a of assignments || []) {
    const list = assignByFlock.get(a.flock_id) || [];
    list.push({ id: a.id, feed_type_id: a.feed_type_id });
    assignByFlock.set(a.flock_id, list);
  }

  const flocksByBreed = new Map();
  for (const f of flocks || []) {
    const list = flocksByBreed.get(f.breed_id) || [];
    list.push({ ...f, feed_assignments: assignByFlock.get(f.id) || [] });
    flocksByBreed.set(f.breed_id, list);
  }

  const breedsByType = new Map();
  for (const b of breeds || []) {
    const list = breedsByType.get(b.animal_type_id) || [];
    list.push({ ...b, flocks: flocksByBreed.get(b.id) || [] });
    breedsByType.set(b.animal_type_id, list);
  }

  const typesByClass = new Map();
  for (const t of types || []) {
    const list = typesByClass.get(t.animal_class_id) || [];
    list.push({ ...t, breeds: breedsByType.get(t.id) || [] });
    typesByClass.set(t.animal_class_id, list);
  }

  return classes.map(c => ({
    ...c,
    animal_types: typesByClass.get(c.id) || [],
  }));
}

// ── Onboarding Summary ─────────────────────────────────────

function feedTypeJson(ft) {
  const bw = Number(ft.bag_weight || 0);
  const bp = Number(ft.bag_price || 0);
  const costPerLb = bw > 0 ? Number((bp / bw).toFixed(4)) : 0;
  return {
    id: ft.id,
    user_id: ft.user_id,
    name: ft.name,
    unit: ft.unit,
    cost_per_unit: ft.cost_per_unit ?? costPerLb,
    cost_per_lb: costPerLb,
    bag_weight: ft.bag_weight,
    bag_price: ft.bag_price,
    par_level: ft.par_level,
    current_on_hand: ft.current_on_hand,
  };
}

export async function getOnboardingSummary(userId) {
  if (!userId) return { animal_classes: [], feed_types: [] };

  const [hierarchy, feedTypes] = await Promise.all([
    getFullHierarchy(userId),
    selectOrThrow(
      supabase
        .from("feed_types")
        .select("id,user_id,name,unit,cost_per_unit,bag_weight,bag_price,par_level,current_on_hand")
        .eq("user_id", userId)
        .order("name"),
      "Could not load feed types."
    ),
  ]);

  return {
    animal_classes: hierarchy,
    feed_types: feedTypes.map(feedTypeJson),
  };
}

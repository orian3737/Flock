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

// ── Animal Classes ──────────────────────────────────────────

export function createAnimalClass({ user_id, name, class_type = 'poultry' }) {
  return insert("animal_classes", { user_id, name: name.trim(), class_type }, "Could not create animal class.");
}

export function updateAnimalClass(id, { name, class_type }) {
  const patch = { name: name.trim() };
  if (class_type) patch.class_type = class_type;
  return update("animal_classes", id, patch, "Could not update animal class.");
}

export function deleteAnimalClass(id) {
  return remove("animal_classes", id, "Could not delete animal class.");
}

// ── Breeds ──────────────────────────────────────────────────

export function createBreed(animalClassId, name) {
  return insert("breeds", { animal_class_id: animalClassId, name: name.trim() }, "Could not create breed.");
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
    .from("animal_classes")
    .select("id, name, class_type, species, emoji, breeds ( id, name )")
    .eq("user_id", userId)
    .order("name");
  if (error) throw fmt(error, "Could not load breeds.");
  return data || [];
}

// ── Flocks ──────────────────────────────────────────────────

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
  return update("flocks", id, patch, "Could not update flock.");
}

export function deleteFlock(id) {
  return remove("flocks", id, "Could not delete flock.");
}

// ── Feed Types ───────────────────────────────────────────────

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

// ── Feed Assignments ─────────────────────────────────────────

export async function createFeedAssignment({ flock_id, feed_type_id }) {
  return insert("feed_assignments", { flock_id, feed_type_id }, "Could not create feed assignment.");
}

export function deleteFeedAssignment(id) {
  return remove("feed_assignments", id, "Could not delete feed assignment.");
}

// ── Onboarding Summary ───────────────────────────────────────

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

function flockJson(flock, assignmentsByFlockId) {
  return {
    id: flock.id,
    breed_id: flock.breed_id,
    name: flock.name,
    designation: flock.designation,
    pen_name: flock.pen_name,
    current_headcount: flock.current_headcount,
    created_at: flock.created_at || null,
    feed_assignments: assignmentsByFlockId.get(flock.id) || [],
  };
}

async function selectOrThrow(query, fallback) {
  const { data, error } = await query;
  if (error) throw fmt(error, fallback);
  return data || [];
}

export async function getOnboardingSummary(userId) {
  if (!userId) return { animal_classes: [], feed_types: [] };

  const [animalClasses, feedTypes] = await Promise.all([
    selectOrThrow(
      supabase.from("animal_classes").select("id,user_id,name,class_type").eq("user_id", userId).order("name"),
      "Could not load animal classes."
    ),
    selectOrThrow(
      supabase
        .from("feed_types")
        .select("id,user_id,name,unit,cost_per_unit,bag_weight,bag_price,par_level,current_on_hand")
        .eq("user_id", userId)
        .order("name"),
      "Could not load feed types."
    ),
  ]);

  const classIds = animalClasses.map((c) => c.id);
  const breeds = classIds.length
    ? await selectOrThrow(
        supabase.from("breeds").select("id,animal_class_id,name").in("animal_class_id", classIds).order("name"),
        "Could not load breeds."
      )
    : [];

  const breedIds = breeds.map((b) => b.id);
  const flocks = breedIds.length
    ? await selectOrThrow(
        supabase
          .from("flocks")
          .select("id,breed_id,name,designation,pen_name,current_headcount,created_at")
          .in("breed_id", breedIds)
          .order("name"),
        "Could not load flocks."
      )
    : [];

  const flockIds = flocks.map((f) => f.id);
  const assignments = flockIds.length
    ? await selectOrThrow(
        supabase.from("feed_assignments").select("id,flock_id,feed_type_id").in("flock_id", flockIds),
        "Could not load feed assignments."
      )
    : [];

  const assignmentsByFlockId = new Map();
  for (const a of assignments) {
    const list = assignmentsByFlockId.get(a.flock_id) || [];
    list.push({ id: a.id, flock_id: a.flock_id, feed_type_id: a.feed_type_id });
    assignmentsByFlockId.set(a.flock_id, list);
  }

  const flocksByBreedId = new Map();
  for (const f of flocks) {
    const list = flocksByBreedId.get(f.breed_id) || [];
    list.push(flockJson(f, assignmentsByFlockId));
    flocksByBreedId.set(f.breed_id, list);
  }

  const breedsByClassId = new Map();
  for (const b of breeds) {
    const list = breedsByClassId.get(b.animal_class_id) || [];
    list.push({
      id: b.id,
      animal_class_id: b.animal_class_id,
      name: b.name,
      flocks: (flocksByBreedId.get(b.id) || []).sort((a, z) => a.name.localeCompare(z.name)),
    });
    breedsByClassId.set(b.animal_class_id, list);
  }

  return {
    animal_classes: animalClasses.map((ac) => ({
      id: ac.id,
      user_id: ac.user_id,
      name: ac.name,
      class_type: ac.class_type || 'poultry',
      breeds: (breedsByClassId.get(ac.id) || []).sort((a, z) => a.name.localeCompare(z.name)),
    })),
    feed_types: feedTypes.map(feedTypeJson),
  };
}

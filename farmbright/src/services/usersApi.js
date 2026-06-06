import { supabase } from "./supabaseClient";

function normalizeUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    supabase_uid: row.supabase_uid,
    email: row.email,
    display_name: row.display_name,
    farm_name: row.farm_name,
    preferences: row.preferences || {},
    created_at: row.created_at || null,
  };
}

function formatSupabaseError(error, fallbackMessage) {
  if (!error) return new Error(fallbackMessage);
  return new Error(error.message || fallbackMessage);
}

async function findUserByUid(supabaseUid) {
  const { data, error } = await supabase
    .from("users")
    .select("id,supabase_uid,email,display_name,farm_name,preferences,created_at")
    .eq("supabase_uid", supabaseUid)
    .maybeSingle();

  if (error) {
    throw formatSupabaseError(error, "Could not load user profile.");
  }

  return normalizeUser(data);
}

export async function createProfileForAuthUser(payload) {
  const supabaseUid = (payload.supabase_uid || "").trim();
  const email = (payload.email || "").trim();
  const farmName = (payload.farm_name || "").trim();

  if (!supabaseUid || !email || !farmName) {
    throw new Error("Missing required field(s): supabase_uid, email, farm_name");
  }

  const existing = await findUserByUid(supabaseUid);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("users")
    .insert({
      supabase_uid: supabaseUid,
      email,
      farm_name: farmName,
      display_name: payload.display_name || null,
      preferences: payload.preferences || {},
    })
    .select("id,supabase_uid,email,display_name,farm_name,preferences,created_at")
    .single();

  if (error) {
    const racedExisting = await findUserByUid(supabaseUid);
    if (racedExisting) return racedExisting;
    throw formatSupabaseError(error, "Could not create user profile.");
  }

  return normalizeUser(data);
}

export async function getProfileBySupabaseUid(supabaseUid) {
  const user = await findUserByUid(supabaseUid);
  if (!user) {
    throw new Error("User not found.");
  }
  return user;
}

export async function updateUser(userId, payload) {
  const updatePayload = {};

  if ("farm_name" in payload) {
    const farmName = (payload.farm_name || "").trim();
    if (!farmName) throw new Error("Farm name cannot be blank.");
    updatePayload.farm_name = farmName;
  }

  if ("display_name" in payload) {
    updatePayload.display_name = (payload.display_name || "").trim() || null;
  }

  if (!Object.keys(updatePayload).length) {
    const { data, error } = await supabase
      .from("users")
      .select("id,supabase_uid,email,display_name,farm_name,preferences,created_at")
      .eq("id", userId)
      .single();

    if (error) throw formatSupabaseError(error, "Could not load user profile.");
    return normalizeUser(data);
  }

  const { data, error } = await supabase
    .from("users")
    .update(updatePayload)
    .eq("id", userId)
    .select("id,supabase_uid,email,display_name,farm_name,preferences,created_at")
    .single();

  if (error) {
    throw formatSupabaseError(error, "Could not update user profile.");
  }

  return normalizeUser(data);
}

export async function updateUserPreferences(userId, payload) {
  const { data: currentUser, error: loadError } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", userId)
    .single();

  if (loadError) {
    throw formatSupabaseError(loadError, "Could not load user preferences.");
  }

  const { data, error } = await supabase
    .from("users")
    .update({ preferences: { ...(currentUser?.preferences || {}), ...payload } })
    .eq("id", userId)
    .select("id,supabase_uid,email,display_name,farm_name,preferences,created_at")
    .single();

  if (error) {
    throw formatSupabaseError(error, "Could not update user preferences.");
  }

  return normalizeUser(data);
}

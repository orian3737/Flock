import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawSupabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(
  rawSupabaseUrl &&
    rawSupabaseKey &&
    !rawSupabaseUrl.includes("<user will fill in>") &&
    !rawSupabaseKey.includes("<user will fill in>")
);

export const supabase = createClient(
  isSupabaseConfigured ? rawSupabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? rawSupabaseKey : "placeholder-anon-key",
  {
    auth: {
      storageKey: "flock-auth-token",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

import { getOnboardingSummary } from "../services/onboardingApi";
import { createUser, getUserByUid } from "../services/usersApi";

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
  isSupabaseConfigured ? rawSupabaseKey : "placeholder-anon-key"
);

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);

  const loadDbUser = useCallback(async (supabaseUser) => {
    if (!supabaseUser) {
      setUser(null);
      setDbUser(null);
      setIsOnboarded(false);
      return { user: null, dbUser: null, isOnboarded: false };
    }

    setUser(supabaseUser);

    try {
      const nextDbUser = await getUserByUid(supabaseUser.id);
      const summary = await getOnboardingSummary(nextDbUser.id);
      const nextIsOnboarded = Boolean(summary.animal_classes?.length);

      setDbUser(nextDbUser);
      setIsOnboarded(nextIsOnboarded);
      localStorage.setItem("Flock_user_id", String(nextDbUser.id));
      localStorage.setItem("Flock_farm_name", nextDbUser.farm_name);

      return { user: supabaseUser, dbUser: nextDbUser, isOnboarded: nextIsOnboarded };
    } catch (error) {
      setDbUser(null);
      setIsOnboarded(false);
      return { user: supabaseUser, dbUser: null, isOnboarded: false, error };
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        await loadDbUser(data.session?.user || null);
        setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true);
      await loadDbUser(session?.user || null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadDbUser]);

  async function signIn(email, password) {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase env vars are not configured yet.");
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return await loadDbUser(data.user);
    } finally {
      setLoading(false);
    }
  }

  async function signUp(email, password, farmName) {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase env vars are not configured yet.");
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("Supabase did not return a user for this signup.");

      const nextDbUser = await createUser({
        supabase_uid: data.user.id,
        email,
        farm_name: farmName,
      });

      setUser(data.user);
      setDbUser(nextDbUser);
      setIsOnboarded(false);
      localStorage.setItem("Flock_user_id", String(nextDbUser.id));
      localStorage.setItem("Flock_farm_name", nextDbUser.farm_name);

      return { user: data.user, dbUser: nextDbUser, isOnboarded: false };
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setDbUser(null);
      setIsOnboarded(false);
      localStorage.removeItem("Flock_user_id");
      localStorage.removeItem("Flock_farm_name");
    } finally {
      setLoading(false);
    }
  }

  function markOnboarded() {
    setIsOnboarded(true);
  }

  const value = useMemo(
    () => ({
      user,
      dbUser,
      loading,
      isOnboarded,
      signIn,
      signUp,
      signOut,
      markOnboarded,
    }),
    [user, dbUser, loading, isOnboarded]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getOnboardingSummary } from "../services/onboardingApi";
import { clearLocalAuthState } from "../services/authStorage";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import { createUser, getUserByUid } from "../services/usersApi";

export { isSupabaseConfigured, supabase };

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
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          clearLocalAuthState();
          await loadDbUser(null);
        } else if (isMounted) {
          await loadDbUser(data.session?.user || null);
        }
      } catch {
        clearLocalAuthState();
        if (isMounted) {
          await loadDbUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    function handleAuthExpired() {
      clearLocalAuthState();
      if (isMounted) {
        setUser(null);
        setDbUser(null);
        setIsOnboarded(false);
        setLoading(false);
      }
    }

    loadSession();
    window.addEventListener("flock:auth-expired", handleAuthExpired);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true);
      await loadDbUser(session?.user || null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      window.removeEventListener("flock:auth-expired", handleAuthExpired);
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
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      clearLocalAuthState();
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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getOnboardingSummary } from "../services/onboardingApi";
import { clearLocalAuthState } from "../services/authStorage";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import { createProfileForAuthUser, getProfileBySupabaseUid } from "../services/usersApi";

export { isSupabaseConfigured, supabase };

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);

  const loadProfile = useCallback(async (supabaseUser) => {
    if (!supabaseUser) {
      setUser(null);
      setProfile(null);
      setIsOnboarded(false);
      return { user: null, profile: null, isOnboarded: false };
    }

    setUser(supabaseUser);

    try {
      const nextProfile = await getProfileBySupabaseUid(supabaseUser.id);
      const summary = await getOnboardingSummary(nextProfile.id);
      const nextIsOnboarded = Boolean(summary.animal_classes?.length);

      setProfile(nextProfile);
      setIsOnboarded(nextIsOnboarded);
      localStorage.setItem("Flock_user_id", String(nextProfile.id));
      localStorage.setItem("Flock_farm_name", nextProfile.farm_name);

      return { user: supabaseUser, profile: nextProfile, isOnboarded: nextIsOnboarded };
    } catch (error) {
      setProfile(null);
      setIsOnboarded(false);
      return { user: supabaseUser, profile: null, isOnboarded: false, error };
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
          await loadProfile(null);
        } else if (isMounted) {
          await loadProfile(data.session?.user || null);
        }
      } catch {
        clearLocalAuthState();
        if (isMounted) {
          await loadProfile(null);
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
        setProfile(null);
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
      await loadProfile(session?.user || null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      window.removeEventListener("flock:auth-expired", handleAuthExpired);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  async function signIn(email, password) {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase env vars are not configured yet.");
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const result = await loadProfile(data.user);
      if (!result.profile) {
        throw result.error || new Error("User profile not found.");
      }
      return result;
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            farm_name: farmName,
          },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Supabase did not return a user for this signup.");

      const profilePayload = {
        supabase_uid: data.user.id,
        email,
        farm_name: farmName,
      };

      let nextProfile;
      try {
        nextProfile = await getProfileBySupabaseUid(data.user.id);
      } catch {
        nextProfile = await createProfileForAuthUser(profilePayload);
      }

      setUser(data.user);
      setProfile(nextProfile);
      setIsOnboarded(false);
      localStorage.setItem("Flock_user_id", String(nextProfile.id));
      localStorage.setItem("Flock_farm_name", nextProfile.farm_name);

      return { user: data.user, profile: nextProfile, isOnboarded: false };
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
      setProfile(null);
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

  async function refreshProfile() {
    if (!user) return null;
    const result = await loadProfile(user);
    if (!result.profile) {
      throw result.error || new Error("User profile not found.");
    }
    return result.profile;
  }

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isOnboarded,
      signIn,
      signUp,
      signOut,
      markOnboarded,
      refreshProfile,
    }),
    [user, profile, loading, isOnboarded, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

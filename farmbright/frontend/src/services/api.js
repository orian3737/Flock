import axios from "axios";

import { clearLocalAuthState, notifyAuthExpired } from "./authStorage";
import { supabase } from "./supabaseClient";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000",
});

api.interceptors.request.use(async (config) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    clearLocalAuthState();
    notifyAuthExpired();
    return config;
  }

  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const authError = error?.response?.data?.error || "";
    if (status === 401 && String(authError).toLowerCase().includes("authorization")) {
      clearLocalAuthState();
      notifyAuthExpired();
    }
    return Promise.reject(error);
  }
);

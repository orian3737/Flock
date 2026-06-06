export function clearLocalAuthState() {
  if (typeof localStorage === "undefined") return;

  Object.keys(localStorage).forEach((key) => {
    if ((key.startsWith("sb-") && key.includes("auth-token")) || key === "flock-auth-token") {
      localStorage.removeItem(key);
    }
  });

  localStorage.removeItem("Flock_user_id");
  localStorage.removeItem("Flock_farm_name");
}

export function notifyAuthExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("flock:auth-expired"));
  }
}

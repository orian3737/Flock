import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, loading } = useAuth();
  const [mode, setMode] = useState("signin");
  const [farmName, setFarmName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  function resetError() {
    if (error) setError("");
  }

  async function handleSignIn(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await signIn(email, password);
      navigate(result.isOnboarded ? "/dashboard" : "/onboarding", { replace: true });
    } catch (err) {
      setError(err?.message || "Unable to sign in.");
    }
  }

  async function handleSignUp(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await signUp(email, password, farmName);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(err?.message || "Unable to create account.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6">
      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-10 w-full max-w-[420px]">
        <header className="mb-8 text-center">
          <h1 className="display-font text-[40px] leading-none m-0 text-[var(--text-primary)]">🌾 Flock</h1>
          <p className="text-[var(--text-muted)] text-[13px] mt-3 mb-0">Farm management for the everyday farmer</p>
        </header>

        <div className="grid grid-cols-2 mb-6" role="tablist" aria-label="Authentication mode">
          <button
            className={`bg-transparent border-0 border-b-2 pb-3 px-2 ${
              mode === "signin"
                ? "border-b-[var(--accent-primary)] text-[var(--text-primary)]"
                : "border-b-[var(--border)] text-[var(--text-muted)]"
            }`}
            type="button"
            onClick={() => setMode("signin")}
          >
            Sign In
          </button>
          <button
            className={`bg-transparent border-0 border-b-2 pb-3 px-2 ${
              mode === "signup"
                ? "border-b-[var(--accent-primary)] text-[var(--text-primary)]"
                : "border-b-[var(--border)] text-[var(--text-muted)]"
            }`}
            type="button"
            onClick={() => setMode("signup")}
          >
            Create Account
          </button>
        </div>

        {mode === "signin" ? (
          <form className="grid gap-4" onSubmit={handleSignIn}>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Email</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="email"
                value={email}
                onChange={(e) => { resetError(); setEmail(e.target.value); }}
                required
              />
            </label>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Password</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="password"
                value={password}
                onChange={(e) => { resetError(); setPassword(e.target.value); }}
                required
              />
            </label>
            <button className="primary-button full-width" disabled={loading} type="submit">
              Sign In
            </button>
            {error && <div className="error-banner">{error}</div>}
          </form>
        ) : (
          <form className="grid gap-4" onSubmit={handleSignUp}>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Farm Name</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="text"
                value={farmName}
                onChange={(e) => { resetError(); setFarmName(e.target.value); }}
                required
              />
            </label>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Email</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="email"
                value={email}
                onChange={(e) => { resetError(); setEmail(e.target.value); }}
                required
              />
            </label>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Password</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="password"
                value={password}
                onChange={(e) => { resetError(); setPassword(e.target.value); }}
                required
              />
            </label>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Confirm Password</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="password"
                value={confirmPassword}
                onChange={(e) => { resetError(); setConfirmPassword(e.target.value); }}
                required
              />
            </label>
            <button className="primary-button full-width" disabled={loading} type="submit">
              Create Account
            </button>
            {error && <div className="error-banner">{error}</div>}
          </form>
        )}
      </section>
    </main>
  );
}

export default Login;

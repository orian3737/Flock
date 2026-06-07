import React, { useState } from "react";
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { supabase, useAuth } from "../../context/AuthContext";

function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, loading } = useAuth();
  const [mode, setMode] = useState("signin");
  const [farmName, setFarmName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const [forgotStage, setForgotStage] = useState("hidden");
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState(null);

  function resetError_() {
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

  async function handleForgotPassword(e) {
    e.preventDefault();
    setResetError(null);
    setForgotStage("loading");

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetErr) {
      setResetError(resetErr.message);
      setForgotStage("form");
      return;
    }

    setForgotStage("sent");
  }

  function openForgotForm() {
    setResetEmail("");
    setResetError(null);
    setForgotStage("form");
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
          <>
            <form className="grid gap-4" onSubmit={handleSignIn}>
              <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
                <span>Email</span>
                <input
                  className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                  type="email"
                  value={email}
                  onChange={(e) => { resetError_(); setEmail(e.target.value); }}
                  required
                />
              </label>
              <div className="grid gap-1">
                <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
                  <span>Password</span>
                  <input
                    className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                    type="password"
                    value={password}
                    onChange={(e) => { resetError_(); setPassword(e.target.value); }}
                    required
                  />
                </label>
                <button
                  type="button"
                  className="font-mono text-xs text-[var(--accent-primary)] hover:underline cursor-pointer mt-1 block text-right bg-transparent border-0 p-0"
                  onClick={openForgotForm}
                >
                  Forgot your password?
                </button>
              </div>
              <button className="primary-button full-width" disabled={loading} type="submit">
                Sign In
              </button>
              {error && <div className="error-banner">{error}</div>}
            </form>

            {forgotStage !== "hidden" && (
              <div className="mt-4">
                <div className="divider font-mono text-xs text-[var(--text-muted)] my-4">RESET PASSWORD</div>

                {(forgotStage === "form" || forgotStage === "loading") && (
                  <>
                    <p className="font-mono text-xs text-[var(--text-secondary)] mb-3">
                      Enter the email address for your account and we'll send you a reset link.
                    </p>
                    <input
                      className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)] font-mono text-sm mb-3"
                      type="email"
                      placeholder="your@email.com"
                      value={resetEmail}
                      disabled={forgotStage === "loading"}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                    {resetError && (
                      <p className="font-mono text-xs text-[var(--accent-danger)] mb-3">{resetError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`btn btn-sm font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none flex-1${forgotStage === "loading" ? " loading" : ""}`}
                        disabled={!resetEmail || forgotStage === "loading"}
                        onClick={handleForgotPassword}
                      >
                        {forgotStage === "loading" ? "Sending..." : "Send Reset Link"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost font-mono border border-[var(--border)] text-[var(--text-secondary)]"
                        onClick={() => setForgotStage("hidden")}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}

                {forgotStage === "sent" && (
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={20} className="text-[var(--accent-primary)] flex-none" />
                      <span className="font-mono text-sm text-[var(--text-primary)]">
                        Reset link sent to {resetEmail}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-[var(--text-muted)] mb-3 m-0">
                      Check your inbox and click the link to set a new password. The link expires in 1 hour.
                    </p>
                    <button
                      type="button"
                      className="font-mono text-xs text-[var(--accent-primary)] hover:underline cursor-pointer bg-transparent border-0 p-0 text-left"
                      onClick={() => setForgotStage("hidden")}
                    >
                      Back to sign in
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <form className="grid gap-4" onSubmit={handleSignUp}>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Farm Name</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="text"
                value={farmName}
                onChange={(e) => { resetError_(); setFarmName(e.target.value); }}
                required
              />
            </label>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Email</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="email"
                value={email}
                onChange={(e) => { resetError_(); setEmail(e.target.value); }}
                required
              />
            </label>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Password</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="password"
                value={password}
                onChange={(e) => { resetError_(); setPassword(e.target.value); }}
                required
              />
            </label>
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Confirm Password</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none px-3.5 py-2.5 w-full focus:border-[var(--accent-primary)]"
                type="password"
                value={confirmPassword}
                onChange={(e) => { resetError_(); setConfirmPassword(e.target.value); }}
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

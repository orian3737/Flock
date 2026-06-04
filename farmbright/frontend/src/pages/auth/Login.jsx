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
    <main className="auth-screen">
      <section className="auth-card">
        <header className="auth-header">
          <h1 className="display-font">🌾 Flock</h1>
          <p>Farm management for the everyday farmer</p>
        </header>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => setMode("signin")}>
            Sign In
          </button>
          <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
            Create Account
          </button>
        </div>

        {mode === "signin" ? (
          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => { resetError(); setEmail(event.target.value); }} required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => { resetError(); setPassword(event.target.value); }} required />
            </label>
            <button className="primary-button full-width" disabled={loading} type="submit">
              Sign In
            </button>
            {error && <div className="auth-error">{error}</div>}
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignUp}>
            <label>
              <span>Farm Name</span>
              <input type="text" value={farmName} onChange={(event) => { resetError(); setFarmName(event.target.value); }} required />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => { resetError(); setEmail(event.target.value); }} required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => { resetError(); setPassword(event.target.value); }} required />
            </label>
            <label>
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => { resetError(); setConfirmPassword(event.target.value); }}
                required
              />
            </label>
            <button className="primary-button full-width" disabled={loading} type="submit">
              Create Account
            </button>
            {error && <div className="auth-error">{error}</div>}
          </form>
        )}
      </section>
    </main>
  );
}

export default Login;

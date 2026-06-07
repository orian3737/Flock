import React, { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle, CreditCard, Settings as SettingsIcon, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import InlineFeedback from "../../components/InlineFeedback";
import { supabase, useAuth } from "../../context/AuthContext";
import { useFarm } from "../../context/FarmContext";
import { updateUser, updateUserPreferences } from "../../services/usersApi";

const tabs = [
  { id: "account", label: "Account", icon: User },
  { id: "farm", label: "Farm", icon: SettingsIcon },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "billing", label: "Billing", icon: CreditCard },
];

const defaultPreferences = {
  low_feed_alerts: true,
  email_alerts: false,
  daily_summary_email: false,
};

function Settings() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { setFarmName } = useFarm();
  const [activeTab, setActiveTab] = useState("account");
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  // Section A — Display Name
  const [displayName, setDisplayName] = useState("");

  // Section B — Email
  const [emailStage, setEmailStage] = useState("view");
  const [emailVerifyPassword, setEmailVerifyPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState(null);

  // Section C — Password
  const [passwordStage, setPasswordStage] = useState("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState(null);

  // Farm tab
  const [farmNameDraft, setFarmNameDraft] = useState("");
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
  );

  // Notifications tab
  const [preferences, setPreferences] = useState(defaultPreferences);

  useEffect(() => {
    setDisplayName(profile?.display_name || "");
    setFarmNameDraft(profile?.farm_name || "");
    setPreferences({ ...defaultPreferences, ...(profile?.preferences || {}) });
    setTimeZone(
      profile?.preferences?.time_zone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "America/New_York"
    );
  }, [profile]);

  const emailAddress = useMemo(
    () => profile?.email || user?.email || "your account email",
    [profile?.email, user?.email]
  );

  // Section A
  async function saveName() {
    if (!profile?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateUser(profile.id, { display_name: displayName });
      await refreshProfile();
      setFeedback({ type: "success", message: "Name updated" });
    } catch (err) {
      setFeedback({ type: "error", message: err?.message || "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  // Section B
  async function verifyEmailPassword() {
    setEmailError(null);
    setEmailStage("verifying");
    const { error } = await supabase.auth.signInWithPassword({
      email: user?.email,
      password: emailVerifyPassword,
    });
    if (error) {
      setEmailError("Incorrect password");
      setEmailStage("verify");
      return;
    }
    setEmailStage("change");
  }

  async function sendEmailChange() {
    setEmailError(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailStage("sent");
  }

  function cancelEmailChange() {
    setEmailStage("view");
    setEmailVerifyPassword("");
    setNewEmail("");
    setEmailError(null);
  }

  // Section C
  async function handlePasswordChange() {
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    setPasswordError(null);
    setPasswordStage("verifying");

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user?.email,
      password: currentPassword,
    });
    if (verifyError) {
      setPasswordError("Current password is incorrect");
      setPasswordStage("form");
      return;
    }

    setPasswordStage("changing");
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setPasswordError(updateError.message);
      setPasswordStage("form");
      return;
    }

    setPasswordStage("success");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setTimeout(() => setPasswordStage("form"), 3000);
  }

  async function sendPasswordReset() {
    const { error } = await supabase.auth.resetPasswordForEmail(user?.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setFeedback({ type: "error", message: error.message });
    } else {
      setFeedback({ type: "info", message: `Reset link sent to ${user?.email}. Check your inbox.` });
    }
  }

  // Farm tab
  async function saveFarm() {
    if (!profile?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await updateUser(profile.id, { farm_name: farmNameDraft });
      await updateUserPreferences(profile.id, { ...preferences, time_zone: timeZone });
      await refreshProfile();
      setFarmName(updated.farm_name);
      setFeedback({ type: "success", message: "Farm settings updated" });
    } catch (err) {
      setFeedback({ type: "error", message: err?.message || "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  // Notifications tab
  async function saveNotifications() {
    if (!profile?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateUserPreferences(profile.id, preferences);
      await refreshProfile();
      setFeedback({ type: "success", message: "Notification preferences saved" });
    } catch (err) {
      setFeedback({ type: "error", message: err?.message || "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(key, value) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  const isPasswordBusy = passwordStage === "verifying" || passwordStage === "changing";

  return (
    <section className="settings-page">
      <header className="page-header">
        <div>
          <h1 className="display-font">Settings</h1>
          <p className="settings-subheader">Account, farm, notifications, and plan settings</p>
        </div>
      </header>

      <InlineFeedback message={feedback?.message} type={feedback?.type} />

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={`settings-tab${activeTab === tab.id ? " active" : ""}`}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.id === "billing" ? <small>soon</small> : null}
            </button>
          );
        })}
      </div>

      {activeTab === "account" ? (
        <div className="grid gap-5">

          {/* Section A — Display Name */}
          <section className="panel-card grid gap-4">
            <h2 className="display-font">Display Name</h2>
            <label className="field">
              <span>Display name</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <button className="secondary-button" type="button" disabled={saving} onClick={saveName}>
              Save Name
            </button>
          </section>

          {/* Section B — Email */}
          <section className="panel-card grid gap-4">
            <h2 className="display-font">Email Address</h2>

            {emailStage === "view" && (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="font-mono text-sm text-[var(--text-primary)]">
                  {profile?.email || user?.email}
                </span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEmailStage("verify")}
                >
                  Change email
                </button>
              </div>
            )}

            {(emailStage === "verify" || emailStage === "verifying") && (
              <>
                <p className="font-mono text-xs text-[var(--text-secondary)] m-0">
                  To change your email, first confirm your current password.
                </p>
                <label className="field">
                  <span>Current password</span>
                  <input
                    type="password"
                    value={emailVerifyPassword}
                    disabled={emailStage === "verifying"}
                    onChange={(e) => setEmailVerifyPassword(e.target.value)}
                  />
                </label>
                {emailError && (
                  <p className="font-mono text-xs text-[var(--accent-danger)] m-0">{emailError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    className="primary-button flex-1"
                    type="button"
                    disabled={emailStage === "verifying"}
                    onClick={verifyEmailPassword}
                  >
                    {emailStage === "verifying" ? (
                      <><span className="loading loading-spinner loading-xs" /> Verifying...</>
                    ) : "Confirm"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={emailStage === "verifying"}
                    onClick={cancelEmailChange}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {emailStage === "change" && (
              <>
                <label className="field">
                  <span>New email address</span>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </label>
                <div className="warn-banner">
                  A confirmation link will be sent to your new address. Your login email stays the
                  same until you click it.
                </div>
                {emailError && (
                  <p className="font-mono text-xs text-[var(--accent-danger)] m-0">{emailError}</p>
                )}
                <div className="flex gap-2">
                  <button className="primary-button flex-1" type="button" onClick={sendEmailChange}>
                    Send Confirmation
                  </button>
                  <button className="secondary-button" type="button" onClick={cancelEmailChange}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {emailStage === "sent" && (
              <div className="grid gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={20} className="text-[var(--accent-primary)] flex-none" />
                  <span className="font-mono text-sm text-[var(--text-primary)]">
                    Confirmation sent to {newEmail}
                  </span>
                </div>
                <p className="font-mono text-xs text-[var(--text-muted)] m-0">
                  Check your inbox and click the link to complete the change.
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEmailStage("view");
                    setNewEmail("");
                    setEmailVerifyPassword("");
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </section>

          {/* Section C — Password */}
          <section className="panel-card grid gap-4">
            <h2 className="display-font">Change Password</h2>

            {passwordStage === "success" ? (
              <InlineFeedback message="Password updated successfully" type="success" />
            ) : (
              <>
                <label className="field">
                  <span>Current password</span>
                  <input
                    type="password"
                    value={currentPassword}
                    disabled={isPasswordBusy}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="font-mono text-xs text-[var(--accent-primary)] hover:underline cursor-pointer text-right bg-transparent border-0 p-0 mt-[-8px]"
                  onClick={sendPasswordReset}
                >
                  Forgot your password?
                </button>
                <label className="field">
                  <span>New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    disabled={isPasswordBusy}
                    minLength={8}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    disabled={isPasswordBusy}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                {passwordError && (
                  <p className="font-mono text-xs text-[var(--accent-danger)] bg-[var(--bg-elevated)] rounded-lg p-3 m-0">
                    {passwordError}
                  </p>
                )}
                <button
                  className="primary-button"
                  type="button"
                  disabled={isPasswordBusy}
                  onClick={handlePasswordChange}
                >
                  {isPasswordBusy ? (
                    <><span className="loading loading-spinner loading-xs" /> Updating...</>
                  ) : "Update Password"}
                </button>
              </>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "farm" ? (
        <section className="panel-card grid gap-4">
          <h2 className="display-font">Farm Settings</h2>
          <div className="settings-form-grid">
            <label className="field">
              <span>Farm name</span>
              <input value={farmNameDraft} onChange={(e) => setFarmNameDraft(e.target.value)} />
            </label>
            <label className="field">
              <span>Time zone</span>
              <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/Anchorage">America/Anchorage</option>
                <option value="Pacific/Honolulu">Pacific/Honolulu</option>
              </select>
            </label>
          </div>
          <button className="secondary-button" type="button" disabled={saving} onClick={saveFarm}>
            Save Changes
          </button>
          <button className="farm-setup-link" type="button" onClick={() => navigate("/farm-setup")}>
            <strong>Go to Farm Setup</strong>
            <span>Add or edit your animals, flocks, and feed types</span>
          </button>
        </section>
      ) : null}

      {activeTab === "notifications" ? (
        <section className="panel-card grid gap-4">
          <h2 className="display-font">Notifications</h2>
          <div className="toggle-list">
            <ToggleRow
              checked={preferences.low_feed_alerts}
              description="Create in-app alerts when feed reaches par level."
              label="Low feed alerts"
              onChange={(checked) => updatePreference("low_feed_alerts", checked)}
            />
            <ToggleRow
              checked={preferences.email_alerts}
              description={`Send low-feed email alerts to ${emailAddress}.`}
              label="Email alerts"
              onChange={(checked) => updatePreference("email_alerts", checked)}
            />
            <ToggleRow
              checked={preferences.daily_summary_email}
              description="Send a daily summary email after chores are complete."
              label="Daily summary email"
              onChange={(checked) => updatePreference("daily_summary_email", checked)}
            />
          </div>
          <button className="primary-button" type="button" disabled={saving} onClick={saveNotifications}>
            Save
          </button>
        </section>
      ) : null}

      {activeTab === "billing" ? (
        <section className="panel-card grid gap-4">
          <h2 className="display-font">Billing & Plan</h2>
          <div className="billing-card">
            <div>
              <span className="mono-label">Current plan</span>
              <strong>Free</strong>
            </div>
            <span className="coming-soon-badge">Upgrade to Pro - coming soon</span>
            <p>Pro will add advanced reports, multi-user access, expanded automation, and deeper production analytics.</p>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ToggleRow({ checked, description, label, onChange }) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default Settings;

import React, { useContext, useEffect, useMemo, useState } from "react";
import { Bell, CreditCard, Settings as SettingsIcon, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import InlineFeedback from "../../components/InlineFeedback";
import { AuthContext, supabase } from "../../context/AuthContext";
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
  const { dbUser } = useContext(AuthContext);
  const { setFarmName } = useFarm();
  const [activeTab, setActiveTab] = useState("account");
  const [feedback, setFeedback] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [farmNameDraft, setFarmNameDraft] = useState("");
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(dbUser?.display_name || "");
    setEmail(dbUser?.email || "");
    setFarmNameDraft(dbUser?.farm_name || "");
    setPreferences({ ...defaultPreferences, ...(dbUser?.preferences || {}) });
    setTimeZone(dbUser?.preferences?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  }, [dbUser]);

  const emailAddress = useMemo(() => dbUser?.email || email || "your account email", [dbUser?.email, email]);

  async function saveAccount() {
    if (!dbUser?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateUser(dbUser.id, { display_name: displayName, farm_name: farmNameDraft || dbUser.farm_name });
      setFeedback({ type: "success", message: "Account updated" });
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    } finally {
      setSaving(false);
    }
  }

  async function updatePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      setFeedback({ type: "error", message: "New passwords must match." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ type: "success", message: "Password updated" });
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "Password could not be updated." });
    } finally {
      setSaving(false);
    }
  }

  async function saveFarm() {
    if (!dbUser?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await updateUser(dbUser.id, { farm_name: farmNameDraft });
      await updateUserPreferences(dbUser.id, { ...preferences, time_zone: timeZone });
      setFarmName(updated.farm_name);
      setFeedback({ type: "success", message: "Farm settings updated" });
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    } finally {
      setSaving(false);
    }
  }

  async function saveNotifications() {
    if (!dbUser?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateUserPreferences(dbUser.id, preferences);
      setFeedback({ type: "success", message: "Notification preferences saved" });
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(key, value) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="settings-page admin-settings-page">
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
        <section className="settings-panel admin-settings-panel">
          <h2 className="display-font">Account Settings</h2>
          <div className="settings-form-grid">
            <label className="field">
              <span>Display name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          </div>
          <button className="secondary-button" type="button" disabled={saving} onClick={saveAccount}>
            Save Changes
          </button>

          <div className="settings-divider" />
          <h3 className="display-font">Change Password</h3>
          <div className="settings-form-grid three">
            <label className="field">
              <span>Current password</span>
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
          </div>
          <button className="primary-button" type="button" disabled={saving} onClick={updatePassword}>
            Update Password
          </button>
        </section>
      ) : null}

      {activeTab === "farm" ? (
        <section className="settings-panel admin-settings-panel">
          <h2 className="display-font">Farm Settings</h2>
          <div className="settings-form-grid">
            <label className="field">
              <span>Farm name</span>
              <input value={farmNameDraft} onChange={(event) => setFarmNameDraft(event.target.value)} />
            </label>
            <label className="field">
              <span>Time zone</span>
              <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
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
        <section className="settings-panel admin-settings-panel">
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
        <section className="settings-panel admin-settings-panel billing-panel">
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
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function formatError(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Something went wrong.";
}

export default Settings;

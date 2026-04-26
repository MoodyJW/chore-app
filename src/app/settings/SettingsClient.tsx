"use client";

import { useState, useTransition } from "react";
import { NavBar } from "@/components/NavBar";
import { updateHousehold } from "./actions";
import { signOut } from "@/app/login/actions";
import { PushToggle } from "./PushToggle";
import type { Household, Streak } from "@/lib/types";
import styles from "./SettingsClient.module.css";

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)" },
  { value: "America/Phoenix",     label: "Arizona (no DST)" },
  { value: "Europe/London",       label: "London (GMT/BST)" },
  { value: "Europe/Paris",        label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin",       label: "Berlin (CET/CEST)" },
  { value: "Asia/Tokyo",          label: "Tokyo (JST)" },
  { value: "Asia/Shanghai",       label: "Shanghai (CST)" },
  { value: "Australia/Sydney",    label: "Sydney (AEST)" },
  { value: "Pacific/Auckland",    label: "Auckland (NZST)" },
];

function formatHour(h: number) {
  if (h === 0) return "12:00 AM (midnight)";
  if (h === 12) return "12:00 PM (noon)";
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

interface Props {
  household: Household | null;
  streak: Streak | null;
  email: string;
}

export function SettingsClient({ household, streak, email }: Props) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateHousehold(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className={styles.shell}>
      <NavBar householdName={household?.name ?? "ChoreApp"} />
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Settings</h1>
        </div>

        {/* Streak card */}
        {streak && (
          <div className={`glass ${styles.streakCard}`}>
            <div className={styles.streakStat}>
              <span className={styles.streakNum}>🔥 {streak.current_streak}</span>
              <span className={styles.streakLabel}>Current streak</span>
            </div>
            <div className={styles.streakDivider} />
            <div className={styles.streakStat}>
              <span className={styles.streakNum}>🏆 {streak.longest_streak}</span>
              <span className={styles.streakLabel}>Longest streak</span>
            </div>
          </div>
        )}

        {/* Household settings form */}
        <div className={`glass ${styles.section}`}>
          <h2 className={styles.sectionTitle}>Household</h2>
          <form onSubmit={handleSubmit} className={styles.form} autoComplete="off">
            <div className="form-group">
              <label htmlFor="name" className="form-label">Household Name</label>
              <input
                id="name"
                name="name"
                type="text"
                className="form-input"
                defaultValue={household?.name ?? ""}
                placeholder="e.g. The Smith Family"
                required
                maxLength={80}
              />
            </div>

            <div className="form-group">
              <label htmlFor="timezone" className="form-label">Timezone</label>
              <select
                id="timezone"
                name="timezone"
                className={`form-input ${styles.select}`}
                defaultValue={household?.timezone ?? "America/Los_Angeles"}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <p className={styles.hint}>Used to determine when your week resets.</p>
            </div>

            <div className="form-group">
              <label htmlFor="resetHour" className="form-label">
                Weekly Reset Time — Saturday at {formatHour(household?.reset_hour ?? 23)}
              </label>
              <input
                id="resetHour"
                name="resetHour"
                type="range"
                min={0}
                max={23}
                step={1}
                defaultValue={household?.reset_hour ?? 23}
                className={styles.slider}
                onChange={(e) => {
                  const label = document.getElementById("resetHourLabel");
                  if (label) label.textContent = `Saturday at ${formatHour(parseInt(e.target.value))}`;
                }}
              />
              <p className={styles.hint} id="resetHourLabel">
                Saturday at {formatHour(household?.reset_hour ?? 23)}
              </p>
            </div>

            {error && <p className="form-error">⚠️ {error}</p>}

            <button
              id="btn-save-settings"
              type="submit"
              className="btn btn-primary"
              disabled={pending}
            >
              {pending ? <span className="spinner" /> : saved ? "✓ Saved!" : "Save Settings"}
            </button>
          </form>
        </div>

        {/* Push Notifications */}
        <div className={`glass ${styles.section}`}>
          <h2 className={styles.sectionTitle}>Notifications</h2>
          <PushToggle />
        </div>

        {/* Account info */}
        <div className={`glass ${styles.section}`}>
          <h2 className={styles.sectionTitle}>Account</h2>
          <p className={styles.emailRow}>
            <span className={styles.emailLabel}>Signed in as</span>
            <span className={styles.emailValue}>{email}</span>
          </p>
          <form action={signOut} className={styles.signOutForm}>
            <button type="submit" className="btn btn-danger" id="btn-settings-sign-out">
              Sign Out
            </button>
          </form>
        </div>

        <div className={styles.bottomPad} />
      </main>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { signIn, signUp } from "./actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./page.module.css";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    // Inject the browser's timezone automatically
    formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

    startTransition(async () => {
      const action = mode === "login" ? signIn : signUp;
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <main className={styles.main}>
      {/* Background orbs */}
      <div className={styles.orb1} aria-hidden="true" />
      <div className={styles.orb2} aria-hidden="true" />

      <div className={styles.topBar}>
        <div className={styles.logo}>🏠 ChoreApp</div>
        <ThemeToggle />
      </div>

      <div className={styles.center}>
        <div className={`glass ${styles.card}`}>
          {/* Tab switcher */}
          <div className={styles.tabs} role="tablist">
            <button
              id="tab-login"
              role="tab"
              aria-selected={mode === "login"}
              className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`}
              onClick={() => { setMode("login"); setError(null); }}
              type="button"
            >
              Sign In
            </button>
            <button
              id="tab-register"
              role="tab"
              aria-selected={mode === "register"}
              className={`${styles.tab} ${mode === "register" ? styles.tabActive : ""}`}
              onClick={() => { setMode("register"); setError(null); }}
              type="button"
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className={styles.form} noValidate autoComplete="off">
            {/* Household name — only shown on register */}
            {mode === "register" && (
              <div className="form-group">
                <label htmlFor="householdName" className="form-label">
                  Household Name
                </label>
                <input
                  id="householdName"
                  name="householdName"
                  type="text"
                  className="form-input"
                  placeholder="e.g. The Smith Family"
                  required
                  maxLength={80}
                  autoComplete="organization"
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                required
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="form-input"
                placeholder={mode === "register" ? "Min. 8 characters" : "Enter password"}
                required
                minLength={mode === "register" ? 8 : 1}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className={styles.errorMsg} role="alert">
                ⚠️ {error}
              </p>
            )}

            <button
              id={mode === "login" ? "btn-sign-in" : "btn-create-account"}
              type="submit"
              className={`btn btn-primary btn-full btn-lg ${styles.submitBtn}`}
              disabled={isPending}
            >
              {isPending ? (
                <span className={styles.loadingRow}>
                  <span className="spinner" />
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </span>
              ) : (
                mode === "login" ? "Sign In" : "Create Account"
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

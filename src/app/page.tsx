import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Background orbs for depth */}
      <div className={styles.orb1} aria-hidden="true" />
      <div className={styles.orb2} aria-hidden="true" />

      <div className={styles.header}>
        <div className={styles.logo}>🏠</div>
        <ThemeToggle />
      </div>

      <div className={styles.hero}>
        <div className={`glass ${styles.card}`}>
          <div className={styles.badge}>
            <span>✨</span> Coming Soon
          </div>
          <h1 className={styles.title}>ChoreApp</h1>
          <p className={styles.subtitle}>
            Your household&apos;s chore tracker — with streaks, weekly history,
            and push reminders.
          </p>

          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>📅</span>
              <div>
                <strong>Weekly Planning</strong>
                <p>Assign chores to each day or mark them as daily recurring tasks.</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>🔥</span>
              <div>
                <strong>Streak Tracking</strong>
                <p>Build momentum — earn a streak every day all chores are done.</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>📖</span>
              <div>
                <strong>Week History</strong>
                <p>Look back at past weeks and celebrate your household&apos;s progress.</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>🔔</span>
              <div>
                <strong>Push Reminders</strong>
                <p>Get notified so nothing falls through the cracks.</p>
              </div>
            </div>
          </div>

          <p className={styles.buildingNote}>
            🚧 Setting up the project — authentication and dashboard coming next.
          </p>
        </div>
      </div>
    </main>
  );
}

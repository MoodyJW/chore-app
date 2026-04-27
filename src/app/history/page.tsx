import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import Link from "next/link";
import { formatWeekRange, toDateString, getWeekStart } from "@/lib/week-utils";
import styles from "./page.module.css";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currentWeekStart = toDateString(getWeekStart(new Date()));

  // Fetch all past weeks (exclude current)
  const { data: weeks } = await supabase
    .from("weeks")
    .select("*")
    .eq("household_id", user.id)
    .lt("week_start", currentWeekStart)
    .order("week_start", { ascending: false });

  const { data: household } = await supabase
    .from("households")
    .select("name")
    .eq("id", user.id)
    .single();

  // Fetch completion counts for all past weeks in one query
  const weekIds = (weeks ?? []).map((w) => w.id);
  const { data: completions } = weekIds.length
    ? await supabase
        .from("task_completions")
        .select("week_id")
        .in("week_id", weekIds)
    : { data: [] };

  // Build a count map: weekId → number of completions
  const countMap: Record<string, number> = {};
  for (const c of completions ?? []) {
    countMap[c.week_id] = (countMap[c.week_id] ?? 0) + 1;
  }

  return (
    <div className={styles.shell}>
      <NavBar householdName={household?.name ?? "TaskApp"} />
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>History</h1>
          <p className={styles.pageSubtitle}>
            All your completed weeks, saved forever.
          </p>
        </div>

        {(weeks ?? []).length === 0 ? (
          <div className={`glass ${styles.empty}`}>
            <span>📅</span>
            <p>No past weeks yet.</p>
            <p>Come back after your first week is done!</p>
          </div>
        ) : (
          <div className={styles.weekList}>
            {(weeks ?? []).map((week) => {
              const done = countMap[week.id] ?? 0;
              return (
                <Link
                  key={week.id}
                  href={`/history/${week.id}`}
                  className={`glass ${styles.weekCard}`}
                  id={`week-${week.id}`}
                >
                  <div className={styles.weekInfo}>
                    <span className={styles.weekRange}>
                      {formatWeekRange(week.week_start, week.week_end)}
                    </span>
                    <span className={styles.weekYear}>
                      {new Date(week.week_start + "T00:00:00").getFullYear()}
                    </span>
                  </div>
                  <div className={styles.weekStats}>
                    <span className={styles.statBadge}>
                      ✅ {done} task{done !== 1 ? "s" : ""} done
                    </span>
                    <span className={styles.arrow} aria-hidden="true">›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className={styles.bottomPad} />
      </main>
    </div>
  );
}

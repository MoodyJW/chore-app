import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import Link from "next/link";
import { DAY_NAMES, DAY_FULL, formatWeekRange, getDayDate } from "@/lib/week-utils";
import styles from "./page.module.css";

interface Props {
  params: Promise<{ weekId: string }>;
}

export default async function WeekDetailPage({ params }: Props) {
  const { weekId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: week },
    { data: chores },
    { data: completions },
    { data: dayLabels },
    { data: household },
  ] = await Promise.all([
    supabase.from("weeks").select("*").eq("id", weekId).eq("household_id", user.id).single(),
    supabase.from("chores").select("*").eq("household_id", user.id).eq("is_active", true).order("display_order"),
    supabase.from("chore_completions").select("chore_id, day_of_week").eq("week_id", weekId),
    supabase.from("day_labels").select("day_of_week, label").eq("household_id", user.id),
    supabase.from("households").select("name").eq("id", user.id).single(),
  ]);

  if (!week) notFound();

  const completionSet = new Set(
    (completions ?? []).map((c) => `${c.chore_id}-${c.day_of_week}`)
  );
  const labelMap = Object.fromEntries((dayLabels ?? []).map((l) => [l.day_of_week, l.label]));

  const dailyChores = (chores ?? []).filter((c) => c.recurrence === "daily");

  const totalDone = completions?.length ?? 0;
  const totalPossible =
    dailyChores.length * 7 +
    (chores ?? []).filter((c) => c.recurrence !== "daily").length;

  return (
    <div className={styles.shell}>
      <NavBar householdName={household?.name ?? "ChoreApp"} />
      <main className={styles.main}>
        {/* Back + header */}
        <div className={styles.pageHeader}>
          <Link href="/history" className={styles.backLink}>← Back to History</Link>
          <h1 className={styles.weekRange}>
            {formatWeekRange(week.week_start, week.week_end)}
          </h1>
          <div className={styles.summary}>
            <span className={styles.summaryBadge}>
              ✅ {totalDone} / {totalPossible} chores completed
            </span>
          </div>
        </div>

        {/* Daily section */}
        {dailyChores.length > 0 && (
          <ReadOnlySection
            label="Daily"
            subtitle={labelMap["daily"] || "Repeats every day"}
            chores={dailyChores}
            // For history, show daily chores repeated across all days
            days={DAY_NAMES as unknown as string[]}
            completionSet={completionSet}
            weekStart={week.week_start}
            isDaily={true}
          />
        )}

        {/* Per-day sections */}
        {DAY_NAMES.map((dayName, i) => {
          const dayChores = (chores ?? []).filter((c) => c.recurrence === dayName);
          if (dayChores.length === 0) return null;
          const allDone = dayChores.every((c) => completionSet.has(`${c.id}-${dayName}`));
          const done = dayChores.filter((c) => completionSet.has(`${c.id}-${dayName}`)).length;

          return (
            <div key={dayName} className={`glass ${styles.daySection} ${allDone ? styles.allDone : ""}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.dayName}>{DAY_FULL[i]}</span>
                  <span className={styles.daySubtitle}>
                    {labelMap[dayName] || getDayDate(week.week_start, i)}
                  </span>
                </div>
                <div className={styles.progress}>
                  {allDone
                    ? <span className={styles.doneBadge}>✅ All done!</span>
                    : <span className={styles.progressText}>{done}/{dayChores.length}</span>
                  }
                </div>
              </div>
              <ul className={styles.choreList}>
                {dayChores.map((chore) => {
                  const done = completionSet.has(`${chore.id}-${dayName}`);
                  return (
                    <li key={chore.id} className={`${styles.choreRow} ${done ? styles.choreDone : ""}`}>
                      <span className={styles.checkbox} aria-hidden="true">{done ? "✓" : ""}</span>
                      <span className={styles.choreName}>{chore.name}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        <div className={styles.bottomPad} />
      </main>
    </div>
  );
}

/* ── Read-only section for daily chores (shows all 7 days) ── */
function ReadOnlySection({
  label, subtitle, chores, days, completionSet, weekStart, isDaily,
}: {
  label: string;
  subtitle: string;
  chores: { id: string; name: string }[];
  days: string[];
  completionSet: Set<string>;
  weekStart: string;
  isDaily: boolean;
}) {
  if (!isDaily) return null;

  const totalPossible = chores.length * 7;
  const totalDone = days.flatMap((d) => chores.filter((c) => completionSet.has(`${c.id}-${d}`))).length;

  return (
    <div className={`glass ${styles.daySection}`}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.dayName}>{label}</span>
          <span className={styles.daySubtitle}>{subtitle}</span>
        </div>
        <span className={styles.progressText}>{totalDone}/{totalPossible}</span>
      </div>
      <div className={styles.dailyGrid}>
        {DAY_NAMES.map((dayName, i) => {
          const dayDone = chores.filter((c) => completionSet.has(`${c.id}-${dayName}`)).length;
          const allDone = dayDone === chores.length;
          return (
            <div key={dayName} className={`${styles.dailyDay} ${allDone ? styles.dailyDayDone : ""}`}>
              <span className={styles.dailyDayName}>{DAY_FULL[i].slice(0, 3)}</span>
              <span className={styles.dailyDayCount}>{dayDone}/{chores.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

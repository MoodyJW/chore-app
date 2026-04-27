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
    { data: tasks },
    { data: completions },
    { data: dayLabels },
    { data: household },
  ] = await Promise.all([
    supabase.from("weeks").select("*").eq("id", weekId).eq("household_id", user.id).single(),
    supabase.from("tasks").select("*").eq("household_id", user.id).eq("is_active", true).order("display_order"),
    supabase.from("task_completions").select("task_id, day_of_week").eq("week_id", weekId),
    supabase.from("day_labels").select("day_of_week, label").eq("household_id", user.id),
    supabase.from("households").select("name").eq("id", user.id).single(),
  ]);

  if (!week) notFound();

  const completionSet = new Set(
    (completions ?? []).map((c) => `${c.task_id}-${c.day_of_week}`)
  );
  const labelMap = Object.fromEntries((dayLabels ?? []).map((l) => [l.day_of_week, l.label]));

  const dailyTasks = (tasks ?? []).filter((c) => c.recurrence === "daily");

  const totalDone = completions?.length ?? 0;
  const totalPossible =
    dailyTasks.length * 7 +
    (tasks ?? []).filter((c) => c.recurrence !== "daily").length;

  return (
    <div className={styles.shell}>
      <NavBar householdName={household?.name ?? "TaskApp"} />
      <main className={styles.main}>
        {/* Back + header */}
        <div className={styles.pageHeader}>
          <Link href="/history" className={styles.backLink}>← Back to History</Link>
          <h1 className={styles.weekRange}>
            {formatWeekRange(week.week_start, week.week_end)}
          </h1>
          <div className={styles.summary}>
            <span className={styles.summaryBadge}>
              ✅ {totalDone} / {totalPossible} tasks completed
            </span>
          </div>
        </div>

        {/* Daily section */}
        {dailyTasks.length > 0 && (
          <ReadOnlySection
            label="Daily"
            subtitle={labelMap["daily"] || "Repeats every day"}
            tasks={dailyTasks}
            // For history, show daily tasks repeated across all days
            days={DAY_NAMES as unknown as string[]}
            completionSet={completionSet}
            weekStart={week.week_start}
            isDaily={true}
          />
        )}

        {/* Per-day sections */}
        {DAY_NAMES.map((dayName, i) => {
          const dayTasks = (tasks ?? []).filter((c) => c.recurrence === dayName);
          if (dayTasks.length === 0) return null;
          const allDone = dayTasks.every((c) => completionSet.has(`${c.id}-${dayName}`));
          const done = dayTasks.filter((c) => completionSet.has(`${c.id}-${dayName}`)).length;

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
                    : <span className={styles.progressText}>{done}/{dayTasks.length}</span>
                  }
                </div>
              </div>
              <ul className={styles.taskList}>
                {dayTasks.map((task) => {
                  const done = completionSet.has(`${task.id}-${dayName}`);
                  return (
                    <li key={task.id} className={`${styles.taskRow} ${done ? styles.taskDone : ""}`}>
                      <span className={styles.checkbox} aria-hidden="true">{done ? "✓" : ""}</span>
                      <span className={styles.taskName}>{task.name}</span>
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

/* ── Read-only section for daily tasks (shows all 7 days) ── */
function ReadOnlySection({
  label, subtitle, tasks, days, completionSet, weekStart, isDaily,
}: {
  label: string;
  subtitle: string;
  tasks: { id: string; name: string }[];
  days: string[];
  completionSet: Set<string>;
  weekStart: string;
  isDaily: boolean;
}) {
  if (!isDaily) return null;

  const totalPossible = tasks.length * 7;
  const totalDone = days.flatMap((d) => tasks.filter((c) => completionSet.has(`${c.id}-${d}`))).length;

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
          const dayDone = tasks.filter((c) => completionSet.has(`${c.id}-${dayName}`)).length;
          const allDone = dayDone === tasks.length;
          return (
            <div key={dayName} className={`${styles.dailyDay} ${allDone ? styles.dailyDayDone : ""}`}>
              <span className={styles.dailyDayName}>{DAY_FULL[i].slice(0, 3)}</span>
              <span className={styles.dailyDayCount}>{dayDone}/{tasks.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

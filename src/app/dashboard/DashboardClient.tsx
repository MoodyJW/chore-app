"use client";

import { useState, useTransition } from "react";
import { toggleCompletion } from "./actions";
import { NavBar } from "@/components/NavBar";
import { DAY_NAMES, DAY_FULL, getDayDate, getEndOfDayDate } from "@/lib/week-utils";
import type { Task, Household, Streak, Week } from "@/lib/types";
import styles from "./DashboardClient.module.css";

interface Props {
  household: Household | null;
  week: Week;
  weekLabel: string;
  tasks: Task[];
  initialCompletions: string[];
  streak: Pick<Streak, "current_streak" | "longest_streak" | "last_streak_date">;
  dayLabels: Record<string, string>;
}

export function DashboardClient({
  household,
  week,
  weekLabel,
  tasks,
  initialCompletions,
  streak: initialStreak,
  dayLabels,
}: Props) {
  const todayIndex = new Date().getDay(); // 0=Sun
  const todayName = DAY_NAMES[todayIndex];

  const [completions, setCompletions] = useState<Set<string>>(
    new Set(initialCompletions)
  );
  const [streak, setStreak] = useState(initialStreak);
  // Which day sections are expanded (today is expanded by default)
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(["daily", todayName])
  );
  const [, startTransition] = useTransition();

  const dailyTasks = tasks.filter((c) => c.recurrence === "daily");
  const tasksByDay = (day: string) =>
    tasks.filter((c) => c.recurrence === day);

  function getExpectedTasksForDay(day: string) {
    const dayIndex = DAY_NAMES.indexOf(day as any);
    const endOfDay = getEndOfDayDate(week.week_start, dayIndex);
    const dayTasks = [...dailyTasks, ...tasksByDay(day)];
    
    // Only expect tasks that existed before the end of this day
    return dayTasks.filter(c => new Date(c.created_at) <= endOfDay);
  }

  function getExpectedSpecificTasks(day: string, type: "daily" | "specific") {
    const expected = getExpectedTasksForDay(day);
    if (type === "daily") return expected.filter((c) => c.recurrence === "daily");
    return expected.filter((c) => c.recurrence === day);
  }

  function isCompleted(taskId: string, day: string) {
    return completions.has(`${taskId}-${day}`);
  }

  function allDoneForDay(day: string) {
    const dayTasks = getExpectedTasksForDay(day);
    if (dayTasks.length === 0) return false;
    return dayTasks.every((c) => isCompleted(c.id, day));
  }

  function progressForDay(day: string) {
    const dayTasks = getExpectedTasksForDay(day);
    const done = dayTasks.filter((c) => isCompleted(c.id, day)).length;
    return { done, total: dayTasks.length };
  }

  function toggleExpanded(section: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  }

  function handleToggle(taskId: string, day: string) {
    const key = `${taskId}-${day}`;
    const wasCompleted = completions.has(key);

    // Optimistic update
    setCompletions((prev) => {
      const next = new Set(prev);
      wasCompleted ? next.delete(key) : next.add(key);
      return next;
    });

    // Optimistic streak update for today
    if (day === todayName && !wasCompleted) {
      const dayTasks = getExpectedTasksForDay(day);
      const newCompletions = new Set(completions);
      newCompletions.add(key);
      const allDone = dayTasks.every((c) =>
        newCompletions.has(`${c.id}-${day}`)
      );
      if (allDone) {
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];
        if (streak.last_streak_date !== today) {
          const newCount =
            streak.last_streak_date === yesterdayStr
              ? streak.current_streak + 1
              : 1;
          setStreak((s) => ({
            ...s,
            current_streak: newCount,
            longest_streak: Math.max(newCount, s.longest_streak),
            last_streak_date: today,
          }));
        }
      }
    }

    // Server sync
    startTransition(async () => {
      await toggleCompletion(taskId, week.id, day, wasCompleted);
    });
  }

  return (
    <div className={styles.shell}>
      <NavBar householdName={household?.name ?? "TaskApp"} />

      <main className={styles.main}>
        {/* Week header */}
        <div className={styles.weekHeader}>
          <div>
            <p className={styles.weekLabel}>Week of</p>
            <h1 className={styles.weekRange}>{weekLabel}</h1>
          </div>
          {streak.current_streak > 0 && (
            <div className="streak-badge">
              🔥 {streak.current_streak} day{streak.current_streak !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Daily section */}
        {getExpectedSpecificTasks(todayName, "daily").length > 0 && (
          <DaySection
            label="Daily"
            subtitle={dayLabels["daily"] || "Repeats every day"}
            dayKey="daily"
            isToday={false}
            isPast={false}
            isExpanded={expanded.has("daily")}
            onToggleExpand={() => toggleExpanded("daily")}
            tasks={getExpectedSpecificTasks(todayName, "daily")}
            completions={completions}
            onToggle={(id) => handleToggle(id, todayName)}
            displayDay={todayName}
            allDone={getExpectedSpecificTasks(todayName, "daily").every((c) => isCompleted(c.id, todayName))}
            progress={{
              done: getExpectedSpecificTasks(todayName, "daily").filter((c) => isCompleted(c.id, todayName)).length,
              total: getExpectedSpecificTasks(todayName, "daily").length,
            }}
          />
        )}

        {/* One section per day of the week */}
        {DAY_NAMES.map((dayName, i) => {
          const dayTasks = getExpectedSpecificTasks(dayName, "specific");
          if (dayTasks.length === 0) return null;
          const isToday = i === todayIndex;
          const isPast = i < todayIndex;
          const { done, total } = progressForDay(dayName);

          return (
            <DaySection
              key={dayName}
              label={isToday ? `Today — ${DAY_FULL[i]}` : DAY_FULL[i]}
              subtitle={dayLabels[dayName] || getDayDate(week.week_start, i)}
              dayKey={dayName}
              isToday={isToday}
              isPast={isPast}
              isExpanded={expanded.has(dayName)}
              onToggleExpand={() => toggleExpanded(dayName)}
              tasks={dayTasks}
              completions={completions}
              onToggle={(id) => handleToggle(id, dayName)}
              displayDay={dayName}
              allDone={allDoneForDay(dayName)}
              progress={{ done, total }}
            />
          );
        })}

        {tasks.length === 0 && (
          <div className={`glass ${styles.emptyState}`}>
            <p>📝</p>
            <p>No tasks yet!</p>
            <p>Go to <strong>Manage Tasks</strong> to add some.</p>
          </div>
        )}

        <div className={styles.bottomPad} />
      </main>
    </div>
  );
}

/* ── Day Section ──────────────────────────────────────── */
interface DaySectionProps {
  label: string;
  subtitle: string;
  dayKey: string;
  isToday: boolean;
  isPast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  tasks: Task[];
  completions: Set<string>;
  onToggle: (taskId: string) => void;
  displayDay: string;
  allDone: boolean;
  progress: { done: number; total: number };
}

function DaySection({
  label, subtitle, dayKey, isToday, isPast, isExpanded,
  onToggleExpand, tasks, completions, onToggle, displayDay, allDone, progress,
}: DaySectionProps) {
  return (
    <div
      className={`glass ${styles.daySection} ${isToday ? styles.today : ""} ${isPast ? styles.past : ""} ${allDone ? styles.allDone : ""}`}
    >
      <button
        className={styles.dayHeader}
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        id={`section-${dayKey}`}
      >
        <div className={styles.dayHeaderLeft}>
          <span className={styles.dayName}>{label}</span>
          <span className={styles.dayDate}>{subtitle}</span>
        </div>
        <div className={styles.dayHeaderRight}>
          {allDone ? (
            <span className={styles.allDoneBadge}>✅ All done!</span>
          ) : (
            <span className={styles.progress}>
              {progress.done}/{progress.total}
            </span>
          )}
          <span className={styles.chevron} aria-hidden="true">
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className={styles.taskList}>
          {tasks.map((task) => {
            const done = completions.has(`${task.id}-${displayDay}`);
            return (
              <button
                key={task.id}
                className={`${styles.taskItem} ${done ? styles.taskItemDone : ""}`}
                onClick={() => onToggle(task.id)}
                aria-label={`${done ? "Uncheck" : "Check"} ${task.name}`}
              >
                <span className={`${styles.checkbox} ${done ? styles.checkboxDone : ""}`}
                  aria-hidden="true">
                  {done ? "✓" : ""}
                </span>
                <span className={styles.taskName}>{task.name}</span>
                {task.description && (
                  <span className={styles.taskDesc}>{task.description}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

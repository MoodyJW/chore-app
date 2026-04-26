"use client";

import { useState, useTransition } from "react";
import { toggleCompletion } from "./actions";
import { NavBar } from "@/components/NavBar";
import { DAY_NAMES, DAY_FULL, getDayDate } from "@/lib/week-utils";
import type { Chore, Household, Streak, Week } from "@/lib/types";
import styles from "./DashboardClient.module.css";

interface Props {
  household: Household | null;
  week: Week;
  weekLabel: string;
  chores: Chore[];
  initialCompletions: string[];
  streak: Pick<Streak, "current_streak" | "longest_streak" | "last_streak_date">;
  dayLabels: Record<string, string>;
}

export function DashboardClient({
  household,
  week,
  weekLabel,
  chores,
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

  const dailyChores = chores.filter((c) => c.recurrence === "daily");
  const choresByDay = (day: string) =>
    chores.filter((c) => c.recurrence === day);

  function isCompleted(choreId: string, day: string) {
    return completions.has(`${choreId}-${day}`);
  }

  function allDoneForDay(day: string) {
    const dayChores = [...dailyChores, ...choresByDay(day)];
    if (dayChores.length === 0) return false;
    return dayChores.every((c) => isCompleted(c.id, day));
  }

  function progressForDay(day: string) {
    const dayChores = [...dailyChores, ...choresByDay(day)];
    const done = dayChores.filter((c) => isCompleted(c.id, day)).length;
    return { done, total: dayChores.length };
  }

  function toggleExpanded(section: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  }

  function handleToggle(choreId: string, day: string) {
    const key = `${choreId}-${day}`;
    const wasCompleted = completions.has(key);

    // Optimistic update
    setCompletions((prev) => {
      const next = new Set(prev);
      wasCompleted ? next.delete(key) : next.add(key);
      return next;
    });

    // Optimistic streak update for today
    if (day === todayName && !wasCompleted) {
      const dayChores = [...dailyChores, ...choresByDay(day)];
      const newCompletions = new Set(completions);
      newCompletions.add(key);
      const allDone = dayChores.every((c) =>
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
      await toggleCompletion(choreId, week.id, day, wasCompleted);
    });
  }

  return (
    <div className={styles.shell}>
      <NavBar householdName={household?.name ?? "ChoreApp"} />

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
        {dailyChores.length > 0 && (
          <DaySection
            label="Daily"
            subtitle={dayLabels["daily"] || "Repeats every day"}
            dayKey="daily"
            isToday={false}
            isPast={false}
            isExpanded={expanded.has("daily")}
            onToggleExpand={() => toggleExpanded("daily")}
            chores={dailyChores}
            completions={completions}
            onToggle={(id) => handleToggle(id, todayName)}
            displayDay={todayName}
            allDone={dailyChores.every((c) => isCompleted(c.id, todayName))}
            progress={{
              done: dailyChores.filter((c) => isCompleted(c.id, todayName)).length,
              total: dailyChores.length,
            }}
          />
        )}

        {/* One section per day of the week */}
        {DAY_NAMES.map((dayName, i) => {
          const dayChores = choresByDay(dayName);
          if (dayChores.length === 0) return null;
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
              chores={dayChores}
              completions={completions}
              onToggle={(id) => handleToggle(id, dayName)}
              displayDay={dayName}
              allDone={allDoneForDay(dayName)}
              progress={{ done, total }}
            />
          );
        })}

        {chores.length === 0 && (
          <div className={`glass ${styles.emptyState}`}>
            <p>📝</p>
            <p>No chores yet!</p>
            <p>Go to <strong>Manage Chores</strong> to add some.</p>
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
  chores: Chore[];
  completions: Set<string>;
  onToggle: (choreId: string) => void;
  displayDay: string;
  allDone: boolean;
  progress: { done: number; total: number };
}

function DaySection({
  label, subtitle, dayKey, isToday, isPast, isExpanded,
  onToggleExpand, chores, completions, onToggle, displayDay, allDone, progress,
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
        <div className={styles.choreList}>
          {chores.map((chore) => {
            const done = completions.has(`${chore.id}-${displayDay}`);
            return (
              <button
                key={chore.id}
                className={`${styles.choreItem} ${done ? styles.choreItemDone : ""}`}
                onClick={() => onToggle(chore.id)}
                aria-label={`${done ? "Uncheck" : "Check"} ${chore.name}`}
              >
                <span className={`${styles.checkbox} ${done ? styles.checkboxDone : ""}`}
                  aria-hidden="true">
                  {done ? "✓" : ""}
                </span>
                <span className={styles.choreName}>{chore.name}</span>
                {chore.description && (
                  <span className={styles.choreDesc}>{chore.description}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

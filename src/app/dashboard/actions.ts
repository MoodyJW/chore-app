"use server";

import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES, getWeekStart, getWeekEnd, toDateString } from "@/lib/week-utils";
import { revalidatePath } from "next/cache";

/** Get or create the current week record for this household. */
export async function ensureCurrentWeek() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const now = new Date();
  const weekStart = toDateString(getWeekStart(now));
  const weekEnd = toDateString(getWeekEnd(now));

  const { data: existing } = await supabase
    .from("weeks")
    .select("*")
    .eq("household_id", user.id)
    .eq("week_start", weekStart)
    .single();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("weeks")
    .insert({ household_id: user.id, week_start: weekStart, week_end: weekEnd })
    .select()
    .single();

  if (error) throw error;
  return created;
}

/** Toggle a chore completion on/off for a specific day in a week. */
export async function toggleCompletion(
  choreId: string,
  weekId: string,
  dayOfWeek: string,
  currentlyCompleted: boolean
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (currentlyCompleted) {
    await supabase
      .from("chore_completions")
      .delete()
      .eq("chore_id", choreId)
      .eq("week_id", weekId)
      .eq("day_of_week", dayOfWeek);
  } else {
    await supabase
      .from("chore_completions")
      .insert({ chore_id: choreId, week_id: weekId, day_of_week: dayOfWeek });
  }

  await recalculateStreak(user.id, weekId, dayOfWeek);
  revalidatePath("/dashboard");
}

/** After any toggle, check if today is fully done and update the streak. */
async function recalculateStreak(
  householdId: string,
  weekId: string,
  dayOfWeek: string
) {
  // Only count the streak for today's day
  const todayName = DAY_NAMES[new Date().getDay()];
  if (dayOfWeek !== todayName) return;

  const supabase = await createClient();

  const { data: chores } = await supabase
    .from("chores")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .in("recurrence", ["daily", dayOfWeek]);

  const { data: completions } = await supabase
    .from("chore_completions")
    .select("chore_id")
    .eq("week_id", weekId)
    .eq("day_of_week", dayOfWeek);

  const allDone =
    (chores?.length ?? 0) > 0 &&
    (completions?.length ?? 0) >= (chores?.length ?? 0);

  if (!allDone) return;

  const today = toDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  const { data: streak } = await supabase
    .from("streaks")
    .select("*")
    .eq("household_id", householdId)
    .single();

  if (!streak || streak.last_streak_date === today) return;

  const newStreak =
    streak.last_streak_date === yesterdayStr
      ? streak.current_streak + 1
      : 1;

  await supabase
    .from("streaks")
    .update({
      current_streak: newStreak,
      longest_streak: Math.max(newStreak, streak.longest_streak),
      last_streak_date: today,
      updated_at: new Date().toISOString(),
    })
    .eq("household_id", householdId);
}

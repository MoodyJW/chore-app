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

async function recalculateStreak(
  householdId: string,
  weekId: string,
  dayOfWeek: string
) {
  const supabase = await createClient();

  const { data: household } = await supabase
    .from("households")
    .select("timezone")
    .eq("id", householdId)
    .single();

  const tz = household?.timezone || "America/Los_Angeles";
  
  const nowUTC = new Date();
  
  let localDateString;
  try {
    localDateString = new Intl.DateTimeFormat("en-US", { 
      timeZone: tz, 
      year: 'numeric', month: 'numeric', day: 'numeric' 
    }).format(nowUTC);
  } catch (e) {
    console.warn(`Invalid timezone: ${tz}, falling back to America/Los_Angeles`);
    localDateString = new Intl.DateTimeFormat("en-US", { 
      timeZone: "America/Los_Angeles", 
      year: 'numeric', month: 'numeric', day: 'numeric' 
    }).format(nowUTC);
  }
  
  const localDateObj = new Date(localDateString + " 00:00:00");
  const todayName = DAY_NAMES[localDateObj.getDay()];

  // Only count the streak for today's day
  if (dayOfWeek !== todayName) return;

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

  const todayStr = toDateString(localDateObj);
  const yesterdayObj = new Date(localDateObj);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = toDateString(yesterdayObj);

  const { data: streak } = await supabase
    .from("streaks")
    .select("*")
    .eq("household_id", householdId)
    .single();

  if (!streak) return;

  if (!allDone) {
    // Revert streak if they unchecked a chore today
    if (streak.last_streak_date === todayStr) {
      const newStreak = Math.max(0, streak.current_streak - 1);
      await supabase
        .from("streaks")
        .update({
          current_streak: newStreak,
          last_streak_date: newStreak === 0 ? null : yesterdayStr,
          updated_at: new Date().toISOString(),
        })
        .eq("household_id", householdId);
    }
    return;
  }

  // If already logged today, do nothing
  if (streak.last_streak_date === todayStr) return;

  const newStreak =
    streak.last_streak_date === yesterdayStr
      ? streak.current_streak + 1
      : 1;

  await supabase
    .from("streaks")
    .update({
      current_streak: newStreak,
      longest_streak: Math.max(newStreak, streak.longest_streak),
      last_streak_date: todayStr,
      updated_at: new Date().toISOString(),
    })
    .eq("household_id", householdId);
}

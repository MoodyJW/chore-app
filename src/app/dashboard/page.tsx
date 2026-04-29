import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ensureCurrentWeek } from "./actions";
import { DashboardClient } from "./DashboardClient";
import { formatWeekRange, getCurrentMonthString } from "@/lib/week-utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const week = await ensureCurrentWeek();
  const currentMonthString = getCurrentMonthString(new Date());

  const [{ data: household }, { data: streak }, { data: tasks }, { data: completions }, { data: dayLabels }, { data: monthlyCompletions }] =
    await Promise.all([
      supabase.from("households").select("*").eq("id", user.id).single(),
      supabase.from("streaks").select("*").eq("household_id", user.id).single(),
      supabase
        .from("tasks")
        .select("*")
        .eq("household_id", user.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("task_completions")
        .select("task_id, day_of_week")
        .eq("week_id", week.id),
      supabase
        .from("day_labels")
        .select("day_of_week, label")
        .eq("household_id", user.id),
      supabase
        .from("monthly_task_completions")
        .select("task_id")
        .eq("household_id", user.id)
        .eq("month_string", currentMonthString),
    ]);

  const completionSet = new Set(
    (completions ?? []).map((c) => `${c.task_id}-${c.day_of_week}`)
  );

  const labelMap = Object.fromEntries(
    (dayLabels ?? []).map((l) => [l.day_of_week, l.label])
  );

  return (
    <DashboardClient
      household={household}
      week={week}
      weekLabel={formatWeekRange(week.week_start, week.week_end)}
      tasks={tasks ?? []}
      initialCompletions={Array.from(completionSet)}
      initialMonthlyCompletions={(monthlyCompletions ?? []).map(c => c.task_id)}
      monthString={currentMonthString}
      streak={streak ?? { current_streak: 0, longest_streak: 0, last_streak_date: null }}
      dayLabels={labelMap}
    />
  );
}

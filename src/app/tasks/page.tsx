import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TasksClient } from "./TasksClient";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tasks }, { data: dayLabels }, { data: household }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("household_id", user.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("day_labels")
        .select("*")
        .eq("household_id", user.id),
      supabase
        .from("households")
        .select("name")
        .eq("id", user.id)
        .single(),
    ]);

  return (
    <TasksClient
      tasks={tasks ?? []}
      dayLabels={dayLabels ?? []}
      householdName={household?.name ?? "TaskApp"}
    />
  );
}

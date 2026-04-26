import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChoresClient } from "./ChoresClient";

export default async function ChoresPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: chores }, { data: dayLabels }, { data: household }] =
    await Promise.all([
      supabase
        .from("chores")
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
    <ChoresClient
      chores={chores ?? []}
      dayLabels={dayLabels ?? []}
      householdName={household?.name ?? "ChoreApp"}
    />
  );
}

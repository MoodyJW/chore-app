import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: household }, { data: streak }] = await Promise.all([
    supabase.from("households").select("*").eq("id", user.id).single(),
    supabase.from("streaks").select("*").eq("household_id", user.id).single(),
  ]);

  return (
    <SettingsClient
      household={household}
      streak={streak}
      email={user.email ?? ""}
    />
  );
}

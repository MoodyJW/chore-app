"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateHousehold(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = (formData.get("name") as string).trim();
  const timezone = formData.get("timezone") as string;
  const resetHour = parseInt(formData.get("resetHour") as string, 10);

  if (!name) return { error: "Household name is required" };
  if (isNaN(resetHour) || resetHour < 0 || resetHour > 23)
    return { error: "Invalid reset hour" };

  const { error } = await supabase
    .from("households")
    .update({ name, timezone, reset_hour: resetHour })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { error: null };
}

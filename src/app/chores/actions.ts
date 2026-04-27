"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Default data ────────────────────────────────────────────
const DEFAULT_DAY_LABELS = [
  { day_of_week: "daily", label: "Every Day" },
  { day_of_week: "sunday", label: "Outdoors" },
  { day_of_week: "monday", label: "Bathrooms" },
  { day_of_week: "tuesday", label: "Bedrooms" },
  { day_of_week: "wednesday", label: "Kitchen" },
  { day_of_week: "thursday", label: "Living Room" },
  { day_of_week: "friday", label: "Laundry" },
  { day_of_week: "saturday", label: "General & Office" },
];

const DEFAULT_CHORES = [
  // Daily
  { name: "Wipe kitchen counters & sink", recurrence: "daily", display_order: 0 },
  { name: "Wipe down stove top", recurrence: "daily", display_order: 1 },
  { name: "Dishes / run dishwasher", recurrence: "daily", display_order: 2 },
  { name: "Take out trash if full", recurrence: "daily", display_order: 3 },
  { name: "Laundry if needed, including folding & putting away", recurrence: "daily", display_order: 4 },
  // Sunday — Outdoors
  { name: "Trim around walkway if needed", recurrence: "sunday", display_order: 0 },
  { name: "Sweep porch & walkway", recurrence: "sunday", display_order: 1 },
  // Monday — Bathrooms
  { name: "Dust ceiling", recurrence: "monday", display_order: 0 },
  { name: "Wipe mirror", recurrence: "monday", display_order: 1 },
  { name: "Clean sink(s)", recurrence: "monday", display_order: 2 },
  { name: "Clean tub or shower", recurrence: "monday", display_order: 3 },
  { name: "Scrub toilet(s)", recurrence: "monday", display_order: 4 },
  { name: "Mop bathroom floor", recurrence: "monday", display_order: 5 },
  { name: "Replace towels", recurrence: "monday", display_order: 6 },
  // Tuesday — Bedrooms
  { name: "Dust ceiling", recurrence: "tuesday", display_order: 0 },
  { name: "Dust surfaces", recurrence: "tuesday", display_order: 1 },
  { name: "Clean mirrors", recurrence: "tuesday", display_order: 2 },
  { name: "Change bed sheets", recurrence: "tuesday", display_order: 3 },
  { name: "Tidy closets", recurrence: "tuesday", display_order: 4 },
  { name: "Sweep bedroom(s)", recurrence: "tuesday", display_order: 5 },
  { name: "Mop bedroom(s)", recurrence: "tuesday", display_order: 6 },
  // Wednesday — Kitchen
  { name: "Dust ceiling", recurrence: "wednesday", display_order: 0 },
  { name: "Wipe cabinet fronts", recurrence: "wednesday", display_order: 1 },
  { name: "Clean microwave", recurrence: "wednesday", display_order: 2 },
  { name: "Deep clean stove & oven", recurrence: "wednesday", display_order: 3 },
  { name: "Clean kitchen sink & counters", recurrence: "wednesday", display_order: 4 },
  { name: "Clean trash can if needed", recurrence: "wednesday", display_order: 5 },
  { name: "Sweep kitchen floor", recurrence: "wednesday", display_order: 6 },
  { name: "Mop kitchen floor", recurrence: "wednesday", display_order: 7 },
  { name: "Take trash to curb", recurrence: "wednesday", display_order: 8 },
  // Thursday — Living Room
  { name: "Dust ceiling", recurrence: "thursday", display_order: 0 },
  { name: "Dust furniture & shelves", recurrence: "thursday", display_order: 1 },
  { name: "Wipe windows & glass", recurrence: "thursday", display_order: 2 },
  { name: "Take boxes to dump if needed", recurrence: "thursday", display_order: 3 },
  { name: "Sweep floor", recurrence: "thursday", display_order: 4 },
  { name: "Mop floor", recurrence: "thursday", display_order: 5 },
  // Friday — Laundry
  { name: "Dust ceiling", recurrence: "friday", display_order: 0 },
  { name: "Wipe down cabinets and counter", recurrence: "friday", display_order: 1 },
  { name: "Wipe down washer & dryer", recurrence: "friday", display_order: 2 },
  { name: "Tidy space as needed", recurrence: "friday", display_order: 3 },
  { name: "Sweep floor", recurrence: "friday", display_order: 4 },
  { name: "Mop floor", recurrence: "friday", display_order: 5 },
  // Saturday — General & Office
  { name: "Dust ceiling", recurrence: "saturday", display_order: 0 },
  { name: "Tidy office", recurrence: "saturday", display_order: 1 },
  { name: "Wipe down desk and computer keyboard", recurrence: "saturday", display_order: 2 },
  { name: "Clean out fridge", recurrence: "saturday", display_order: 3 },
  { name: "Organize pantry", recurrence: "saturday", display_order: 4 },
  { name: "Grocery shopping if needed", recurrence: "saturday", display_order: 5 },
];

// ── Actions ─────────────────────────────────────────────────

export async function loadDefaultChores() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Delete all existing chores for this household to prevent duplicates
  await supabase.from("chores").delete().eq("household_id", user.id);

  // Insert default chores
  const choresWithHousehold = DEFAULT_CHORES.map((c) => ({
    ...c,
    household_id: user.id,
  }));

  const { error } = await supabase.from("chores").insert(choresWithHousehold);
  if (error) throw new Error(error.message);

  // Upsert day labels (has a proper unique constraint)
  const labelsWithHousehold = DEFAULT_DAY_LABELS.map((l) => ({
    ...l,
    household_id: user.id,
  }));

  await supabase.from("day_labels").upsert(labelsWithHousehold, {
    onConflict: "household_id,day_of_week",
    ignoreDuplicates: false,
  });

  revalidatePath("/chores");
  revalidatePath("/dashboard");
}

export async function addChore(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const recurrence = formData.get("recurrence") as string;

  if (!name) return { error: "Name is required" };

  // Get max display_order for this day
  const { data: existing } = await supabase
    .from("chores")
    .select("display_order")
    .eq("household_id", user.id)
    .eq("recurrence", recurrence)
    .order("display_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.display_order ?? -1) + 1;

  const { error } = await supabase.from("chores").insert({
    household_id: user.id,
    name,
    description,
    recurrence,
    display_order: nextOrder,
  });

  if (error) return { error: error.message };

  revalidatePath("/chores");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function deleteChore(choreId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("chores")
    .update({ is_active: false })
    .eq("id", choreId)
    .eq("household_id", user.id);

  revalidatePath("/chores");
  revalidatePath("/dashboard");
}

export async function updateChore(choreId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string | null)?.trim() || null;

  if (!name) return { error: "Name is required" };

  const { error } = await supabase
    .from("chores")
    .update({ name, description })
    .eq("id", choreId)
    .eq("household_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/chores");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function reorderChores(day: string, orderedIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from("chores")
        .update({ display_order: idx })
        .eq("id", id)
        .eq("household_id", user.id)
        .eq("recurrence", day)
    )
  );

  revalidatePath("/chores");
  revalidatePath("/dashboard");
}

export async function upsertDayLabel(dayOfWeek: string, label: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase.from("day_labels").upsert(
    { household_id: user.id, day_of_week: dayOfWeek, label: label.trim() },
    { onConflict: "household_id,day_of_week" }
  );

  revalidatePath("/chores");
  revalidatePath("/dashboard");
}

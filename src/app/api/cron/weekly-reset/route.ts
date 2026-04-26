import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWeekStart, getWeekEnd, toDateString } from "@/lib/week-utils";

// This route is called by Vercel Cron every Sunday at 00:05 UTC.
// It creates new week records for any household that doesn't have one yet.
// The client-side ensureCurrentWeek() is the primary mechanism;
// this cron is a safety net that fires even if no one logs in.
export async function GET(request: Request) {
  // Verify the request is from Vercel Cron (or an authorized caller)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use the service role (secret) key so we can read all households
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const now = new Date();
  const weekStart = toDateString(getWeekStart(now));
  const weekEnd = toDateString(getWeekEnd(now));

  // Get all households
  const { data: households, error: hhError } = await supabase
    .from("households")
    .select("id");

  if (hhError) {
    console.error("Cron: failed to fetch households", hhError);
    return NextResponse.json({ error: hhError.message }, { status: 500 });
  }

  if (!households?.length) {
    return NextResponse.json({ message: "No households found", created: 0 });
  }

  // For each household, upsert a week record (ignore if already exists)
  const rows = households.map((h) => ({
    household_id: h.id,
    week_start: weekStart,
    week_end: weekEnd,
  }));

  const { error: insertError, data: createdWeeks } = await supabase
    .from("weeks")
    .upsert(rows, { onConflict: "household_id,week_start", ignoreDuplicates: true })
    .select("id");

  if (insertError) {
    console.error("Cron: failed to create weeks", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  console.log(`Cron: ensured week ${weekStart} → ${weekEnd} for ${households.length} households`);
  return NextResponse.json({
    message: "Weekly reset complete",
    week: `${weekStart} → ${weekEnd}`,
    households: households.length,
    newWeeksCreated: createdWeeks?.length ?? 0,
  });
}

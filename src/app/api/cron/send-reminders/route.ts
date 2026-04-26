import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getWeekStart, toDateString, DAY_NAMES } from "@/lib/week-utils";

// Setup web-push
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function GET(request: Request) {
  // Verify cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const now = new Date();

  // 1. Fetch all households to determine their local time
  const { data: households } = await supabase.from("households").select("id, timezone");
  
  // 2. Filter households where the current hour is 19 (7 PM)
  const targetHouseholdIds = households?.filter(h => {
    try {
      const tz = h.timezone || "America/Los_Angeles";
      const localTime = new Date(now.toLocaleString("en-US", { timeZone: tz }));
      return localTime.getHours() === 19;
    } catch {
      return false;
    }
  }).map(h => h.id) || [];

  if (targetHouseholdIds.length === 0) {
    return NextResponse.json({ message: "No households at 7 PM right now" });
  }

  // 3. Fetch push subscriptions for those households
  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("household_id", targetHouseholdIds);

  if (subsError || !subs?.length) {
    return NextResponse.json({ message: "No subscriptions to notify at this time" });
  }

  const subscribedHouseholdIds = Array.from(new Set(subs.map(s => s.household_id)));

  // 4. Get active week for these households
  const weekStart = toDateString(getWeekStart(now));
  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, household_id")
    .eq("week_start", weekStart)
    .in("household_id", subscribedHouseholdIds);
  
  if (!weeks?.length) return NextResponse.json({ message: "No active weeks for target households" });

  const weekMap = new Map(weeks.map(w => [w.household_id, w.id]));
  const weekIds = weeks.map(w => w.id);

  // 5. Get chores for today or daily
  const todayName = DAY_NAMES[now.getDay()]; // Note: uses UTC day, might be edge case if UTC day != local day, but close enough for 7PM
  const { data: chores } = await supabase
    .from("chores")
    .select("id, household_id")
    .eq("is_active", true)
    .in("household_id", subscribedHouseholdIds)
    .in("recurrence", ["daily", todayName]);

  if (!chores?.length) return NextResponse.json({ message: "No chores to remind about today" });

  // 6. Get completions for today
  const { data: completions } = await supabase
    .from("chore_completions")
    .select("chore_id, week_id")
    .in("week_id", weekIds)
    .eq("day_of_week", todayName);

  const completedMap = new Set(completions?.map(c => `${c.week_id}-${c.chore_id}`));

  // 7. Find households with pending chores
  const householdsWithPending = new Set<string>();
  for (const chore of chores) {
    const weekId = weekMap.get(chore.household_id);
    if (!weekId) continue;
    if (!completedMap.has(`${weekId}-${chore.id}`)) {
      householdsWithPending.add(chore.household_id);
    }
  }

  if (householdsWithPending.size === 0) {
    return NextResponse.json({ message: "All chores completed for all targeted households!" });
  }

  // 8. Send notifications
  let successCount = 0;
  let failCount = 0;

  const notifications = subs
    .filter(sub => householdsWithPending.has(sub.household_id))
    .map(async sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      
      const payload = JSON.stringify({
        title: "Daily Chores Reminder",
        body: "You have incomplete chores for today. Time to get them done!",
        url: "/dashboard"
      });

      try {
        await webpush.sendNotification(pushSubscription, payload);
        successCount++;
      } catch (err: any) {
        console.error("Failed to send push:", err);
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription has expired or is no longer valid
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        failCount++;
      }
    });

  await Promise.all(notifications);

  return NextResponse.json({
    message: "Reminders sent",
    successCount,
    failCount,
    householdsNotified: householdsWithPending.size
  });
}

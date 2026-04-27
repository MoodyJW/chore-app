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

  // 1. Fetch push subscriptions
  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("*");

  if (subsError || !subs?.length) {
    return NextResponse.json({ message: "No subscriptions to notify at this time" });
  }

  const subscribedHouseholdIds = Array.from(new Set(subs.map(s => s.household_id)));

  // 2. Fetch households to get timezones
  const { data: households } = await supabase
    .from("households")
    .select("id, timezone")
    .in("id", subscribedHouseholdIds);
    
  if (!households?.length) {
    return NextResponse.json({ message: "No valid households found for subscriptions" });
  }

  const householdTimezones = new Map(households.map(h => [h.id, h.timezone || "America/Los_Angeles"]));

  // Group households by timezone
  const tzGroups = new Map<string, string[]>();
  for (const [hhId, tz] of householdTimezones.entries()) {
    if (!tzGroups.has(tz)) tzGroups.set(tz, []);
    tzGroups.get(tz)!.push(hhId);
  }

  const nowUTC = new Date();
  const householdsWithPending = new Set<string>();

  // Process each timezone group separately
  for (const [tz, hhIds] of tzGroups.entries()) {
    // 3. Determine local day and week start for this timezone
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
    
    // Parse as local midnight (which becomes UTC midnight in Vercel environment)
    const localDateObj = new Date(localDateString + " 00:00:00");
    const todayName = DAY_NAMES[localDateObj.getDay()];
    
    // Get the week start for this local date
    const weekStart = toDateString(getWeekStart(localDateObj));

    // 4. Get active week for these households
    const { data: weeks } = await supabase
      .from("weeks")
      .select("id, household_id")
      .eq("week_start", weekStart)
      .in("household_id", hhIds);
    
    if (!weeks?.length) continue;

    const weekMap = new Map(weeks.map(w => [w.household_id, w.id]));
    const weekIds = weeks.map(w => w.id);

    // 5. Get chores for today or daily
    const { data: chores } = await supabase
      .from("chores")
      .select("id, household_id")
      .eq("is_active", true)
      .in("household_id", hhIds)
      .in("recurrence", ["daily", todayName]);

    if (!chores?.length) continue;

    // 6. Get completions for today
    const { data: completions } = await supabase
      .from("chore_completions")
      .select("chore_id, week_id")
      .in("week_id", weekIds)
      .eq("day_of_week", todayName);

    const completedMap = new Set(completions?.map(c => `${c.week_id}-${c.chore_id}`));

    // 7. Find households with pending chores in this timezone
    for (const chore of chores) {
      const weekId = weekMap.get(chore.household_id);
      if (!weekId) continue;
      if (!completedMap.has(`${weekId}-${chore.id}`)) {
        householdsWithPending.add(chore.household_id);
      }
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

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
  // Track which households have all tasks done vs pending
  const householdsAllDone = new Set<string>();
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
    
    // Parse as local midnight
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
    
    if (!weeks?.length) {
      // No week record means no tasks tracked yet — treat as "all done" (nothing to do)
      for (const hhId of hhIds) {
        householdsAllDone.add(hhId);
      }
      continue;
    }

    const weekMap = new Map(weeks.map(w => [w.household_id, w.id]));
    const weekIds = weeks.map(w => w.id);

    // 5. Get tasks for today or daily (excluding monthly — they don't count)
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, household_id")
      .eq("is_active", true)
      .in("household_id", hhIds)
      .in("recurrence", ["daily", todayName]);

    if (!tasks?.length) {
      // No tasks configured — treat as "all done"
      for (const hhId of hhIds) {
        householdsAllDone.add(hhId);
      }
      continue;
    }

    // 6. Get completions for today
    const { data: completions } = await supabase
      .from("task_completions")
      .select("task_id, week_id")
      .in("week_id", weekIds)
      .eq("day_of_week", todayName);

    const completedMap = new Set(completions?.map(c => `${c.week_id}-${c.task_id}`));

    // 7. Build per-household task/completion counts
    const hhTaskCounts = new Map<string, number>();
    const hhCompletedCounts = new Map<string, number>();

    for (const task of tasks) {
      hhTaskCounts.set(task.household_id, (hhTaskCounts.get(task.household_id) || 0) + 1);
      const weekId = weekMap.get(task.household_id);
      if (weekId && completedMap.has(`${weekId}-${task.id}`)) {
        hhCompletedCounts.set(task.household_id, (hhCompletedCounts.get(task.household_id) || 0) + 1);
      }
    }

    for (const hhId of hhIds) {
      const total = hhTaskCounts.get(hhId) || 0;
      const done = hhCompletedCounts.get(hhId) || 0;
      if (total === 0 || done >= total) {
        householdsAllDone.add(hhId);
      } else {
        householdsWithPending.add(hhId);
      }
    }
  }

  // 8. Send notifications to ALL subscribed households
  let successCount = 0;
  let failCount = 0;

  const notifications = subs.map(async sub => {
    const allDone = householdsAllDone.has(sub.household_id) && !householdsWithPending.has(sub.household_id);

    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
    
    const payload = allDone
      ? JSON.stringify({
          title: "🎉 Great job today!",
          body: "Congrats on completing all your tasks! Keep the streak going tomorrow!",
          url: "/dashboard"
        })
      : JSON.stringify({
          title: "📋 Daily Tasks Reminder",
          body: "You have incomplete tasks for today. Time to get them done!",
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
    householdsAllDone: householdsAllDone.size,
    householdsWithPending: householdsWithPending.size,
  });
}

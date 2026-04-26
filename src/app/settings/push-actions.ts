"use server";

import { createClient } from "@/lib/supabase/server";

export async function savePushSubscription(subscriptionString: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  try {
    const sub = JSON.parse(subscriptionString);

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        household_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("Error saving push subscription:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("Invalid subscription payload:", err);
    return { success: false, error: "Invalid payload" };
  }
}

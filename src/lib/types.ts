// Database types — will be expanded as we build out the schema
// These are hand-written for now; you can auto-generate these from Supabase CLI later

export type RecurrenceDay =
  | "daily"
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export interface Household {
  id: string;
  name: string;
  timezone: string;
  reset_day: RecurrenceDay; // default 'saturday'
  reset_hour: number; // 0–23, hour of day for weekly reset
  created_at: string;
}

export interface Chore {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  recurrence: RecurrenceDay;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Week {
  id: string;
  household_id: string;
  week_start: string; // ISO date string (Sunday)
  week_end: string;   // ISO date string (Saturday)
  created_at: string;
}

export interface ChoreCompletion {
  id: string;
  chore_id: string;
  week_id: string;
  day_of_week: RecurrenceDay;
  completed_at: string;
}

export interface Streak {
  id: string;
  household_id: string;
  current_streak: number;
  longest_streak: number;
  last_streak_date: string | null; // ISO date string
}

export interface PushSubscriptionRecord {
  id: string;
  household_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface DayLabel {
  id: string;
  household_id: string;
  day_of_week: string;
  label: string;
}

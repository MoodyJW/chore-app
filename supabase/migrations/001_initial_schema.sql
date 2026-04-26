-- ============================================================
-- ChoreApp — Database Migration
-- Run this in the Supabase SQL Editor (supabase.com → your
-- project → SQL Editor → New query → paste → Run)
-- ============================================================

-- ============================================================
-- HOUSEHOLDS
-- One row per Supabase auth user. The auth user IS the household.
-- id matches auth.uid() so RLS is simple and fast.
-- ============================================================
CREATE TABLE IF NOT EXISTS households (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'My Household',
  timezone      TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  reset_hour    SMALLINT NOT NULL DEFAULT 23 CHECK (reset_hour BETWEEN 0 AND 23),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "households: owner full access"
  ON households FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- CHORES
-- Template definitions. Not deleted between weeks; they carry
-- forward until soft-deleted (is_active = false).
-- ============================================================
CREATE TABLE IF NOT EXISTS chores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  recurrence     TEXT NOT NULL CHECK (recurrence IN (
                   'daily','sunday','monday','tuesday',
                   'wednesday','thursday','friday','saturday'
                 )),
  display_order  SMALLINT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chores: owner full access"
  ON chores FOR ALL
  USING (auth.uid() = household_id)
  WITH CHECK (auth.uid() = household_id);

CREATE INDEX IF NOT EXISTS chores_household_id_idx ON chores(household_id);
CREATE INDEX IF NOT EXISTS chores_recurrence_idx ON chores(household_id, recurrence) WHERE is_active = TRUE;

-- ============================================================
-- WEEKS
-- One row per household per week (Sunday → Saturday).
-- Created automatically when a new week begins.
-- ============================================================
CREATE TABLE IF NOT EXISTS weeks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  week_start     DATE NOT NULL, -- always a Sunday
  week_end       DATE NOT NULL, -- always a Saturday
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, week_start)
);

ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weeks: owner read"
  ON weeks FOR SELECT
  USING (auth.uid() = household_id);

CREATE POLICY "weeks: owner insert"
  ON weeks FOR INSERT
  WITH CHECK (auth.uid() = household_id);

CREATE INDEX IF NOT EXISTS weeks_household_id_idx ON weeks(household_id);
CREATE INDEX IF NOT EXISTS weeks_start_idx ON weeks(household_id, week_start DESC);

-- ============================================================
-- CHORE COMPLETIONS
-- One row = one chore marked done on one day in one week.
-- Deleting the row = unchecking the chore.
-- RLS checks via the parent week's household_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS chore_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_id      UUID NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  week_id       UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  day_of_week   TEXT NOT NULL CHECK (day_of_week IN (
                  'sunday','monday','tuesday','wednesday',
                  'thursday','friday','saturday'
                )),
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chore_id, week_id, day_of_week)
);

ALTER TABLE chore_completions ENABLE ROW LEVEL SECURITY;

-- RLS joins through weeks to verify household ownership
CREATE POLICY "chore_completions: owner read"
  ON chore_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM weeks
      WHERE weeks.id = chore_completions.week_id
        AND weeks.household_id = auth.uid()
    )
  );

CREATE POLICY "chore_completions: owner insert"
  ON chore_completions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM weeks
      WHERE weeks.id = chore_completions.week_id
        AND weeks.household_id = auth.uid()
    )
  );

CREATE POLICY "chore_completions: owner delete"
  ON chore_completions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM weeks
      WHERE weeks.id = chore_completions.week_id
        AND weeks.household_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS completions_week_id_idx ON chore_completions(week_id);
CREATE INDEX IF NOT EXISTS completions_chore_id_idx ON chore_completions(chore_id);

-- ============================================================
-- STREAKS
-- One row per household. Updated whenever all chores for a day
-- are completed. Created automatically via trigger below.
-- ============================================================
CREATE TABLE IF NOT EXISTS streaks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     UUID NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  current_streak   SMALLINT NOT NULL DEFAULT 0,
  longest_streak   SMALLINT NOT NULL DEFAULT 0,
  last_streak_date DATE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streaks: owner full access"
  ON streaks FOR ALL
  USING (auth.uid() = household_id)
  WITH CHECK (auth.uid() = household_id);

-- ============================================================
-- PUSH SUBSCRIPTIONS
-- Stores Web Push subscription objects per household.
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: owner full access"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = household_id)
  WITH CHECK (auth.uid() = household_id);

CREATE INDEX IF NOT EXISTS push_subs_household_idx ON push_subscriptions(household_id);

-- ============================================================
-- TRIGGER: auto-create household + streak rows on signup
-- When a new auth user is created, insert into households and
-- streaks so the app works immediately after registration.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.households (id, name, timezone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'household_name', 'My Household'),
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'America/Los_Angeles')
  );

  INSERT INTO public.streaks (household_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- Drop trigger if it already exists so this migration is re-runnable
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

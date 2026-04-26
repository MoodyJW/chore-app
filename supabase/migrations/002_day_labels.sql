-- ============================================================
-- Migration 002 — Day Labels
-- Adds a per-household label for each day section
-- (e.g. Monday = "Bathrooms", Tuesday = "Bedrooms")
-- Run in Supabase SQL Editor after migration 001.
-- ============================================================

CREATE TABLE IF NOT EXISTS day_labels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  day_of_week   TEXT NOT NULL CHECK (day_of_week IN (
                  'daily','sunday','monday','tuesday',
                  'wednesday','thursday','friday','saturday'
                )),
  label         TEXT NOT NULL DEFAULT '',
  UNIQUE (household_id, day_of_week)
);

ALTER TABLE day_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "day_labels: owner full access"
  ON day_labels FOR ALL
  USING  (auth.uid() = household_id)
  WITH CHECK (auth.uid() = household_id);

CREATE INDEX IF NOT EXISTS day_labels_household_idx ON day_labels(household_id);

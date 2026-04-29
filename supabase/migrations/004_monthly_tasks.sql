-- ============================================================
-- Migration 004 — Monthly Tasks
-- ============================================================

-- 1. Update the check constraint on tasks to allow 'monthly'
ALTER TABLE IF EXISTS tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_check;
ALTER TABLE IF EXISTS tasks DROP CONSTRAINT IF EXISTS chores_recurrence_check;

ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_check CHECK (recurrence IN (
  'daily','sunday','monday','tuesday','wednesday','thursday','friday','saturday','monthly'
));

-- 2. Create monthly_task_completions table
CREATE TABLE IF NOT EXISTS monthly_task_completions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  month_string   TEXT NOT NULL, -- e.g. '2026-04'
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, month_string)
);

-- 3. Setup RLS for monthly_task_completions
ALTER TABLE monthly_task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_task_completions: owner read"
  ON monthly_task_completions FOR SELECT
  USING (auth.uid() = household_id);

CREATE POLICY "monthly_task_completions: owner insert"
  ON monthly_task_completions FOR INSERT
  WITH CHECK (auth.uid() = household_id);

CREATE POLICY "monthly_task_completions: owner delete"
  ON monthly_task_completions FOR DELETE
  USING (auth.uid() = household_id);

-- 4. Create Indexes for performance
CREATE INDEX IF NOT EXISTS monthly_completions_household_idx ON monthly_task_completions(household_id);
CREATE INDEX IF NOT EXISTS monthly_completions_task_idx ON monthly_task_completions(task_id);

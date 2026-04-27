-- ============================================================
-- Migration 003 — Rename Chores to Tasks
-- ============================================================

-- 1. Rename tables
ALTER TABLE IF EXISTS chores RENAME TO tasks;
ALTER TABLE IF EXISTS chore_completions RENAME TO task_completions;

-- 2. Rename columns
ALTER TABLE IF EXISTS task_completions RENAME COLUMN chore_id TO task_id;

-- 3. Rename Indexes
ALTER INDEX IF EXISTS chores_pkey RENAME TO tasks_pkey;
ALTER INDEX IF EXISTS chores_household_id_idx RENAME TO tasks_household_id_idx;
ALTER INDEX IF EXISTS chores_recurrence_idx RENAME TO tasks_recurrence_idx;
ALTER INDEX IF EXISTS chore_completions_pkey RENAME TO task_completions_pkey;
ALTER INDEX IF EXISTS completions_week_id_idx RENAME TO task_completions_week_id_idx;
ALTER INDEX IF EXISTS completions_chore_id_idx RENAME TO task_completions_task_id_idx;
-- Also rename the unique constraint index on task_completions if it was automatically named
ALTER INDEX IF EXISTS chore_completions_chore_id_week_id_day_of_week_key RENAME TO task_completions_task_id_week_id_day_of_week_key;

-- 4. Drop old policies and create new ones with updated names
DROP POLICY IF EXISTS "chores: owner full access" ON tasks;
CREATE POLICY "tasks: owner full access"
  ON tasks FOR ALL
  USING (auth.uid() = household_id)
  WITH CHECK (auth.uid() = household_id);

DROP POLICY IF EXISTS "chore_completions: owner read" ON task_completions;
CREATE POLICY "task_completions: owner read"
  ON task_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM weeks
      WHERE weeks.id = task_completions.week_id
        AND weeks.household_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chore_completions: owner insert" ON task_completions;
CREATE POLICY "task_completions: owner insert"
  ON task_completions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM weeks
      WHERE weeks.id = task_completions.week_id
        AND weeks.household_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chore_completions: owner delete" ON task_completions;
CREATE POLICY "task_completions: owner delete"
  ON task_completions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM weeks
      WHERE weeks.id = task_completions.week_id
        AND weeks.household_id = auth.uid()
    )
  );

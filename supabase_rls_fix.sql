-- ============================================================
-- RLS FIX — Run this in Supabase SQL Editor
-- This fixes the 500 error on task creation and all inserts
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "allow_all_users" ON users;
DROP POLICY IF EXISTS "allow_all_tasks" ON tasks;
DROP POLICY IF EXISTS "allow_all_sessions" ON work_sessions;
DROP POLICY IF EXISTS "allow_all_activity" ON task_activity;
DROP POLICY IF EXISTS "allow_all_chat" ON chat_messages;

-- Recreate with both USING and WITH CHECK so INSERT works too
CREATE POLICY "allow_all_users" ON users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_tasks" ON tasks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_sessions" ON work_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_activity" ON task_activity
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_chat" ON chat_messages
  FOR ALL USING (true) WITH CHECK (true);

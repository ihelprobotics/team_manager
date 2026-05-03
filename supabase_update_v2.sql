-- ============================================================
-- TaskFlow Schema Update v2
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add heartbeat columns to work_sessions
ALTER TABLE work_sessions 
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_type TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS idle_minutes INTEGER DEFAULT 0;

-- Add is_self_created flag to tasks
-- so manager can see which tasks employees created themselves
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_self_created BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' 
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Index for fast heartbeat queries
CREATE INDEX IF NOT EXISTS idx_sessions_heartbeat ON work_sessions(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_tasks_approval ON tasks(approval_status);

-- ============================================================
-- TaskFlow — Supabase Schema
-- Paste this entire file into Supabase SQL Editor and Run
-- ============================================================

-- Users (employees + managers)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'manager')),
  avatar_initials TEXT,
  avatar_color TEXT DEFAULT '#378ADD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  helper_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'To Do' CHECK (status IN ('To Do','In Progress','Done','Blocked')),
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  tag TEXT,
  notes TEXT,
  due_date DATE,
  attention_needed BOOLEAN DEFAULT FALSE,
  attention_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Work sessions (clock in/out)
CREATE TABLE IF NOT EXISTS work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  notes TEXT
);

-- Task audit log
CREATE TABLE IF NOT EXISTS task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat history per employee
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  task_updates JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies (service role key bypasses these from API routes)
DROP POLICY IF EXISTS "allow_all_users" ON users;
DROP POLICY IF EXISTS "allow_all_tasks" ON tasks;
DROP POLICY IF EXISTS "allow_all_sessions" ON work_sessions;
DROP POLICY IF EXISTS "allow_all_activity" ON task_activity;
DROP POLICY IF EXISTS "allow_all_chat" ON chat_messages;

CREATE POLICY "allow_all_users" ON users FOR ALL USING (TRUE);
CREATE POLICY "allow_all_tasks" ON tasks FOR ALL USING (TRUE);
CREATE POLICY "allow_all_sessions" ON work_sessions FOR ALL USING (TRUE);
CREATE POLICY "allow_all_activity" ON task_activity FOR ALL USING (TRUE);
CREATE POLICY "allow_all_chat" ON chat_messages FOR ALL USING (TRUE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_helper ON tasks(helper_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON work_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id);

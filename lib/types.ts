export type Role = 'employee' | 'manager'
export type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Blocked'
export type TaskPriority = 'Low' | 'Medium' | 'High'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  avatar_initials: string
  avatar_color: string
  created_at: string
}

export interface Task {
  id: string
  title: string
  description?: string
  assignee_id?: string
  helper_id?: string
  created_by?: string
  status: TaskStatus
  priority: TaskPriority
  progress: number
  tag?: string
  notes?: string
  due_date?: string
  attention_needed: boolean
  attention_reason?: string
  created_at: string
  updated_at: string
  // Joined
  assignee?: User
  helper?: User
}

export interface WorkSession {
  id: string
  user_id: string
  started_at: string
  ended_at?: string
  duration_seconds?: number
  notes?: string
}

export interface TaskActivity {
  id: string
  task_id: string
  user_id?: string
  action: string
  old_value?: string
  new_value?: string
  created_at: string
  user?: User
}

export interface ChatMessage {
  id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  task_updates?: TaskUpdate[]
  created_at: string
}

export interface TaskUpdate {
  taskId: string
  taskTitle: string
  newStatus: TaskStatus
  newProgress: number
  notes: string
  statusChange?: { from: TaskStatus; to: TaskStatus }
  progressChange?: { from: number; to: number }
}

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  avatar_initials: string
  avatar_color: string
}

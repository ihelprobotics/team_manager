import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const range = url.searchParams.get('range') || '7' // days

  const since = new Date()
  since.setDate(since.getDate() - parseInt(range))

  const [tasksR, sessionsR, activityR] = await Promise.all([
    db.from('tasks').select(`*, assignee:assignee_id(id,name,avatar_initials,avatar_color)`),
    db.from('work_sessions').select(`*, user:user_id(id,name,avatar_initials,avatar_color)`).gte('started_at', since.toISOString()),
    db.from('task_activity').select(`*, user:user_id(name), task:task_id(title)`).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(100),
  ])

  const tasks = tasksR.data || []
  const sessions = sessionsR.data || []

  // Per-employee stats
  const employeeMap: Record<string, { name: string; avatar_initials: string; avatar_color: string; totalSeconds: number; tasksDone: number; tasksTotal: number; sessions: number }> = {}

  for (const s of sessions) {
    const u = s.user as { id: string; name: string; avatar_initials: string; avatar_color: string } | null
    if (!u) continue
    if (!employeeMap[u.id]) employeeMap[u.id] = { name: u.name, avatar_initials: u.avatar_initials, avatar_color: u.avatar_color, totalSeconds: 0, tasksDone: 0, tasksTotal: 0, sessions: 0 }
    employeeMap[u.id].totalSeconds += (s.duration_seconds as number) || 0
    employeeMap[u.id].sessions++
  }

  for (const t of tasks) {
    const aid = t.assignee_id as string
    if (!aid) continue
    if (!employeeMap[aid]) {
      const a = t.assignee as { id: string; name: string; avatar_initials: string; avatar_color: string } | null
      if (!a) continue
      employeeMap[aid] = { name: a.name, avatar_initials: a.avatar_initials, avatar_color: a.avatar_color, totalSeconds: 0, tasksDone: 0, tasksTotal: 0, sessions: 0 }
    }
    employeeMap[aid].tasksTotal++
    if (t.status === 'Done') employeeMap[aid].tasksDone++
  }

  return NextResponse.json({
    summary: {
      totalTasks: tasks.length,
      doneTasks: tasks.filter((t) => t.status === 'Done').length,
      blockedTasks: tasks.filter((t) => t.status === 'Blocked').length,
      attentionTasks: tasks.filter((t) => t.attention_needed).length,
      totalWorkSeconds: sessions.reduce((s: number, r: { duration_seconds?: number }) => s + (r.duration_seconds || 0), 0),
    },
    employeeStats: Object.entries(employeeMap).map(([id, stats]) => ({ id, ...stats })),
    activity: activityR.data || [],
  })
}

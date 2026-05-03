import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const employeeId = url.searchParams.get('employee_id')
  if (!employeeId) return NextResponse.json({ error: 'employee_id required' }, { status: 400 })

  const [tasksR, sessionsR, activityR, chatR] = await Promise.all([
    db.from('tasks').select('*').or(`assignee_id.eq.${employeeId},helper_id.eq.${employeeId}`),
    db.from('work_sessions').select('*').eq('user_id', employeeId).order('started_at', { ascending: false }).limit(90),
    db.from('task_activity').select('*, task:task_id(title)').eq('user_id', employeeId).order('created_at', { ascending: false }).limit(200),
    db.from('chat_messages').select('content,created_at').eq('user_id', employeeId).eq('role', 'user').order('created_at', { ascending: false }).limit(50),
  ])

  const tasks = tasksR.data || []
  const sessions = sessionsR.data || []
  const activity = activityR.data || []
  const chats = chatR.data || []

  // Calendar: group sessions by date
  type SessionRow = { started_at: string; ended_at?: string; duration_seconds?: number; last_activity_type?: string }
  const calendarMap: Record<string, { date: string; totalSeconds: number; sessionCount: number; clockIn: string; clockOut?: string; idle: boolean }> = {}

  for (const s of sessions as SessionRow[]) {
    const date = s.started_at.slice(0, 10)
    if (!calendarMap[date]) {
      calendarMap[date] = { date, totalSeconds: 0, sessionCount: 0, clockIn: s.started_at, idle: false }
    }
    calendarMap[date].totalSeconds += s.duration_seconds || 0
    calendarMap[date].sessionCount++
    if (s.ended_at) calendarMap[date].clockOut = s.ended_at
    if (s.last_activity_type === 'idle') calendarMap[date].idle = true
  }

  // Task stats
  const assigned = tasks.filter((t) => t.assignee_id === employeeId)
  const taskStats = {
    total: assigned.length,
    done: assigned.filter((t) => t.status === 'Done').length,
    inProgress: assigned.filter((t) => t.status === 'In Progress').length,
    blocked: assigned.filter((t) => t.status === 'Blocked').length,
    todo: assigned.filter((t) => t.status === 'To Do').length,
    completionRate: assigned.length ? Math.round(assigned.filter((t) => t.status === 'Done').length / assigned.length * 100) : 0,
    avgProgress: assigned.length ? Math.round(assigned.reduce((s: number, t) => s + (t.progress as number), 0) / assigned.length) : 0,
  }

  // Activity timeline (what they worked on each day)
  type ActivityRow = { created_at: string; action: string; old_value?: string; new_value?: string; task?: { title: string } }
  const activityByDay: Record<string, { date: string; events: { time: string; action: string; task?: string; detail?: string }[] }> = {}
  for (const a of activity as ActivityRow[]) {
    const date = a.created_at.slice(0, 10)
    if (!activityByDay[date]) activityByDay[date] = { date, events: [] }
    activityByDay[date].events.push({
      time: a.created_at,
      action: a.action,
      task: (a.task as { title?: string } | null)?.title,
      detail: a.new_value,
    })
  }

  // Work pattern analysis
  const last30Days = Object.values(calendarMap).filter(d => {
    const diffDays = (Date.now() - new Date(d.date).getTime()) / 86400000
    return diffDays <= 30
  })
  const workDays = last30Days.length
  const totalWorkSeconds = last30Days.reduce((s, d) => s + d.totalSeconds, 0)
  const avgHoursPerDay = workDays > 0 ? (totalWorkSeconds / workDays / 3600).toFixed(1) : '0'
  const idleDays = last30Days.filter(d => d.idle).length

  // Recent chat summaries (what employees are saying)
  const recentChats = chats.slice(0, 10).map((c: { content: string; created_at: string }) => ({
    message: c.content.slice(0, 120),
    date: c.created_at,
  }))

  return NextResponse.json({
    taskStats,
    calendar: Object.values(calendarMap).sort((a, b) => b.date.localeCompare(a.date)),
    activityTimeline: Object.values(activityByDay).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    workPattern: { workDays, avgHoursPerDay, totalWorkSeconds, idleDays },
    recentChats,
    tasks: assigned,
  })
}

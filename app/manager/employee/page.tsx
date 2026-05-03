'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface User { id: string; name: string; avatar_initials: string; avatar_color: string; email: string }
interface Task { id: string; title: string; status: string; priority: string; progress: number; notes?: string; tag?: string; updated_at: string; attention_needed: boolean }
interface CalendarDay { date: string; totalSeconds: number; sessionCount: number; clockIn: string; clockOut?: string; idle: boolean }
interface ActivityEvent { time: string; action: string; task?: string; detail?: string }
interface ActivityDay { date: string; events: ActivityEvent[] }

function fmtSecs(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
function actionLabel(a: string) {
  const map: Record<string, string> = {
    status_changed: 'Updated status',
    progress_updated: 'Updated progress',
    attention_flagged: 'Flagged attention',
    created: 'Task created',
    helper_assigned: 'Helper assigned',
    task_approved: 'Task approved',
    task_rejected: 'Task rejected',
  }
  return map[a] || a.replace(/_/g, ' ')
}

function Avatar({ initials, color, size = 32 }: { initials: string; color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: size * 0.34, background: color + '22', color, fontSize: size * 0.36, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}44`, flexShrink: 0 }}>{initials}</div>
}

function CalendarGrid({ calendar }: { calendar: CalendarDay[] }) {
  const [month, setMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })

  const calMap: Record<string, CalendarDay> = {}
  calendar.forEach(d => { calMap[d.date] = d })

  const firstDay = new Date(month.year, month.month, 1)
  const lastDay = new Date(month.year, month.month + 1, 0)
  const startPad = firstDay.getDay()
  const days: (CalendarDay | null)[] = Array(startPad).fill(null)

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push(calMap[dateStr] || null)
  }

  const monthName = firstDay.toLocaleDateString([], { month: 'long', year: 'numeric' })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button onClick={() => setMonth(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })}
          style={{ background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontFamily: "'DM Sans',sans-serif" }}>←</button>
        <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{monthName}</span>
        <button onClick={() => setMonth(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })}
          style={{ background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontFamily: "'DM Sans',sans-serif" }}>→</button>
      </div>

      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', marginBottom: '4px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px' }}>
        {days.map((day, i) => {
          const dayNum = i - startPad + 1
          if (!day && dayNum < 1) return <div key={i} />

          const isToday = day?.date === new Date().toISOString().slice(0, 10)
          const hasWork = day && day.totalSeconds > 0
          const intensity = day ? Math.min(day.totalSeconds / 28800, 1) : 0 // 8h = full

          return (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: '8px', padding: '4px',
              background: hasWork ? `rgba(108,99,255,${0.15 + intensity * 0.55})` : 'var(--bg4)',
              border: `1px solid ${isToday ? 'var(--accent)' : hasWork ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: hasWork ? 'pointer' : 'default',
              transition: 'all 0.15s',
              position: 'relative',
            }}
              title={day ? `${fmtDate(day.date)}: ${fmtSecs(day.totalSeconds)} worked${day.clockIn ? ` · In: ${fmtTime(day.clockIn)}` : ''}${day.clockOut ? ` · Out: ${fmtTime(day.clockOut)}` : ''}${day.idle ? ' · ⚠ idle detected' : ''}` : ''}>
              <span style={{ fontSize: '12px', fontWeight: isToday ? '700' : '500', color: hasWork ? 'rgba(255,255,255,0.9)' : 'var(--text3)' }}>{dayNum}</span>
              {hasWork && <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', marginTop: '1px' }}>{fmtSecs(day.totalSeconds)}</span>}
              {day?.idle && <div style={{ position: 'absolute', top: '2px', right: '3px', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--amber)' }} title="Idle detected" />}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
        {[
          { color: 'rgba(108,99,255,0.2)', label: '< 2h' },
          { color: 'rgba(108,99,255,0.45)', label: '2–4h' },
          { color: 'rgba(108,99,255,0.65)', label: '4–6h' },
          { color: 'rgba(108,99,255,0.85)', label: '6h+' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.color, border: '1px solid rgba(108,99,255,0.3)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{l.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Idle detected</span>
        </div>
      </div>
    </div>
  )
}

function AnalyticsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const employeeId = searchParams.get('id')

  const [employee, setEmployee] = useState<User | null>(null)
  const [analytics, setAnalytics] = useState<{
    taskStats: { total: number; done: number; inProgress: number; blocked: number; todo: number; completionRate: number; avgProgress: number }
    calendar: CalendarDay[]
    activityTimeline: ActivityDay[]
    workPattern: { workDays: number; avgHoursPerDay: string; totalWorkSeconds: number; idleDays: number }
    recentChats: { message: string; date: string }[]
    tasks: Task[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'activity' | 'calendar'>('overview')

  const load = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    const [empR, analyticsR] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch(`/api/analytics?employee_id=${employeeId}`).then(r => r.json()),
    ])
    const emp = (empR.users || []).find((u: User) => u.id === employeeId)
    setEmployee(emp || null)
    if (!analyticsR.error) setAnalytics(analyticsR)
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user || d.user.role !== 'manager') { router.push('/admin'); return }
    })
    load()
  }, [router, load])

  if (!employeeId) { router.push('/manager'); return null }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '32px', height: '32px', border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="animate-spin-slow" />
    </div>
  )

  const { taskStats, calendar, activityTimeline, workPattern, recentChats, tasks } = analytics || {}

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif" }}>

      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.push('/manager')}
            style={{ background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: "'DM Sans',sans-serif" }}>
            ← Back
          </button>
          {employee && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Avatar initials={employee.avatar_initials} color={employee.avatar_color} size={32} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{employee.name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{employee.email}</p>
              </div>
            </div>
          )}
          <nav style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
            {(['overview', 'tasks', 'activity', 'calendar'] as const).map(t => (
              <button key={t} className={`nav-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
            ))}
          </nav>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Employee Analytics</span>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 24px' }}>

        {/* OVERVIEW */}
        {activeTab === 'overview' && taskStats && workPattern && (
          <div className="fade-up">
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '28px' }}>
              {[
                { label: 'Completion Rate', value: `${taskStats.completionRate}%`, sub: `${taskStats.done} of ${taskStats.total} tasks`, color: taskStats.completionRate >= 70 ? 'var(--green)' : taskStats.completionRate >= 40 ? 'var(--amber)' : 'var(--red)' },
                { label: 'Avg Progress', value: `${taskStats.avgProgress}%`, sub: 'across all tasks', color: 'var(--accent)' },
                { label: 'Days Worked', value: workPattern.workDays, sub: 'last 30 days', color: 'var(--blue)' },
                { label: 'Avg Hours/Day', value: `${workPattern.avgHoursPerDay}h`, sub: `${workPattern.idleDays} idle day${workPattern.idleDays !== 1 ? 's' : ''}`, color: 'var(--text)', mono: true },
              ].map((s, i) => (
                <div key={i} className="stat-card">
                  <p style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>{s.label}</p>
                  <p style={{ fontSize: '28px', fontWeight: '600', color: s.color, letterSpacing: '-0.5px', fontFamily: s.mono ? "'DM Mono',monospace" : undefined }}>{s.value}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>{s.sub}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {/* Task breakdown donut-style */}
              <div className="card" style={{ padding: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Task Breakdown</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'Done', count: taskStats.done, color: 'var(--green)', bg: 'var(--green-bg)' },
                    { label: 'In Progress', count: taskStats.inProgress, color: 'var(--blue)', bg: 'var(--blue-bg)' },
                    { label: 'To Do', count: taskStats.todo, color: 'var(--text2)', bg: 'var(--bg4)' },
                    { label: 'Blocked', count: taskStats.blocked, color: 'var(--red)', bg: 'var(--red-bg)' },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text2)', width: '80px', flexShrink: 0 }}>{s.label}</span>
                      <div style={{ flex: 1, height: '8px', background: 'var(--bg4)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${taskStats.total ? (s.count / taskStats.total * 100) : 0}%`, background: s.color, borderRadius: '4px', transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: s.color, width: '20px', textAlign: 'right', fontFamily: "'DM Mono',monospace" }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent employee chat updates */}
              <div className="card" style={{ padding: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Recent Chat Updates</p>
                {!recentChats?.length ? <p style={{ fontSize: '13px', color: 'var(--text3)' }}>No chat activity yet</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                    {recentChats.map((c, i) => (
                      <div key={i} style={{ background: 'var(--bg4)', borderRadius: '10px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.5', marginBottom: '4px' }}>"{c.message}{c.message.length >= 120 ? '…' : ''}"</p>
                        <p style={{ fontSize: '10px', color: 'var(--text3)' }}>{new Date(c.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Mini calendar preview */}
            <div className="card" style={{ padding: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Work Calendar</p>
              <CalendarGrid calendar={calendar || []} />
            </div>
          </div>
        )}

        {/* TASKS TAB */}
        {activeTab === 'tasks' && (
          <div className="fade-up">
            <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>All Tasks ({tasks?.length || 0})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(tasks || []).map(t => (
                <div key={t.id} className="card" style={{ padding: '16px 20px', borderLeft: `3px solid ${t.status === 'Done' ? 'var(--green)' : t.status === 'In Progress' ? 'var(--blue)' : t.status === 'Blocked' ? 'var(--red)' : 'var(--text3)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{t.title}</span>
                        {t.attention_needed && <span style={{ fontSize: '10px', background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.25)', padding: '2px 7px', borderRadius: '20px' }}>⚠ Needs attention</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <span className={`badge ${t.status === 'Done' ? 'badge-done' : t.status === 'In Progress' ? 'badge-inprogress' : t.status === 'Blocked' ? 'badge-blocked' : 'badge-todo'}`}>{t.status}</span>
                        <span className={`badge badge-${t.priority.toLowerCase()}`}>{t.priority}</span>
                        {t.tag && <span style={{ fontSize: '11px', color: 'var(--text3)', background: 'var(--bg4)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '20px' }}>{t.tag}</span>}
                      </div>
                      {t.notes && <p style={{ fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic' }}>Latest: "{t.notes}"</p>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: '20px', fontWeight: '600', color: t.progress === 100 ? 'var(--green)' : 'var(--text)', letterSpacing: '-0.5px', fontFamily: "'DM Mono',monospace" }}>{t.progress}%</p>
                      <div className="progress-track" style={{ width: '80px', marginTop: '4px' }}>
                        <div className="progress-fill" style={{ width: `${t.progress}%`, background: t.progress === 100 ? 'var(--green)' : undefined }} />
                      </div>
                      <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>Updated {new Date(t.updated_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="fade-up">
            <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Task Activity History</p>
            {!activityTimeline?.length ? (
              <div className="card" style={{ padding: '40px', textAlign: 'center' }}><p style={{ color: 'var(--text3)' }}>No activity recorded yet</p></div>
            ) : activityTimeline.map(day => (
              <div key={day.date} style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ height: '1px', flex: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDate(day.date)}</span>
                  <div style={{ height: '1px', flex: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {day.events.map((e, i) => (
                    <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '11px', fontFamily: "'DM Mono',monospace", color: 'var(--text3)', flexShrink: 0 }}>{fmtTime(e.time)}</span>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: e.action === 'status_changed' ? 'var(--blue)' : e.action === 'progress_updated' ? 'var(--green)' : e.action === 'attention_flagged' ? 'var(--amber)' : 'var(--text3)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: '500' }}>{actionLabel(e.action)}</span>
                        {e.task && <span style={{ fontSize: '12px', color: 'var(--text3)' }}> on "{e.task}"</span>}
                        {e.detail && <span style={{ fontSize: '12px', color: 'var(--accent)' }}> → {e.detail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CALENDAR TAB */}
        {activeTab === 'calendar' && (
          <div className="fade-up">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
              <div className="card" style={{ padding: '24px' }}>
                <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '20px' }}>Work Calendar — Hover over days for details</p>
                <CalendarGrid calendar={calendar || []} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Work pattern */}
                <div className="card" style={{ padding: '20px' }}>
                  <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Work Pattern (Last 30 Days)</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {[
                      { label: 'Days Worked', value: workPattern?.workDays || 0, color: 'var(--accent)' },
                      { label: 'Total Hours', value: fmtSecs(workPattern?.totalWorkSeconds || 0), color: 'var(--blue)', mono: true },
                      { label: 'Avg Per Day', value: `${workPattern?.avgHoursPerDay || 0}h`, color: 'var(--green)', mono: true },
                      { label: 'Idle Detections', value: workPattern?.idleDays || 0, color: (workPattern?.idleDays || 0) > 3 ? 'var(--red)' : 'var(--text2)' },
                    ].map(s => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text3)' }}>{s.label}</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: s.color, fontFamily: s.mono ? "'DM Mono',monospace" : undefined }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent sessions list */}
                <div className="card" style={{ padding: '20px' }}>
                  <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>Recent Sessions</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                    {(calendar || []).slice(0, 14).map(d => (
                      <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg4)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text)' }}>{fmtDate(d.date)}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            {d.clockIn ? fmtTime(d.clockIn) : '--'} → {d.clockOut ? fmtTime(d.clockOut) : 'active'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent)', fontFamily: "'DM Mono',monospace" }}>{fmtSecs(d.totalSeconds)}</p>
                          {d.idle && <p style={{ fontSize: '9px', color: 'var(--amber)' }}>idle detected</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function EmployeeAnalyticsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '32px', height: '32px', border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="animate-spin-slow" /></div>}>
      <AnalyticsContent />
    </Suspense>
  )
}

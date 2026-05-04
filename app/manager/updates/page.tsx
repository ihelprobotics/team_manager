'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Bullet {
  text: string
  task_title: string | null
  action: string
  timestamp: string
}
interface Summary {
  id: string
  user_id: string
  date: string
  bullet_points: Bullet[]
  last_updated: string
  user: { id: string; name: string; avatar_initials: string; avatar_color: string }
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function actionColor(action: string) {
  if (action === 'Done') return 'var(--green)'
  if (action === 'Blocked') return 'var(--red)'
  if (action === 'In Progress') return 'var(--blue)'
  if (action === 'attention_flagged') return 'var(--amber)'
  return 'var(--text3)'
}
function actionDot(action: string) {
  if (action === 'Done') return '✓'
  if (action === 'Blocked') return '⚠'
  if (action === 'In Progress') return '▶'
  return '•'
}

function Avatar({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.34, background: color + '22', color, fontSize: size * 0.36, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${color}44`, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

// Animated bullet that types itself in
function AnimatedBullet({ bullet, delay = 0, isNew = false }: { bullet: Bullet; delay?: number; isNew?: boolean }) {
  const [visible, setVisible] = useState(!isNew)
  useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => setVisible(true), delay)
      return () => clearTimeout(t)
    }
  }, [isNew, delay])

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(6px)', transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)' }}>
      <span style={{ fontSize: '14px', color: actionColor(bullet.action), flexShrink: 0, marginTop: '1px', fontWeight: '700', width: '16px', textAlign: 'center' }}>
        {actionDot(bullet.action)}
      </span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }}>{bullet.text}</p>
        {bullet.task_title && (
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>on: {bullet.task_title}</p>
        )}
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0, fontFamily: "'DM Mono',monospace", paddingTop: '2px' }}>
        {timeLabel(bullet.timestamp)}
      </span>
    </div>
  )
}

export default function TeamUpdatesPage() {
  const router = useRouter()
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newBulletIds, setNewBulletIds] = useState<Set<string>>(new Set())
  const prevBulletsRef = useRef<Record<string, number>>({})
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [viewMode, setViewMode] = useState<'by-person' | 'combined'>('combined')

  const load = useCallback(async (isPolling = false) => {
    try {
      const r = await fetch(`/api/summaries?date=${selectedDate}`)
      const d = await r.json()
      if (d.error) return

      const incoming: Summary[] = d.summaries || []

      if (isPolling) {
        // Detect new bullets
        const newIds = new Set<string>()
        incoming.forEach(s => {
          const prevCount = prevBulletsRef.current[s.user_id] || 0
          const currCount = s.bullet_points?.length || 0
          if (currCount > prevCount) {
            // Mark new bullets
            for (let i = prevCount; i < currCount; i++) {
              newIds.add(`${s.user_id}-${i}`)
            }
          }
        })
        if (newIds.size > 0) setNewBulletIds(prev => new Set([...prev, ...newIds]))
      }

      // Update prev counts
      incoming.forEach(s => {
        prevBulletsRef.current[s.user_id] = s.bullet_points?.length || 0
      })

      setSummaries(incoming)
      setAvailableDates(d.availableDates || [])
      setLastRefresh(new Date())
      if (!isPolling) setLoading(false)
    } catch { /* silent */ }
  }, [selectedDate])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user || d.user.role !== 'manager') { router.push('/admin') }
    })
  }, [router])

  useEffect(() => {
    setLoading(true)
    prevBulletsRef.current = {}
    setNewBulletIds(new Set())
    load(false)
  }, [selectedDate, load])

  // Poll every 15 seconds for new updates
  useEffect(() => {
    pollRef.current = setInterval(() => load(true), 15000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const isToday = selectedDate === today

  const totalBullets = summaries.reduce((n, s) => n + (s.bullet_points?.length || 0), 0)
  const activeEmployees = summaries.filter(s => s.bullet_points?.length > 0).length

  // Build combined timeline sorted by time
  const allBullets: (Bullet & { userName: string; userInitials: string; userColor: string; userId: string; idx: number })[] = []
  summaries.forEach(s => {
    (s.bullet_points || []).forEach((b, idx) => {
      allBullets.push({ ...b, userName: s.user?.name, userInitials: s.user?.avatar_initials, userColor: s.user?.avatar_color, userId: s.user_id, idx })
    })
  })
  allBullets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ width: '32px', height: '32px', border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="animate-spin-slow" />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif" }}>

      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.push('/manager')}
            style={{ background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: '6px' }}>
            ← Dashboard
          </button>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>Team Updates</h1>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {isToday ? 'Live · ' : ''}{new Date(selectedDate + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Live indicator */}
          {isToday && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--green-bg)', border: '1px solid rgba(34,211,160,0.25)', borderRadius: '8px', padding: '5px 12px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} className="animate-pulse-dot" />
              <span style={{ fontSize: '12px', color: 'var(--green)', fontWeight: '500' }}>Live · refreshes every 15s</span>
            </div>
          )}
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
            {(['combined', 'by-person'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", border: 'none', background: viewMode === v ? 'var(--bg3)' : 'transparent', color: viewMode === v ? 'var(--text)' : 'var(--text3)', transition: 'all 0.15s' }}>
                {v === 'combined' ? '⏱ Timeline' : '👤 By Person'}
              </button>
            ))}
          </div>
          {/* Date picker */}
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", cursor: 'pointer', outline: 'none' }}>
            <option value={today}>Today</option>
            {availableDates.filter(d => d !== today).map(d => (
              <option key={d} value={d}>{new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</option>
            ))}
          </select>
        </div>
      </div>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 24px' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '28px' }}>
          {[
            { label: 'Total Updates', value: totalBullets, sub: 'across all members', color: 'var(--accent)' },
            { label: 'Active Members', value: activeEmployees, sub: `of ${summaries.length || 0} employees`, color: 'var(--green)' },
            { label: 'Last Activity', value: summaries.length ? timeLabel(summaries[0].last_updated) : '--', sub: summaries[0]?.user?.name || 'no activity', color: 'var(--blue)', mono: true },
            { label: 'Refreshed', value: lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), sub: isToday ? 'auto-refreshing' : 'historical', color: 'var(--text2)', mono: true },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <p style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>{s.label}</p>
              <p style={{ fontSize: '22px', fontWeight: '600', color: s.color, letterSpacing: '-0.5px', fontFamily: s.mono ? "'DM Mono',monospace" : undefined }}>{s.value}</p>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {totalBullets === 0 && (
          <div className="card" style={{ padding: '64px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
            <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px' }}>
              {isToday ? 'No updates yet today' : 'No updates on this day'}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
              {isToday ? 'Updates appear here as employees send chat messages. This page refreshes automatically every 15 seconds.' : 'Team members had no chat activity on this day.'}
            </p>
          </div>
        )}

        {/* COMBINED TIMELINE VIEW */}
        {viewMode === 'combined' && totalBullets > 0 && (
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} className={isToday ? 'animate-pulse-dot' : ''} />
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>
                Team Activity Timeline — {new Date(selectedDate + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
            </div>
            <div style={{ padding: '8px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {allBullets.map((b, globalIdx) => {
                const bulletKey = `${b.userId}-${b.idx}`
                const isNew = newBulletIds.has(bulletKey)
                return (
                  <div key={`${b.userId}-${b.idx}-${b.timestamp}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)', opacity: 1 }}
                    className={isNew ? 'fade-up' : ''}>
                    {/* Timeline dot */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: actionColor(b.action), flexShrink: 0 }} />
                      {globalIdx < allBullets.length - 1 && <div style={{ width: '1px', height: '100%', minHeight: '24px', background: 'var(--border)', marginTop: '4px' }} />}
                    </div>
                    {/* Avatar */}
                    <Avatar initials={b.userInitials} color={b.userColor} size={28} />
                    {/* Content */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: b.userColor }}>{b.userName}</span>
                        {isNew && <span style={{ fontSize: '10px', background: 'var(--accent)', color: 'white', padding: '1px 6px', borderRadius: '10px', fontWeight: '600' }}>NEW</span>}
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }}>
                        <span style={{ color: actionColor(b.action), fontWeight: '600', marginRight: '6px' }}>{actionDot(b.action)}</span>
                        {b.text}
                      </p>
                      {b.task_title && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Task: {b.task_title}</p>}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0, fontFamily: "'DM Mono',monospace", paddingTop: '3px' }}>{timeLabel(b.timestamp)}</span>
                  </div>
                )
              })}
              {isToday && (
                <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ height: '1px', flex: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} className="animate-pulse-dot" />
                    Live — new updates appear here automatically
                  </span>
                  <div style={{ height: '1px', flex: 1, background: 'var(--border)' }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* BY-PERSON VIEW */}
        {viewMode === 'by-person' && totalBullets > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {summaries.map(s => {
              const bullets = s.bullet_points || []
              const lastAction = bullets.length ? bullets[bullets.length - 1] : null
              return (
                <div key={s.user_id} className="card" style={{ overflow: 'hidden' }}>
                  {/* Employee header */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--bg4)' }}>
                    <Avatar initials={s.user?.avatar_initials} color={s.user?.avatar_color} size={38} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '2px' }}>{s.user?.name}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {bullets.length} update{bullets.length !== 1 ? 's' : ''}
                        {lastAction && ` · last at ${timeLabel(lastAction.timestamp)}`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {/* Status dots */}
                      {['Done', 'In Progress', 'Blocked'].map(status => {
                        const count = bullets.filter(b => b.action === status).length
                        if (!count) return null
                        return (
                          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: actionColor(status) + '18', border: `1px solid ${actionColor(status)}33`, borderRadius: '20px', padding: '3px 10px' }}>
                            <span style={{ fontSize: '12px' }}>{actionDot(status)}</span>
                            <span style={{ fontSize: '11px', color: actionColor(status), fontWeight: '600' }}>{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Bullet points */}
                  <div style={{ padding: '4px 20px' }}>
                    {bullets.length === 0 ? (
                      <p style={{ fontSize: '13px', color: 'var(--text3)', padding: '14px 0' }}>No updates yet</p>
                    ) : (
                      bullets.map((b, idx) => {
                        const bulletKey = `${s.user_id}-${idx}`
                        const isNew = newBulletIds.has(bulletKey)
                        return <AnimatedBullet key={bulletKey} bullet={b} delay={isNew ? idx * 100 : 0} isNew={isNew} />
                      })
                    )}
                    {bullets.length > 0 && isToday && (
                      <div style={{ padding: '10px 0', fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--green)' }} className="animate-pulse-dot" />
                        Waiting for more updates…
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Employees with no updates yet */}
        {isToday && summaries.filter(s => !s.bullet_points?.length).length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>No updates yet today</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {summaries.filter(s => !s.bullet_points?.length).map(s => (
                <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 14px' }}>
                  <Avatar initials={s.user?.avatar_initials} color={s.user?.avatar_color} size={24} />
                  <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{s.user?.name}</span>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text3)' }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

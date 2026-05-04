'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Blocked'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'

interface User { id: string; name: string; avatar_initials: string; avatar_color: string; email: string }
interface Task {
  id: string; title: string; description?: string; status: TaskStatus
  priority: string; progress: number; notes?: string; tag?: string
  due_date?: string; attention_needed: boolean; attention_reason?: string
  assignee?: User; helper?: User; assignee_id?: string; helper_id?: string
  is_self_created?: boolean; approval_status?: ApprovalStatus
}
interface ChatMsg { role: 'user' | 'assistant'; content: string; updates?: TaskUpdate[] }
interface TaskUpdate { taskId: string; taskTitle: string; newStatus: TaskStatus; newProgress: number; notes: string; statusChange?: { from: TaskStatus; to: TaskStatus }; progressChange?: { from: number; to: number } }

// Timing constants
const CHECKIN_INTERVAL_MS = 30 * 60 * 1000  // mandatory check-in every 30 min
const IDLE_WARN_MS        = 5  * 60 * 1000  // warn after 5 min no real interaction
const IDLE_PAUSE_MS       = 10 * 60 * 1000  // pause timer after 10 min

// Activity scoring
const SCORE_CHAT_UPDATE   = 20  // typed a task update
const SCORE_TASK_INTERACT = 10  // clicked on a task
const SCORE_CHECKIN       = 15  // submitted check-in
const SCORE_IDLE_PENALTY  = -5  // per minute of idle

function formatSeconds(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
function Avatar({ initials, color, size = 32 }: { initials: string; color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: size * 0.34, background: color + '22', color, fontSize: size * 0.36, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}44`, flexShrink: 0 }}>{initials}</div>
}
function statusBadgeClass(s: TaskStatus) {
  return s === 'To Do' ? 'badge-todo' : s === 'In Progress' ? 'badge-inprogress' : s === 'Done' ? 'badge-done' : 'badge-blocked'
}

export default function EmployeeDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState<'dashboard' | 'chat' | 'my-tasks'>('dashboard')

  // Timer state
  const [timerSec, setTimerSec] = useState(0)
  const [totalToday, setTotalToday] = useState(0)
  const [timerOn, setTimerOn] = useState(false)
  const [idleWarn, setIdleWarn] = useState(false)
  const [idlePaused, setIdlePaused] = useState(false)

  // Activity tracking
  const [activityScore, setActivityScore] = useState(100)
  const lastRealActivityRef = useRef(Date.now()) // real activity = typing/clicking task/sending chat
  const lastMouseMoveRef = useRef(Date.now())    // mouse move doesn't count as real activity
  const activityScoreRef = useRef(100)

  // Check-in state
  const [showCheckin, setShowCheckin] = useState(false)
  const [checkinMsg, setCheckinMsg] = useState('')
  const [checkinTime, setCheckinTime] = useState(0) // seconds until next mandatory check-in
  const [checkinDue, setCheckinDue] = useState(false)
  const [lastCheckinAt, setLastCheckinAt] = useState<number | null>(null)
  const [checkinLoading, setCheckinLoading] = useState(false)

  // Chat state
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Task creation state
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'Medium', tag: '', due_date: '' })
  const [savingTask, setSavingTask] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  const msgsEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const idleRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const checkinRef = useRef<NodeJS.Timeout | null>(null)
  const historyRef = useRef<ChatMsg[]>([])

  // Record REAL activity (typing, clicking tasks, sending chat)
  const recordRealActivity = useCallback((points = 0) => {
    lastRealActivityRef.current = Date.now()
    lastMouseMoveRef.current = Date.now()
    setIdleWarn(false)
    if (idlePaused) setIdlePaused(false)
    if (points > 0) {
      const newScore = Math.min(100, activityScoreRef.current + points)
      activityScoreRef.current = newScore
      setActivityScore(newScore)
    }
  }, [idlePaused])

  // Mouse move only updates the mouse ref (not real activity)
  const handleMouseMove = useCallback(() => {
    lastMouseMoveRef.current = Date.now()
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) { router.push('/login'); return }
      setUser(d.user)
    })
  }, [router])

  const loadTasks = useCallback(async () => {
    const r = await fetch('/api/tasks')
    const d = await r.json()
    setTasks(d.tasks || [])
  }, [])

  const loadSession = useCallback(async () => {
    const r = await fetch('/api/sessions')
    const d = await r.json()
    setTotalToday(d.totalSeconds || 0)
    if (d.active) {
      setTimerSec(Math.floor((Date.now() - new Date(d.active.started_at).getTime()) / 1000))
      setTimerOn(true)
      // Schedule first check-in 30 min after session start
      setLastCheckinAt(new Date(d.active.started_at).getTime())
    }
  }, [])

  const loadChat = useCallback(async () => {
    const r = await fetch('/api/chat')
    const d = await r.json()
    if (d.messages?.length) {
      const msgs = d.messages.map((m: { role: 'user' | 'assistant'; content: string; task_updates?: TaskUpdate[] }) => ({
        role: m.role,
        content: m.content,
        updates: m.task_updates,
      }))
      setChatMsgs(msgs)
      historyRef.current = msgs
    }
  }, [])

  useEffect(() => { if (user) { loadTasks(); loadSession(); loadChat() } }, [user, loadTasks, loadSession, loadChat])

  // Main timer tick
  useEffect(() => {
    if (timerOn && !idlePaused) {
      timerRef.current = setInterval(() => setTimerSec(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerOn, idlePaused])

  // Check-in countdown ticker
  useEffect(() => {
    if (!timerOn || !lastCheckinAt) return
    const tick = setInterval(() => {
      const elapsed = Date.now() - lastCheckinAt
      const remaining = Math.max(0, CHECKIN_INTERVAL_MS - elapsed)
      setCheckinTime(Math.floor(remaining / 1000))
      if (remaining === 0) {
        setCheckinDue(true)
        setShowCheckin(true)
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [timerOn, lastCheckinAt])

  // Idle detection — only checks real activity, not mouse moves
  useEffect(() => {
    if (!timerOn) return
    idleRef.current = setInterval(() => {
      const realIdle = Date.now() - lastRealActivityRef.current
      const mouseIdle = Date.now() - lastMouseMoveRef.current

      // Score penalty for idle time
      if (realIdle > 5 * 60 * 1000) {
        const penalty = Math.floor(realIdle / 60000) * SCORE_IDLE_PENALTY
        const newScore = Math.max(0, activityScoreRef.current + penalty)
        activityScoreRef.current = newScore
        setActivityScore(newScore)
      }

      if (mouseIdle >= IDLE_PAUSE_MS) {
        setIdlePaused(true)
        setIdleWarn(false)
      } else if (realIdle >= IDLE_WARN_MS) {
        setIdleWarn(true)
      }
    }, 30000)
    return () => { if (idleRef.current) clearInterval(idleRef.current) }
  }, [timerOn])

  // Heartbeat every 2 min with activity score
  useEffect(() => {
    if (!timerOn) return
    heartbeatRef.current = setInterval(async () => {
      const realIdle = Date.now() - lastRealActivityRef.current
      const type = realIdle > IDLE_WARN_MS ? 'idle' : 'active'
      try {
        await fetch('/api/sessions/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_type: type }),
        })
      } catch { /* silent */ }
    }, 120000)
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [timerOn])

  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  async function toggleTimer() {
    if (!timerOn) {
      const r = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const d = await r.json()
      if (d.session) {
        setTimerSec(0); setTimerOn(true)
        setIdlePaused(false); setIdleWarn(false)
        setLastCheckinAt(Date.now())
        recordRealActivity()
      }
    } else {
      await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      setTotalToday(p => p + timerSec)
      setTimerOn(false); setIdlePaused(false); setIdleWarn(false)
      setCheckinDue(false); setShowCheckin(false); setTimerSec(0)
    }
  }

  async function resumeFromIdle() {
    recordRealActivity()
    setIdlePaused(false); setIdleWarn(false)
    await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) })
    const r = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) })
    const d = await r.json()
    if (d.session) {
      setTimerSec(0)
      setLastCheckinAt(Date.now())
      activityScoreRef.current = 70
      setActivityScore(70)
    }
  }

  async function submitCheckin() {
    if (!checkinMsg.trim()) return
    setCheckinLoading(true)
    recordRealActivity(SCORE_CHECKIN)

    await fetch('/api/sessions/checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: checkinMsg, activity_score: activityScoreRef.current }),
    })

    setCheckinMsg('')
    setShowCheckin(false)
    setCheckinDue(false)
    setLastCheckinAt(Date.now())
    setCheckinLoading(false)

    // Boost score for doing check-in
    activityScoreRef.current = Math.min(100, activityScoreRef.current + SCORE_CHECKIN)
    setActivityScore(activityScoreRef.current)
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const text = chatInput.trim(); setChatInput('')
    recordRealActivity(SCORE_CHAT_UPDATE)

    const userMsg: ChatMsg = { role: 'user', content: text }
    const newMsgs = [...historyRef.current, userMsg]
    setChatMsgs(newMsgs); historyRef.current = newMsgs; setChatLoading(true)

    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: historyRef.current.slice(-10) }),
    })
    const d = await r.json()
    const aiMsg: ChatMsg = { role: 'assistant', content: d.reply, updates: d.updates }
    const updated = [...historyRef.current, aiMsg]
    setChatMsgs(updated); historyRef.current = updated; setChatLoading(false)
    if (d.updates?.length) loadTasks()
  }

  async function createSelfTask() {
    if (!newTask.title.trim() || !user) return
    setSavingTask(true)
    recordRealActivity(SCORE_TASK_INTERACT)
    const r = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTask, assignee_id: user.id, is_self_created: true, approval_status: 'pending', status: 'To Do' }),
    })
    const d = await r.json()
    if (d.task) { setTasks(p => [d.task, ...p]); setShowNewTask(false); setNewTask({ title: '', description: '', priority: 'Medium', tag: '', due_date: '' }) }
    setSavingTask(false)
  }

  async function logout() {
    if (timerOn) await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) })
    await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login')
  }

  const myTasks = tasks.filter(t => t.assignee_id === user?.id)
  const helperTasks = tasks.filter(t => t.helper_id === user?.id && t.assignee_id !== user?.id)
  const selfTasks = myTasks.filter(t => t.is_self_created)
  const assignedTasks = myTasks.filter(t => !t.is_self_created)
  const pendingApproval = selfTasks.filter(t => t.approval_status === 'pending')
  const donePct = myTasks.length ? Math.round(myTasks.filter(t => t.status === 'Done').length / myTasks.length * 100) : 0

  const scoreColor = activityScore >= 70 ? 'var(--green)' : activityScore >= 40 ? 'var(--amber)' : 'var(--red)'
  const nextCheckinMins = Math.floor(checkinTime / 60)
  const nextCheckinSecs = checkinTime % 60

  if (!user) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '32px', height: '32px', border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} className="animate-spin-slow" />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif" }}
      onMouseMove={handleMouseMove}>

      {/* ─── MANDATORY CHECK-IN OVERLAY ─────────────────────────────── */}
      {showCheckin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg3)', border: '1px solid rgba(108,99,255,0.4)', borderRadius: '24px', padding: '40px', maxWidth: '480px', width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }} className="fade-up">
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg,var(--accent),#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px var(--accent-glow)', fontSize: '24px' }}>📋</div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px' }}>30-Minute Check-in</h2>
              <p style={{ fontSize: '14px', color: 'var(--text3)', lineHeight: '1.6' }}>
                Tell us what you&apos;ve been working on. <strong style={{ color: 'var(--text)' }}>You cannot dismiss this</strong> — your manager needs to know you&apos;re actively working.
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'block' }}>
                What have you worked on in the last 30 minutes? *
              </label>
              <textarea
                value={checkinMsg}
                onChange={e => setCheckinMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitCheckin() }}
                placeholder="e.g. Fixed the login bug, now testing edge cases. Currently 70% done with the auth module..."
                rows={4}
                autoFocus
                className="input-field"
                style={{ resize: 'none', width: '100%' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>Ctrl+Enter to submit</p>
            </div>

            {/* Activity score meter */}
            <div style={{ background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Your activity score this session</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: scoreColor, fontFamily: "'DM Mono',monospace" }}>{activityScore}/100</span>
              </div>
              <div className="progress-track">
                <div style={{ height: '100%', borderRadius: '4px', width: `${activityScore}%`, background: scoreColor, transition: 'width 0.5s' }} />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                Score is based on task updates, chat messages, and time without idle pauses
              </p>
            </div>

            <button
              onClick={submitCheckin}
              disabled={!checkinMsg.trim() || checkinLoading}
              style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '600', background: checkinMsg.trim() ? 'linear-gradient(135deg,var(--accent),#8b85ff)' : 'var(--bg4)', color: checkinMsg.trim() ? 'white' : 'var(--text3)', border: 'none', borderRadius: '12px', cursor: checkinMsg.trim() ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.2s', boxShadow: checkinMsg.trim() ? '0 8px 24px var(--accent-glow)' : 'none' }}>
              {checkinLoading ? 'Submitting…' : 'Submit Check-in ✓'}
            </button>
          </div>
        </div>
      )}

      {/* ─── IDLE PAUSED OVERLAY ────────────────────────────────────── */}
      {idlePaused && !showCheckin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg3)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '24px', padding: '40px', textAlign: 'center', maxWidth: '400px', width: '100%' }} className="fade-up">
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏸</div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text)', marginBottom: '10px' }}>Timer Paused — No Activity</h2>
            <p style={{ fontSize: '14px', color: 'var(--text3)', lineHeight: '1.6', marginBottom: '28px' }}>
              No mouse or keyboard activity detected for <strong style={{ color: 'var(--amber)' }}>10 minutes</strong>. Your timer has stopped and your manager can see this.
            </p>
            <button onClick={resumeFromIdle}
              style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '600', background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: '12px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              ▶ I&apos;m Back — Resume
            </button>
          </div>
        </div>
      )}

      {/* ─── IDLE WARNING TOAST ─────────────────────────────────────── */}
      {idleWarn && !idlePaused && !showCheckin && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'var(--bg3)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '14px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', minWidth: '360px' }} className="fade-up">
          <span className="animate-pulse-dot" style={{ fontSize: '18px' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--amber)' }}>Still working?</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>No real activity detected — only mouse movement doesn&apos;t count</p>
          </div>
          <button onClick={() => recordRealActivity(5)}
            style={{ background: 'var(--amber)', color: 'var(--bg)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap' }}>
            Yes, I&apos;m here
          </button>
        </div>
      )}

      {/* ─── TOPBAR ─────────────────────────────────────────────────── */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg,var(--accent),#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px var(--accent-glow)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <span style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text)', letterSpacing: '-0.3px' }}>TaskFlow</span>
          </div>
          <nav style={{ display: 'flex', gap: '4px' }}>
            <button className={`nav-tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
            <button className={`nav-tab ${tab === 'my-tasks' ? 'active' : ''}`} onClick={() => setTab('my-tasks')}>
              My Tasks
              {pendingApproval.length > 0 && <span style={{ marginLeft: '6px', background: 'var(--amber)', color: 'var(--bg)', fontSize: '10px', padding: '1px 5px', borderRadius: '10px', fontWeight: '700' }}>{pendingApproval.length}</span>}
            </button>
            <button className={`nav-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => { setTab('chat'); recordRealActivity() }}>Update via Chat</button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

          {/* Activity score pill */}
          {timerOn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg4)', border: `1px solid ${scoreColor}44`, borderRadius: '8px', padding: '5px 10px' }}
              title="Activity score: based on task updates, chat messages, check-ins">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: scoreColor }}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ fontSize: '12px', fontWeight: '600', color: scoreColor, fontFamily: "'DM Mono',monospace" }}>{activityScore}</span>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>score</span>
            </div>
          )}

          {/* Check-in countdown */}
          {timerOn && !checkinDue && lastCheckinAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg4)', border: `1px solid ${nextCheckinMins < 5 ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`, borderRadius: '8px', padding: '5px 10px' }}
              title="Next mandatory check-in — you must describe what you're working on">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: nextCheckinMins < 5 ? 'var(--amber)' : 'var(--text3)' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><polyline points="12,6 12,12 16,14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <span style={{ fontSize: '11px', color: nextCheckinMins < 5 ? 'var(--amber)' : 'var(--text3)', fontFamily: "'DM Mono',monospace" }}>
                {String(nextCheckinMins).padStart(2, '0')}:{String(nextCheckinSecs).padStart(2, '0')}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>check-in</span>
            </div>
          )}

          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg4)', border: `1px solid ${idlePaused ? 'rgba(244,63,94,0.4)' : idleWarn ? 'rgba(245,158,11,0.4)' : timerOn ? 'rgba(34,211,160,0.3)' : 'var(--border)'}`, borderRadius: '10px', padding: '7px 14px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: idlePaused ? 'var(--red)' : idleWarn ? 'var(--amber)' : timerOn ? 'var(--green)' : 'var(--text3)', flexShrink: 0 }} className={timerOn && !idlePaused ? 'animate-pulse-dot' : ''} />
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', color: idlePaused ? 'var(--red)' : timerOn ? 'var(--green)' : 'var(--text2)', letterSpacing: '0.05em' }}>
              {formatSeconds(timerSec)}
            </span>
            {idlePaused && <span style={{ fontSize: '10px', color: 'var(--red)', fontWeight: '600' }}>PAUSED</span>}
          </div>

          <button onClick={toggleTimer}
            style={timerOn
              ? { background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }
              : { background: 'var(--green)', color: 'var(--bg)', border: 'none', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
            {timerOn ? 'Clock Out' : '▶ Clock In'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Avatar initials={user.avatar_initials} color={user.avatar_color} size={30} />
            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{user.name}</span>
          </div>
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif" }}>Sign out</button>
        </div>
      </div>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 24px' }}>

        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '28px' }}>
              {[
                { label: 'Assigned Tasks', value: assignedTasks.length, sub: `${assignedTasks.filter(t => t.status === 'In Progress').length} active`, color: 'var(--accent)' },
                { label: 'Completed', value: myTasks.filter(t => t.status === 'Done').length, sub: `${donePct}% done`, color: 'var(--green)' },
                { label: 'Helping On', value: helperTasks.length, sub: 'as helper', color: 'var(--purple)' },
                { label: "Today's Time", value: formatSeconds(totalToday + (timerOn && !idlePaused ? timerSec : 0)), sub: timerOn ? (idlePaused ? '⏸ paused' : '🟢 active') : 'clocked out', color: idlePaused ? 'var(--red)' : timerOn ? 'var(--green)' : 'var(--text2)', mono: true },
              ].map((s, i) => (
                <div key={i} className="stat-card fade-up" style={{ animationDelay: `${i * 0.06}s` }}>
                  <p style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>{s.label}</p>
                  <p style={{ fontSize: '26px', fontWeight: '600', color: s.color, letterSpacing: '-0.5px', fontFamily: s.mono ? "'DM Mono',monospace" : undefined }}>{s.value}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Activity status bar */}
            {timerOn && (
              <div style={{ background: idlePaused ? 'rgba(244,63,94,0.06)' : 'rgba(34,211,160,0.04)', border: `1px solid ${idlePaused ? 'rgba(244,63,94,0.2)' : 'rgba(34,211,160,0.15)'}`, borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: idlePaused ? 'var(--red)' : 'var(--green)' }} className={!idlePaused ? 'animate-pulse-dot' : ''} />
                  <span style={{ fontSize: '13px', color: idlePaused ? 'var(--red)' : 'var(--green)', fontWeight: '500' }}>
                    {idlePaused ? 'Timer paused — no activity detected' : 'Session active'}
                  </span>
                </div>
                {/* Activity score bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Activity score</span>
                  <div style={{ width: '100px', height: '6px', background: 'var(--bg4)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${activityScore}%`, background: scoreColor, borderRadius: '4px', transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: scoreColor, fontFamily: "'DM Mono',monospace", minWidth: '30px' }}>{activityScore}</span>
                </div>
                {/* Next check-in */}
                {!checkinDue && lastCheckinAt && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Next check-in:</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: nextCheckinMins < 5 ? 'var(--amber)' : 'var(--text2)', fontFamily: "'DM Mono',monospace" }}>
                      {String(nextCheckinMins).padStart(2, '0')}:{String(nextCheckinSecs).padStart(2, '0')}
                    </span>
                  </div>
                )}
                <button onClick={() => setShowCheckin(true)}
                  style={{ background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                  Check in early
                </button>
              </div>
            )}

            {/* Helper tasks */}
            {helperTasks.length > 0 && (
              <div style={{ background: 'var(--purple-bg)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '16px', padding: '16px 20px', marginBottom: '24px' }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--purple)', marginBottom: '10px' }}>🤝 You&apos;re a helper on {helperTasks.length} task{helperTasks.length > 1 ? 's' : ''}</p>
                {helperTasks.map(t => (
                  <div key={t.id} style={{ background: 'var(--bg3)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)', flex: 1 }}>{t.title}</p>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>for {t.assignee?.name}</span>
                    <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tasks */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assigned Tasks</h2>
              <button className="btn-ghost" onClick={() => { setTab('chat'); recordRealActivity() }} style={{ fontSize: '12px', padding: '6px 12px' }}>Update via chat →</button>
            </div>
            {assignedTasks.length === 0 ? (
              <div className="card" style={{ padding: '40px', textAlign: 'center' }}><p style={{ color: 'var(--text3)', fontSize: '14px' }}>No tasks assigned yet</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {assignedTasks.map(t => (
                  <div key={t.id} className={`task-card ${expandedTask === t.id ? 'active' : ''}`}
                    onClick={() => { setExpandedTask(expandedTask === t.id ? null : t.id); recordRealActivity(SCORE_TASK_INTERACT) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: t.status === 'Done' ? 'var(--green)' : t.status === 'In Progress' ? 'var(--blue)' : t.status === 'Blocked' ? 'var(--red)' : 'var(--text3)' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          {t.attention_needed && <span style={{ fontSize: '11px', color: 'var(--amber)', background: 'var(--amber-bg)', border: '1px solid rgba(245,158,11,0.25)', padding: '2px 7px', borderRadius: '20px' }} className="animate-pulse-dot">⚠ Attention</span>}
                          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{t.title}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
                          {t.tag && <span style={{ fontSize: '11px', color: 'var(--text3)', background: 'var(--bg4)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: '20px' }}>{t.tag}</span>}
                          {t.helper && <span style={{ fontSize: '11px', color: 'var(--purple)' }}>Helper: {t.helper.name}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '13px', color: 'var(--text2)' }}>{t.progress}%</span>
                        <div className="progress-track" style={{ width: '80px', marginTop: '4px' }}><div className="progress-fill" style={{ width: `${t.progress}%` }} /></div>
                      </div>
                    </div>
                    {expandedTask === t.id && (
                      <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                        {t.notes && <div style={{ background: 'var(--bg4)', borderRadius: '10px', padding: '10px', marginBottom: '10px', fontSize: '13px', color: 'var(--text2)' }}>{t.notes}</div>}
                        <button onClick={() => { setTab('chat'); setChatInput(`Update on "${t.title}": `); recordRealActivity() }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '13px', fontFamily: "'DM Sans',sans-serif", padding: 0 }}>
                          Update this task via chat →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MY TASKS TAB */}
        {tab === 'my-tasks' && (
          <div className="fade-up">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>My Tasks</h2>
                <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Assigned to you + tasks you created</p>
              </div>
              <button className="btn-primary" onClick={() => { setShowNewTask(true); recordRealActivity() }} style={{ fontSize: '13px', padding: '9px 18px' }}>+ Create Task</button>
            </div>
            {pendingApproval.length > 0 && (
              <div style={{ background: 'var(--amber-bg)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="animate-pulse-dot" style={{ fontSize: '16px' }}>⏳</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--amber)' }}>{pendingApproval.length} task{pendingApproval.length > 1 ? 's' : ''} awaiting manager approval</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Your manager will review these shortly</p>
                </div>
              </div>
            )}
            {assignedTasks.length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Assigned by Manager</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {assignedTasks.map(t => (
                    <div key={t.id} className="task-card" onClick={() => { setExpandedTask(expandedTask === t.id ? null : t.id); recordRealActivity(SCORE_TASK_INTERACT) }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: t.status === 'Done' ? 'var(--green)' : t.status === 'In Progress' ? 'var(--blue)' : t.status === 'Blocked' ? 'var(--red)' : 'var(--text3)' }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>{t.title}</p>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
                            {t.tag && <span style={{ fontSize: '11px', color: 'var(--text3)', background: 'var(--bg4)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: '20px' }}>{t.tag}</span>}
                          </div>
                        </div>
                        <div className="progress-track" style={{ width: '80px' }}><div className="progress-fill" style={{ width: `${t.progress}%` }} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Created by Me</p>
                <button className="btn-ghost" onClick={() => { setShowNewTask(true); recordRealActivity() }} style={{ fontSize: '12px', padding: '5px 12px' }}>+ Add</button>
              </div>
              {selfTasks.length === 0 ? (
                <div style={{ background: 'var(--bg3)', border: '1px dashed var(--border2)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: 'var(--text3)', marginBottom: '12px' }}>No self-created tasks yet</p>
                  <button className="btn-primary" onClick={() => setShowNewTask(true)}>Create your first task</button>
                </div>
              ) : selfTasks.map(t => (
                <div key={t.id} className="task-card" style={{ marginBottom: '8px', borderColor: t.approval_status === 'pending' ? 'rgba(245,158,11,0.3)' : t.approval_status === 'rejected' ? 'rgba(244,63,94,0.3)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)', flex: 1 }}>{t.title}</span>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600', background: t.approval_status === 'pending' ? 'var(--amber-bg)' : t.approval_status === 'rejected' ? 'var(--red-bg)' : 'var(--green-bg)', color: t.approval_status === 'pending' ? 'var(--amber)' : t.approval_status === 'rejected' ? 'var(--red)' : 'var(--green)', border: `1px solid ${t.approval_status === 'pending' ? 'rgba(245,158,11,0.25)' : t.approval_status === 'rejected' ? 'rgba(244,63,94,0.25)' : 'rgba(34,211,160,0.25)'}` }}>
                      {t.approval_status === 'pending' ? '⏳ Awaiting approval' : t.approval_status === 'rejected' ? '✕ Rejected' : '✓ Approved'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CHAT TAB */}
        {tab === 'chat' && (
          <div className="fade-up" style={{ maxWidth: '680px', margin: '0 auto' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', minHeight: '520px' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'linear-gradient(135deg,var(--accent),#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>Task Update Chat</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Typing here counts toward your activity score</p>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {chatMsgs.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '6px' }}>Hi {user.name}!</p>
                    <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>Describe your progress — dashboard auto-updates</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '360px', margin: '0 auto' }}>
                      {[`"Finished the login redesign, it's done"`, `"70% done with API bug, blocked on token refresh"`, `"Completed test suite, all tests passing"`].map(ex => (
                        <button key={ex} onClick={() => { setChatInput(ex.replace(/"/g, '')); recordRealActivity() }}
                          style={{ background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: 'var(--text2)', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif" }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMsgs.filter(m => !m.content.startsWith('[CHECK-IN]')).map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
                    {msg.role === 'user'
                      ? <Avatar initials={user.avatar_initials} color={user.avatar_color} size={28} />
                      : <div style={{ width: '28px', height: '28px', borderRadius: '10px', background: 'linear-gradient(135deg,var(--accent),#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white' }}>AI</div>
                    }
                    <div className={msg.role === 'user' ? 'msg-user' : 'msg-ai'}>
                      {msg.content}
                      {msg.updates && msg.updates.length > 0 && (
                        <div className="update-card">
                          <p style={{ fontSize: '10px', color: 'var(--green)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>✓ Dashboard updated</p>
                          {msg.updates.map((u, j) => (
                            <div key={j} style={{ paddingBottom: '6px', marginBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                              <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px' }}>{u.taskTitle}</p>
                              {u.statusChange && <p style={{ fontSize: '11px', color: 'var(--text3)' }}>Status: {u.statusChange.from} → <span style={{ color: 'var(--green)' }}>{u.statusChange.to}</span></p>}
                              {u.progressChange && <p style={{ fontSize: '11px', color: 'var(--text3)' }}>Progress: {u.progressChange.from}% → <span style={{ color: 'var(--accent)' }}>{u.progressChange.to}%</span></p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '10px', background: 'linear-gradient(135deg,var(--accent),#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white' }}>AI</div>
                    <div className="msg-ai" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>{[0, 1, 2].map(i => <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text3)', animationDelay: `${i * 0.15}s` }} className="animate-bounce-dot" />)}</div>
                    </div>
                  </div>
                )}
                <div ref={msgsEndRef} />
              </div>
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <textarea value={chatInput} onChange={e => { setChatInput(e.target.value); recordRealActivity() }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder="What did you work on? Any blockers?" rows={2}
                  className="input-field" style={{ flex: 1, resize: 'none', maxHeight: '120px' }} />
                <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} className="btn-primary" style={{ flexShrink: 0, padding: '11px 18px', alignSelf: 'flex-end' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><polygon points="22,2 15,22 11,13 2,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CREATE TASK MODAL */}
      {showNewTask && (
        <div className="modal-overlay" onClick={() => setShowNewTask(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-glow)', border: '1px solid rgba(108,99,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✏️</div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>Create a Task</h3>
                <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Manager will review and approve it</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Title *</label>
                <input className="input-field" value={newTask.title} onChange={e => setNewTask(f => ({ ...f, title: e.target.value }))} placeholder="What do you need to work on?" />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Description</label>
                <textarea className="input-field" rows={3} style={{ resize: 'none' }} value={newTask.description} onChange={e => setNewTask(f => ({ ...f, description: e.target.value }))} placeholder="Why is this needed? What does done look like?" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Priority</label>
                  <select className="input-field" style={{ appearance: 'none' } as React.CSSProperties} value={newTask.priority} onChange={e => setNewTask(f => ({ ...f, priority: e.target.value }))}>
                    {['Low', 'Medium', 'High'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Category</label>
                  <input className="input-field" value={newTask.tag} onChange={e => setNewTask(f => ({ ...f, tag: e.target.value }))} placeholder="Frontend, QA…" />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Due Date</label>
                  <input type="date" className="input-field" value={newTask.due_date} onChange={e => setNewTask(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div style={{ background: 'var(--amber-bg)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '10px 14px', marginTop: '16px', fontSize: '12px', color: 'var(--amber)' }}>
              ⏳ Appears as Pending until your manager approves it
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn-ghost" onClick={() => setShowNewTask(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="btn-primary" onClick={createSelfTask} disabled={savingTask || !newTask.title.trim()} style={{ flex: 2 }}>
                {savingTask ? 'Submitting…' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

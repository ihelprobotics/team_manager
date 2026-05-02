'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Blocked'

interface User {
  id: string; name: string; avatar_initials: string; avatar_color: string
}
interface Task {
  id: string; title: string; description?: string; status: TaskStatus
  priority: string; progress: number; notes?: string; tag?: string
  due_date?: string; attention_needed: boolean; attention_reason?: string
  assignee?: User; helper?: User; assignee_id?: string; helper_id?: string
}
interface Session { id: string; name: string; avatar_initials: string; avatar_color: string; email: string }
interface WorkSession { id: string; started_at: string; ended_at?: string; duration_seconds?: number }
interface ChatMsg { role: 'user' | 'assistant'; content: string; updates?: TaskUpdate[] }
interface TaskUpdate {
  taskId: string; taskTitle: string; newStatus: TaskStatus; newProgress: number
  notes: string; statusChange?: { from: TaskStatus; to: TaskStatus }; progressChange?: { from: number; to: number }
}

function formatSeconds(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const map = {
    'To Do': 'bg-gray-100 text-gray-600',
    'In Progress': 'bg-blue-100 text-blue-700',
    'Done': 'bg-green-100 text-green-700',
    'Blocked': 'bg-red-100 text-red-700',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>{status}</span>
}

function PriorityDot({ p }: { p: string }) {
  const c = p === 'High' ? 'bg-red-500' : p === 'Medium' ? 'bg-amber-500' : 'bg-green-500'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${c}`} />
}

export default function EmployeeDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<Session | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat'>('dashboard')
  const [workSession, setWorkSession] = useState<WorkSession | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [totalToday, setTotalToday] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chatHistoryRef = useRef<ChatMsg[]>([])

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
      setWorkSession(d.active)
      const elapsed = Math.floor((Date.now() - new Date(d.active.started_at).getTime()) / 1000)
      setTimerSeconds(elapsed)
      setTimerRunning(true)
    }
  }, [])

  const loadChat = useCallback(async () => {
    const r = await fetch('/api/chat')
    const d = await r.json()
    if (d.messages?.length) {
      const msgs = d.messages.map((m: { role: 'user'|'assistant'; content: string; task_updates?: TaskUpdate[] }) => ({
        role: m.role, content: m.content, updates: m.task_updates
      }))
      setChatMessages(msgs)
      chatHistoryRef.current = msgs
    }
  }, [])

  useEffect(() => {
    if (user) { loadTasks(); loadSession(); loadChat() }
  }, [user, loadTasks, loadSession, loadChat])

  // Timer tick
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function toggleTimer() {
    if (!timerRunning) {
      const r = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) })
      const d = await r.json()
      setWorkSession(d.session)
      setTimerSeconds(0)
      setTimerRunning(true)
    } else {
      await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) })
      setTotalToday(p => p + timerSeconds)
      setWorkSession(null)
      setTimerRunning(false)
      setTimerSeconds(0)
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const text = chatInput.trim()
    setChatInput('')
    const userMsg: ChatMsg = { role: 'user', content: text }
    const newMsgs = [...chatHistoryRef.current, userMsg]
    setChatMessages(newMsgs)
    chatHistoryRef.current = newMsgs
    setChatLoading(true)

    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistoryRef.current.slice(-10) })
    })
    const d = await r.json()
    const aiMsg: ChatMsg = { role: 'assistant', content: d.reply, updates: d.updates }
    const updated = [...chatHistoryRef.current, aiMsg]
    setChatMessages(updated)
    chatHistoryRef.current = updated
    setChatLoading(false)
    if (d.updates?.length) loadTasks()
  }

  async function logout() {
    if (timerRunning) await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) })
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const myTasks = tasks.filter(t => t.assignee_id === user?.id)
  const helperTasks = tasks.filter(t => t.helper_id === user?.id && t.assignee_id !== user?.id)
  const attentionTasks = myTasks.filter(t => t.attention_needed)
  const completedPct = myTasks.length ? Math.round(myTasks.filter(t => t.status === 'Done').length / myTasks.length * 100) : 0

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-sm text-gray-500">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="font-semibold text-gray-900 text-sm">TaskFlow</span>
          </div>
          <nav className="flex gap-1">
            {(['dashboard', 'chat'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${activeTab === t ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {t === 'chat' ? 'Update via Chat' : 'My Tasks'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {/* Timer */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-mono ${timerRunning ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${timerRunning ? 'bg-green-500 animate-attention' : 'bg-gray-400'}`} />
            {formatSeconds(timerSeconds)}
          </div>
          <button onClick={toggleTimer}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${timerRunning ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
            {timerRunning ? 'Clock Out' : 'Clock In'}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ background: user.avatar_color }}>
              {user.avatar_initials}
            </div>
            <span className="text-sm text-gray-700">{user.name}</span>
          </div>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Sign out</button>
        </div>
      </header>

      {/* Attention banner */}
      {attentionTasks.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-amber-600"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            <span className="text-sm font-medium text-amber-800">
              {attentionTasks.length} task{attentionTasks.length > 1 ? 's' : ''} need attention
            </span>
          </div>
          <span className="text-sm text-amber-700">{attentionTasks.map(t => t.title).join(' · ')}</span>
        </div>
      )}

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">

        {activeTab === 'dashboard' && (
          <div className="space-y-6 slide-in">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'My Tasks', value: myTasks.length, sub: `${myTasks.filter(t=>t.status==='In Progress').length} active` },
                { label: 'Completed', value: myTasks.filter(t=>t.status==='Done').length, sub: `${completedPct}% done`, color: 'text-green-700' },
                { label: 'Helping On', value: helperTasks.length, sub: 'as helper', color: 'text-purple-700' },
                { label: 'Today', value: formatSeconds(totalToday + (timerRunning ? timerSeconds : 0)), sub: timerRunning ? 'clocked in' : 'total time', mono: true },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-2xl font-semibold ${s.color || 'text-gray-900'} ${s.mono ? 'font-mono' : ''}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Helper tasks banner */}
            {helperTasks.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-purple-600"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span className="text-sm font-semibold text-purple-800">You are assigned as a helper on these tasks</span>
                </div>
                <div className="grid gap-2">
                  {helperTasks.map(t => (
                    <div key={t.id} className="bg-white rounded-lg border border-purple-200 p-3 flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{t.title}</p>
                        <p className="text-xs text-gray-500">Assigned to: {t.assignee?.name || 'Unknown'} · <StatusBadge status={t.status} /></p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My tasks */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">My Tasks</h2>
              {myTasks.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <p className="text-gray-400 text-sm">No tasks assigned yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myTasks.map(t => (
                    <div key={t.id} onClick={() => setSelectedTask(selectedTask?.id === t.id ? null : t)}
                      className={`bg-white rounded-xl border cursor-pointer transition-all ${selectedTask?.id === t.id ? 'border-blue-300 shadow-sm' : 'border-gray-200 hover:border-gray-300'} ${t.attention_needed ? 'border-l-4 border-l-amber-400' : ''}`}>
                      <div className="p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {t.attention_needed && (
                              <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full animate-attention">
                                <span>⚠</span> Needs attention
                              </span>
                            )}
                            <span className="font-medium text-sm text-gray-900">{t.title}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <StatusBadge status={t.status} />
                            <PriorityDot p={t.priority} />
                            <span>{t.priority}</span>
                            {t.tag && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.tag}</span>}
                            {t.due_date && <span>Due {new Date(t.due_date).toLocaleDateString()}</span>}
                            {t.helper && <span className="text-purple-600">Helper: {t.helper.name}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{t.progress}%</p>
                            <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1">
                              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${t.progress}%` }} />
                            </div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`text-gray-300 transition-transform ${selectedTask?.id === t.id ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {selectedTask?.id === t.id && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50 rounded-b-xl">
                          {t.description && <p className="text-sm text-gray-700 mb-3">{t.description}</p>}
                          {t.notes && (
                            <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
                              <p className="text-xs text-gray-500 mb-1">Latest notes</p>
                              <p className="text-sm text-gray-800">{t.notes}</p>
                            </div>
                          )}
                          {t.attention_reason && (
                            <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 mb-3">
                              <p className="text-xs text-amber-600 mb-1">Attention reason</p>
                              <p className="text-sm text-amber-800">{t.attention_reason}</p>
                            </div>
                          )}
                          <button onClick={() => { setActiveTab('chat'); setChatInput(`Update on "${t.title}": `) }}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                            Update this task via chat →
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="slide-in max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '500px' }}>
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Task Update Chat</h2>
                <p className="text-xs text-gray-500 mt-0.5">Tell me what you worked on — I will update the dashboard automatically</p>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-blue-600"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Hi {user.name}!</p>
                    <p className="text-sm text-gray-500 mb-4">Tell me how your tasks are going. Try:</p>
                    <div className="space-y-2 text-left max-w-sm mx-auto">
                      {[`"I finished the login redesign"`, `"I'm 70% done with the API bug, blocked on token refresh"`, `"Completed the test suite setup"`].map(ex => (
                        <button key={ex} onClick={() => setChatInput(ex.replace(/"/g, ''))}
                          className="w-full text-left text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 transition-colors">
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5 ${msg.role === 'user' ? 'text-white' : 'bg-blue-100 text-blue-700'}`}
                      style={msg.role === 'user' ? { background: user.avatar_color } : {}}>
                      {msg.role === 'user' ? user.avatar_initials : 'AI'}
                    </div>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                      {msg.content}
                      {msg.updates && msg.updates.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5">
                          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Dashboard updated</p>
                          {msg.updates.map((u, j) => (
                            <div key={j} className="bg-white rounded-lg p-2 text-xs">
                              <p className="font-medium text-gray-800 mb-1">{u.taskTitle}</p>
                              {u.statusChange && <p className="text-gray-500">Status: <span className="text-gray-800">{u.statusChange.from} → {u.statusChange.to}</span></p>}
                              {u.progressChange && <p className="text-gray-500">Progress: <span className="text-gray-800">{u.progressChange.from}% → {u.progressChange.to}%</span></p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">AI</div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-gray-100 flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder="What did you work on? Any blockers?"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors self-end">
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Blocked'

interface User { id: string; name: string; avatar_initials: string; avatar_color: string; email: string }
interface Task {
  id: string; title: string; description?: string; status: TaskStatus
  priority: string; progress: number; notes?: string; tag?: string
  due_date?: string; attention_needed: boolean; attention_reason?: string
  assignee_id?: string; helper_id?: string; assignee?: User; helper?: User
  updated_at: string; created_at: string
}
interface Activity { id: string; action: string; old_value?: string; new_value?: string; created_at: string; user?: User; task?: { title: string } }
interface WorkInfo { active: { started_at: string } | null; totalSeconds: number }

function StatusBadge({ status }: { status: TaskStatus }) {
  const map = { 'To Do': 'bg-gray-100 text-gray-600', 'In Progress': 'bg-blue-100 text-blue-700', 'Done': 'bg-green-100 text-green-700', 'Blocked': 'bg-red-100 text-red-700' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>{status}</span>
}

function Avatar({ u, size = 'sm' }: { u: User; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return <div className={`${sz} rounded-full flex items-center justify-center font-medium text-white flex-shrink-0`} style={{ background: u.avatar_color }}>{u.avatar_initials}</div>
}

function formatSeconds(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins/60)}h ago`
  return `${Math.floor(mins/1440)}d ago`
}

export default function ManagerDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<'overview' | 'team' | 'tasks'>('overview')
  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<User[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [workInfos, setWorkInfos] = useState<Record<string, WorkInfo>>({})
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assignee_id: '', helper_id: '', priority: 'Medium', tag: '', due_date: '', status: 'To Do' as TaskStatus })
  const [empForm, setEmpForm] = useState({ name: '', email: '', password: '', avatar_color: '#378ADD' })
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [managerName, setManagerName] = useState('')

  const loadAll = useCallback(async () => {
    const [tasksR, usersR, actR] = await Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
      fetch('/api/activity').then(r => r.json()),
    ])
    setTasks(tasksR.tasks || [])
    setEmployees(usersR.users || [])
    setActivity(actR.activity || [])
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) { router.push('/login'); return }
      if (d.user.role !== 'manager') { router.push('/employee'); return }
      setManagerName(d.user.name)
    })
    loadAll()
    const interval = setInterval(loadAll, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [router, loadAll])

  useEffect(() => {
    employees.forEach(async emp => {
      const r = await fetch(`/api/sessions?user_id=${emp.id}`)
      const d = await r.json()
      setWorkInfos(prev => ({ ...prev, [emp.id]: { active: d.active, totalSeconds: d.totalSeconds } }))
    })
  }, [employees])

  async function createTask() {
    setSaving(true)
    const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskForm) })
    const d = await r.json()
    if (d.task) { setTasks(prev => [d.task, ...prev]); setShowAddTask(false); setTaskForm({ title: '', description: '', assignee_id: '', helper_id: '', priority: 'Medium', tag: '', due_date: '', status: 'To Do' }) }
    setSaving(false)
  }

  async function updateTask(id: string, patch: Partial<Task>) {
    const r = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const d = await r.json()
    if (d.task) setTasks(prev => prev.map(t => t.id === id ? d.task : t))
    return d.task
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
    if (editingTask?.id === id) setEditingTask(null)
  }

  async function createEmployee() {
    setSaving(true)
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empForm) })
    const d = await r.json()
    if (d.user) { setEmployees(prev => [...prev, d.user]); setShowAddEmployee(false); setEmpForm({ name: '', email: '', password: '', avatar_color: '#378ADD' }) }
    setSaving(false)
  }

  async function clearAttention(taskId: string) {
    await updateTask(taskId, { attention_needed: false, attention_reason: '' } as Partial<Task>)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const attentionTasks = tasks.filter(t => t.attention_needed)
  const totalDone = tasks.filter(t => t.status === 'Done').length
  const totalInProgress = tasks.filter(t => t.status === 'In Progress').length
  const totalBlocked = tasks.filter(t => t.status === 'Blocked').length
  const activeWorkers = Object.values(workInfos).filter(w => w.active).length

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
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Manager</span>
          </div>
          <nav className="flex gap-1">
            {(['overview', 'team', 'tasks'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {t}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowAddEmployee(true)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">+ Employee</button>
          <button onClick={() => setShowAddTask(true)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">+ Task</button>
          <span className="text-sm text-gray-600">{managerName}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600">Sign out</button>
        </div>
      </header>

      {/* Attention banner */}
      {attentionTasks.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2.5">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <span className="text-red-500 animate-attention">⚠</span>
              <span className="text-sm font-semibold text-red-800">{attentionTasks.length} task{attentionTasks.length > 1 ? 's' : ''} need your attention</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {attentionTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-1.5">
                  <span className="text-sm text-red-800 font-medium">{t.title}</span>
                  {t.assignee && <span className="text-xs text-gray-500">({t.assignee.name})</span>}
                  {t.attention_reason && <span className="text-xs text-red-600">— {t.attention_reason}</span>}
                  <button onClick={() => clearAttention(t.id)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-6 slide-in">
            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: 'Total Tasks', value: tasks.length, sub: 'all tasks' },
                { label: 'Done', value: totalDone, sub: `${tasks.length ? Math.round(totalDone/tasks.length*100) : 0}%`, color: 'text-green-700' },
                { label: 'In Progress', value: totalInProgress, sub: 'active', color: 'text-blue-700' },
                { label: 'Blocked', value: totalBlocked, sub: 'need help', color: totalBlocked > 0 ? 'text-red-600' : 'text-gray-400' },
                { label: 'Clocked In', value: activeWorkers, sub: `of ${employees.length} employees`, color: activeWorkers > 0 ? 'text-green-700' : 'text-gray-400' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-2xl font-semibold ${s.color || 'text-gray-900'}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Team status grid */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Team Status</h2>
              <div className="grid grid-cols-2 gap-4">
                {employees.map(emp => {
                  const empTasks = tasks.filter(t => t.assignee_id === emp.id)
                  const done = empTasks.filter(t => t.status === 'Done').length
                  const blocked = empTasks.filter(t => t.status === 'Blocked').length
                  const attention = empTasks.filter(t => t.attention_needed).length
                  const pct = empTasks.length ? Math.round(done / empTasks.length * 100) : 0
                  const wi = workInfos[emp.id]
                  const isClockedIn = !!wi?.active

                  return (
                    <div key={emp.id} onClick={() => { setSelectedEmployee(emp); setTab('team') }}
                      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300 transition-colors">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative">
                          <Avatar u={emp} size="md" />
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isClockedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-gray-900">{emp.name}</p>
                            {attention > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full animate-attention">⚠ {attention}</span>}
                          </div>
                          <p className="text-xs text-gray-500">{isClockedIn ? `Clocked in ${wi?.active ? `· ${formatSeconds(Math.floor((Date.now() - new Date(wi.active.started_at).getTime())/1000))}` : ''}` : 'Not clocked in'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">{pct}%</p>
                          <p className="text-xs text-gray-400">{done}/{empTasks.length}</p>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-2">
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {empTasks.filter(t => t.status !== 'Done').slice(0,3).map(t => (
                          <span key={t.id} className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'Blocked' ? 'bg-red-100 text-red-700' : t.attention_needed ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{t.title.length > 20 ? t.title.slice(0,20)+'…' : t.title}</span>
                        ))}
                        {blocked > 0 && <span className="text-xs text-red-600 font-medium">{blocked} blocked</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Activity feed */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h2>
              {activity.length === 0 ? <p className="text-sm text-gray-400">No activity yet</p> : (
                <div className="space-y-0">
                  {activity.slice(0,15).map(a => (
                    <div key={a.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      {a.user && <Avatar u={a.user} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">
                          <span className="font-medium">{a.user?.name || 'Someone'}</span>
                          {' '}{a.action.replace(/_/g,' ')}{' '}
                          {a.task && <span className="font-medium">"{a.task.title}"</span>}
                          {a.old_value && a.new_value && <span className="text-gray-500"> ({a.old_value} → {a.new_value})</span>}
                          {!a.old_value && a.new_value && <span className="text-gray-500">: {a.new_value}</span>}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TEAM TAB */}
        {tab === 'team' && (
          <div className="slide-in">
            <div className="grid grid-cols-4 gap-4 h-full">
              {/* Employee list */}
              <div className="col-span-1 space-y-2">
                {employees.map(emp => {
                  const wi = workInfos[emp.id]
                  const isClockedIn = !!wi?.active
                  const attention = tasks.filter(t => t.assignee_id === emp.id && t.attention_needed).length
                  return (
                    <div key={emp.id} onClick={() => setSelectedEmployee(emp)}
                      className={`bg-white rounded-xl border cursor-pointer p-3 flex items-center gap-3 transition-colors ${selectedEmployee?.id === emp.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="relative">
                        <Avatar u={emp} />
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${isClockedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{emp.name}</p>
                        <p className="text-xs text-gray-500">{isClockedIn ? 'Clocked in' : 'Offline'}</p>
                      </div>
                      {attention > 0 && <span className="text-xs bg-amber-100 text-amber-700 w-5 h-5 rounded-full flex items-center justify-center animate-attention">{attention}</span>}
                    </div>
                  )
                })}
              </div>

              {/* Employee detail */}
              <div className="col-span-3">
                {selectedEmployee ? (() => {
                  const emp = selectedEmployee
                  const empTasks = tasks.filter(t => t.assignee_id === emp.id)
                  const helperTasks = tasks.filter(t => t.helper_id === emp.id && t.assignee_id !== emp.id)
                  const wi = workInfos[emp.id]
                  const done = empTasks.filter(t => t.status === 'Done').length
                  const pct = empTasks.length ? Math.round(done/empTasks.length*100) : 0

                  return (
                    <div className="space-y-4">
                      {/* Employee header */}
                      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                        <Avatar u={emp} size="md" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{emp.name}</h3>
                          <p className="text-sm text-gray-500">{emp.email}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-center">
                            <p className="font-semibold text-gray-900">{empTasks.length}</p>
                            <p className="text-xs text-gray-500">Tasks</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-green-700">{pct}%</p>
                            <p className="text-xs text-gray-500">Done</p>
                          </div>
                          <div className="text-center">
                            <p className={`font-semibold ${wi?.active ? 'text-green-700' : 'text-gray-400'}`}>{wi?.active ? formatSeconds(Math.floor((Date.now()-new Date(wi.active.started_at).getTime())/1000)) : '--'}</p>
                            <p className="text-xs text-gray-500">Today</p>
                          </div>
                          <button onClick={async () => {
                            if (!confirm(`Remove ${emp.name}? Their tasks will remain.`)) return
                            await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: emp.id }) })
                            setEmployees(prev => prev.filter(e => e.id !== emp.id))
                            setSelectedEmployee(null)
                          }} className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-1 rounded-lg">Remove</button>
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="bg-white rounded-xl border border-gray-200">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-700">Assigned Tasks</h4>
                          <button onClick={() => { setTaskForm(f => ({ ...f, assignee_id: emp.id })); setShowAddTask(true) }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Assign task</button>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {empTasks.length === 0 ? <p className="text-sm text-gray-400 p-4">No tasks assigned</p> : empTasks.map(t => (
                            <div key={t.id} className={`p-4 flex items-start gap-3 ${t.attention_needed ? 'bg-amber-50' : ''}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {t.attention_needed && <span className="text-xs text-amber-700 font-medium animate-attention">⚠ Attention needed</span>}
                                  <p className="text-sm font-medium text-gray-900">{t.title}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <StatusBadge status={t.status} />
                                  <span className="text-xs text-gray-500">{t.progress}%</span>
                                  {t.notes && <span className="text-xs text-gray-500 truncate max-w-xs">{t.notes}</span>}
                                  {t.attention_reason && <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{t.attention_reason}</span>}
                                </div>
                                <div className="w-full h-1 bg-gray-100 rounded-full mt-2">
                                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                                </div>
                              </div>
                              <div className="flex gap-2 flex-shrink-0">
                                {t.attention_needed && <button onClick={() => clearAttention(t.id)} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">Resolve</button>}
                                <button onClick={() => setEditingTask(t)} className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Edit</button>
                                <button onClick={() => deleteTask(t.id)} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {helperTasks.length > 0 && (
                        <div className="bg-white rounded-xl border border-purple-200 p-4">
                          <h4 className="text-sm font-semibold text-purple-700 mb-3">Helping on these tasks</h4>
                          {helperTasks.map(t => (
                            <div key={t.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                              <p className="text-sm flex-1">{t.title}</p>
                              <StatusBadge status={t.status} />
                              {t.assignee && <span className="text-xs text-gray-500">({t.assignee.name}'s task)</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })() : (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <p className="text-gray-400 text-sm">Select an employee to see their details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TASKS TAB */}
        {tab === 'tasks' && (
          <div className="slide-in space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(['All', 'To Do', 'In Progress', 'Done', 'Blocked'] as const).map(f => (
                  <button key={f} onClick={() => {}} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">{f}</button>
                ))}
              </div>
              <button onClick={() => setShowAddTask(true)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">+ New task</button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {(['To Do', 'In Progress', 'Done'] as TaskStatus[]).map(col => (
                <div key={col} className="bg-white rounded-xl border border-gray-200">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <StatusBadge status={col} />
                    <span className="text-xs text-gray-500">{tasks.filter(t => t.status === col).length}</span>
                  </div>
                  <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                    {tasks.filter(t => t.status === col).map(t => (
                      <div key={t.id} className={`rounded-lg border p-3 ${t.attention_needed ? 'border-amber-300 bg-amber-50' : 'border-gray-100 hover:border-gray-200'} transition-colors`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{t.title}</p>
                          {t.attention_needed && <span className="text-amber-500 animate-attention flex-shrink-0">⚠</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.assignee && <Avatar u={t.assignee} />}
                          <span className="text-xs text-gray-500">{t.assignee?.name}</span>
                          <span className="text-xs text-gray-400">{t.progress}%</span>
                        </div>
                        {t.helper && <p className="text-xs text-purple-600 mt-1">Helper: {t.helper.name}</p>}
                        {t.notes && <p className="text-xs text-gray-500 mt-1 truncate">{t.notes}</p>}
                        <div className="flex gap-1 mt-2">
                          <button onClick={() => setEditingTask(t)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <span className="text-gray-300 text-xs">·</span>
                          <button onClick={() => deleteTask(t.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Blocked tasks */}
            {tasks.filter(t => t.status === 'Blocked').length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-red-800 mb-3">Blocked Tasks</h3>
                {tasks.filter(t => t.status === 'Blocked').map(t => (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b border-red-100 last:border-0">
                    <p className="text-sm flex-1 text-red-900 font-medium">{t.title}</p>
                    {t.assignee && <span className="text-xs text-red-700">{t.assignee.name}</span>}
                    {t.notes && <span className="text-xs text-red-600">{t.notes}</span>}
                    <button onClick={() => setEditingTask(t)} className="text-xs px-2 py-1 border border-red-300 text-red-700 rounded-lg hover:bg-red-100">Assign helper</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ADD TASK MODAL */}
      {showAddTask && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6 shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-4">Create Task</h3>
            <div className="space-y-3">
              <input value={taskForm.title} onChange={e => setTaskForm(f => ({...f,title:e.target.value}))} placeholder="Task title *" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea value={taskForm.description} onChange={e => setTaskForm(f => ({...f,description:e.target.value}))} placeholder="Description (optional)" rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Assign to *</label>
                  <select value={taskForm.assignee_id} onChange={e => setTaskForm(f => ({...f,assignee_id:e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select employee</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Helper (optional)</label>
                  <select value={taskForm.helper_id} onChange={e => setTaskForm(f => ({...f,helper_id:e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">No helper</option>
                    {employees.filter(e => e.id !== taskForm.assignee_id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Priority</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm(f => ({...f,priority:e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {['Low','Medium','High'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Tag</label>
                  <input value={taskForm.tag} onChange={e => setTaskForm(f => ({...f,tag:e.target.value}))} placeholder="e.g. Frontend" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Due date</label>
                  <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({...f,due_date:e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddTask(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={createTask} disabled={saving || !taskForm.title || !taskForm.assignee_id} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                {saving ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TASK MODAL */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6 shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-1">Edit Task</h3>
            <p className="text-sm text-gray-500 mb-4">{editingTask.title}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Status</label>
                  <select value={editingTask.status} onChange={e => setEditingTask(t => t ? {...t, status: e.target.value as TaskStatus} : null)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {['To Do','In Progress','Done','Blocked'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Progress %</label>
                  <input type="number" min="0" max="100" value={editingTask.progress} onChange={e => setEditingTask(t => t ? {...t, progress: parseInt(e.target.value)||0} : null)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Assign helper</label>
                <select value={editingTask.helper_id || ''} onChange={e => setEditingTask(t => t ? {...t, helper_id: e.target.value} : null)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">No helper</option>
                  {employees.filter(e => e.id !== editingTask.assignee_id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea value={editingTask.notes || ''} onChange={e => setEditingTask(t => t ? {...t, notes: e.target.value} : null)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditingTask(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={async () => {
                if (!editingTask) return
                setSaving(true)
                await updateTask(editingTask.id, { status: editingTask.status, progress: editingTask.progress, notes: editingTask.notes, helper_id: editingTask.helper_id } as Partial<Task>)
                setEditingTask(null)
                setSaving(false)
              }} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD EMPLOYEE MODAL */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-sm p-6 shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-4">Add Employee</h3>
            <div className="space-y-3">
              <input value={empForm.name} onChange={e => setEmpForm(f => ({...f,name:e.target.value}))} placeholder="Full name *" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="email" value={empForm.email} onChange={e => setEmpForm(f => ({...f,email:e.target.value}))} placeholder="Email address *" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="password" value={empForm.password} onChange={e => setEmpForm(f => ({...f,password:e.target.value}))} placeholder="Password *" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Avatar color</label>
                <input type="color" value={empForm.avatar_color} onChange={e => setEmpForm(f => ({...f,avatar_color:e.target.value}))} className="w-full h-10 rounded-lg border border-gray-300 cursor-pointer" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddEmployee(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={createEmployee} disabled={saving || !empForm.name || !empForm.email || !empForm.password} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                {saving ? 'Adding...' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

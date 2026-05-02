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
  updated_at: string
}
interface Activity { id: string; action: string; old_value?: string; new_value?: string; created_at: string; user?: User; task?: { title: string } }
interface WorkInfo { active: { started_at: string } | null; totalSeconds: number }

function timeAgo(d: string) {
  const diff = Date.now()-new Date(d).getTime(), m = Math.floor(diff/60000)
  if (m<1) return 'just now'; if (m<60) return `${m}m ago`
  if (m<1440) return `${Math.floor(m/60)}h ago`; return `${Math.floor(m/1440)}d ago`
}
function fmtSecs(s: number) {
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60)
  return h>0?`${h}h ${m}m`:`${m}m`
}
function Avatar({ initials, color, size=32 }: { initials:string; color:string; size?:number }) {
  return <div style={{ width:size, height:size, borderRadius:size*0.34, background:color+'22', color, fontSize:size*0.36, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${color}44`, flexShrink:0, letterSpacing:'0.02em' }}>{initials}</div>
}
function StatusBadge({ s }: { s: TaskStatus }) {
  const cls = s==='To Do'?'badge-todo':s==='In Progress'?'badge-inprogress':s==='Done'?'badge-done':'badge-blocked'
  return <span className={`badge ${cls}`}>{s}</span>
}

const EMPTY_TASK = { title:'', description:'', assignee_id:'', helper_id:'', priority:'Medium', tag:'', due_date:'', status:'To Do' as TaskStatus }
const EMPTY_EMP = { name:'', email:'', password:'', avatar_color:'#6c63ff' }

export default function ManagerDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<'overview'|'team'|'tasks'|'reports'>('overview')
  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<User[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [workInfos, setWorkInfos] = useState<Record<string,WorkInfo>>({})
  const [selEmployee, setSelEmployee] = useState<User|null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddEmp, setShowAddEmp] = useState(false)
  const [taskForm, setTaskForm] = useState(EMPTY_TASK)
  const [empForm, setEmpForm] = useState(EMPTY_EMP)
  const [editingTask, setEditingTask] = useState<Task|null>(null)
  const [saving, setSaving] = useState(false)
  const [managerName, setManagerName] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')

  const loadAll = useCallback(async () => {
    const [tr,ur,ar] = await Promise.all([
      fetch('/api/tasks').then(r=>r.json()),
      fetch('/api/users').then(r=>r.json()),
      fetch('/api/activity').then(r=>r.json()),
    ])
    setTasks(tr.tasks||[]); setEmployees(ur.users||[]); setActivity(ar.activity||[])
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r=>r.json()).then(d => {
      if (!d.user) { router.push('/login'); return }
      if (d.user.role!=='manager') { router.push('/employee'); return }
      setManagerName(d.user.name)
    })
    loadAll()
    const iv = setInterval(loadAll, 30000)
    return () => clearInterval(iv)
  }, [router, loadAll])

  useEffect(() => {
    employees.forEach(async emp => {
      const r = await fetch(`/api/sessions?user_id=${emp.id}`)
      const d = await r.json()
      setWorkInfos(p => ({ ...p, [emp.id]:{ active:d.active, totalSeconds:d.totalSeconds } }))
    })
  }, [employees])

  async function createTask() {
    setSaving(true)
    const r = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(taskForm) })
    const d = await r.json()
    if (d.task) { setTasks(p=>[d.task,...p]); setShowAddTask(false); setTaskForm(EMPTY_TASK) }
    setSaving(false)
  }

  async function updateTask(id: string, patch: Partial<Task>) {
    const r = await fetch(`/api/tasks/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(patch) })
    const d = await r.json()
    if (d.task) setTasks(p=>p.map(t=>t.id===id?d.task:t))
    return d.task
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await fetch(`/api/tasks/${id}`, { method:'DELETE' })
    setTasks(p=>p.filter(t=>t.id!==id))
    if (editingTask?.id===id) setEditingTask(null)
  }

  async function createEmployee() {
    setSaving(true)
    const r = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(empForm) })
    const d = await r.json()
    if (d.user) { setEmployees(p=>[...p,d.user]); setShowAddEmp(false); setEmpForm(EMPTY_EMP) }
    setSaving(false)
  }

  async function removeEmployee(id: string, name: string) {
    if (!confirm(`Remove ${name}? Their tasks will remain.`)) return
    await fetch('/api/users', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) })
    setEmployees(p=>p.filter(e=>e.id!==id))
    if (selEmployee?.id===id) setSelEmployee(null)
  }

  const attention = tasks.filter(t=>t.attention_needed)
  const done = tasks.filter(t=>t.status==='Done').length
  const inProg = tasks.filter(t=>t.status==='In Progress').length
  const blocked = tasks.filter(t=>t.status==='Blocked').length
  const activeWorkers = Object.values(workInfos).filter(w=>w.active).length
  const filtered = statusFilter==='All' ? tasks : tasks.filter(t=>t.status===statusFilter)

  const inputStyle = { width:'100%', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px', fontSize:'14px', color:'var(--text)', fontFamily:"'DM Sans',sans-serif", outline:'none' }
  const labelStyle = { fontSize:'11px', fontWeight:500, color:'var(--text3)', textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:'6px', display:'block' }

  if (!managerName) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'32px', height:'32px', border:'2px solid var(--border2)', borderTopColor:'var(--accent)', borderRadius:'50%' }} className="animate-spin-slow" />
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Topbar */}
      <div className="topbar">
        <div style={{ display:'flex', alignItems:'center', gap:'24px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'10px', background:'linear-gradient(135deg,var(--accent),#8b85ff)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px var(--accent-glow)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontWeight:'600', fontSize:'15px', color:'var(--text)', letterSpacing:'-0.3px' }}>TaskFlow</span>
            <span style={{ fontSize:'11px', background:'var(--purple-bg)', color:'var(--purple)', border:'1px solid rgba(167,139,250,0.25)', padding:'2px 8px', borderRadius:'20px', fontWeight:'500' }}>Manager</span>
          </div>
          <nav style={{ display:'flex', gap:'4px' }}>
            {(['overview','team','tasks','reports'] as const).map(t => (
              <button key={t} className={`nav-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)} style={{ textTransform:'capitalize' }}>{t}</button>
            ))}
          </nav>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {attention.length>0 && <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'var(--red-bg)', border:'1px solid rgba(244,63,94,0.25)', borderRadius:'8px', padding:'5px 10px' }}>
            <span className="animate-pulse-dot" style={{ color:'var(--red)', fontSize:'12px' }}>⚠</span>
            <span style={{ fontSize:'12px', color:'var(--red)', fontWeight:'500' }}>{attention.length} alerts</span>
          </div>}
          <button className="btn-ghost" onClick={()=>setShowAddEmp(true)} style={{ fontSize:'13px', padding:'7px 14px' }}>+ Employee</button>
          <button className="btn-primary" onClick={()=>setShowAddTask(true)} style={{ fontSize:'13px', padding:'8px 16px' }}>+ Task</button>
          <div style={{ width:'1px', height:'20px', background:'var(--border)', margin:'0 4px' }} />
          <span style={{ fontSize:'13px', color:'var(--text3)' }}>{managerName}</span>
          <button onClick={async()=>{ await fetch('/api/auth/logout',{method:'POST'}); router.push('/login') }}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:'13px', fontFamily:"'DM Sans',sans-serif" }}>Sign out</button>
        </div>
      </div>

      {/* Attention banner */}
      {attention.length>0 && (
        <div style={{ padding:'12px 24px', background:'linear-gradient(135deg,rgba(244,63,94,0.06),rgba(244,63,94,0.02))', borderBottom:'1px solid rgba(244,63,94,0.15)' }}>
          <div style={{ maxWidth:'1400px', margin:'0 auto', display:'flex', alignItems:'flex-start', gap:'12px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--red)', flexShrink:0, paddingTop:'2px' }}>⚠ {attention.length} task{attention.length>1?'s':''} need attention</span>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {attention.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--bg3)', border:'1px solid rgba(244,63,94,0.2)', borderRadius:'8px', padding:'5px 10px' }}>
                  <span style={{ fontSize:'12px', color:'var(--red)', fontWeight:'500' }}>{t.title}</span>
                  {t.assignee && <span style={{ fontSize:'11px', color:'var(--text3)' }}>({t.assignee.name})</span>}
                  {t.attention_reason && <span style={{ fontSize:'11px', color:'rgba(244,63,94,0.7)' }}>— {t.attention_reason}</span>}
                  <button onClick={()=>updateTask(t.id,{attention_needed:false,attention_reason:''}as Partial<Task>)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:'13px', lineHeight:1, padding:0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main style={{ maxWidth:'1400px', margin:'0 auto', padding:'28px 24px' }}>

        {/* OVERVIEW */}
        {tab==='overview' && (
          <div className="fade-up">
            {/* Stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'14px', marginBottom:'28px' }}>
              {[
                { label:'Total Tasks', value:tasks.length, sub:'all tasks', color:'var(--text)' },
                { label:'Completed', value:done, sub:tasks.length?`${Math.round(done/tasks.length*100)}% rate`:'', color:'var(--green)' },
                { label:'In Progress', value:inProg, sub:'active work', color:'var(--blue)' },
                { label:'Blocked', value:blocked, sub:'need help', color:blocked>0?'var(--red)':'var(--text3)' },
                { label:'Clocked In Now', value:activeWorkers, sub:`of ${employees.length} employees`, color:activeWorkers>0?'var(--green)':'var(--text3)' },
              ].map((s,i) => (
                <div key={i} className="stat-card fade-up" style={{ animationDelay:`${i*0.06}s` }}>
                  <p style={{ fontSize:'11px', fontWeight:'500', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'12px' }}>{s.label}</p>
                  <p style={{ fontSize:'30px', fontWeight:'600', color:s.color, letterSpacing:'-1px' }}>{s.value}</p>
                  <p style={{ fontSize:'12px', color:'var(--text3)', marginTop:'4px' }}>{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Team grid */}
            <div style={{ marginBottom:'28px' }}>
              <h2 style={{ fontSize:'11px', fontWeight:'600', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'16px' }}>Team Status</h2>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'14px' }}>
                {employees.map(emp => {
                  const empTasks = tasks.filter(t=>t.assignee_id===emp.id)
                  const empDone = empTasks.filter(t=>t.status==='Done').length
                  const pct = empTasks.length ? Math.round(empDone/empTasks.length*100) : 0
                  const wi = workInfos[emp.id]
                  const attn = empTasks.filter(t=>t.attention_needed).length
                  const isClockedIn = !!wi?.active
                  const sessionTime = isClockedIn && wi?.active ? Math.floor((Date.now()-new Date(wi.active.started_at).getTime())/1000) : 0

                  return (
                    <div key={emp.id} className="card glass-hover" style={{ padding:'20px', cursor:'pointer' }}
                      onClick={()=>{ setSelEmployee(emp); setTab('team') }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
                        <div style={{ position:'relative' }}>
                          <Avatar initials={emp.avatar_initials} color={emp.avatar_color} size={40} />
                          <div style={{ position:'absolute', bottom:0, right:0, width:'10px', height:'10px', borderRadius:'50%', background:isClockedIn?'var(--green)':'var(--text3)', border:'2px solid var(--bg3)' }} className={isClockedIn?'animate-pulse-dot':''} />
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                            <p style={{ fontSize:'14px', fontWeight:'600', color:'var(--text)' }}>{emp.name}</p>
                            {attn>0 && <span style={{ fontSize:'10px', background:'var(--amber-bg)', color:'var(--amber)', border:'1px solid rgba(245,158,11,0.25)', padding:'1px 6px', borderRadius:'20px', fontWeight:'500' }} className="animate-pulse-dot">⚠ {attn}</span>}
                          </div>
                          <p style={{ fontSize:'12px', color:'var(--text3)', marginTop:'2px' }}>
                            {isClockedIn ? `🟢 Active · ${fmtSecs(sessionTime)}` : '⚫ Offline'}
                          </p>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <p style={{ fontSize:'20px', fontWeight:'600', color:pct===100?'var(--green)':'var(--text)', letterSpacing:'-0.5px' }}>{pct}%</p>
                          <p style={{ fontSize:'11px', color:'var(--text3)' }}>{empDone}/{empTasks.length} done</p>
                        </div>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width:`${pct}%`, background:pct===100?'var(--green)':'linear-gradient(90deg,var(--accent),var(--accent2))' }} />
                      </div>
                      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'12px' }}>
                        {empTasks.filter(t=>t.status!=='Done').slice(0,4).map(t => (
                          <span key={t.id} style={{ fontSize:'11px', color:t.status==='Blocked'?'var(--red)':t.attention_needed?'var(--amber)':'var(--text3)', background:t.status==='Blocked'?'var(--red-bg)':t.attention_needed?'var(--amber-bg)':'var(--bg4)', border:`1px solid ${t.status==='Blocked'?'rgba(244,63,94,0.2)':t.attention_needed?'rgba(245,158,11,0.2)':'var(--border)'}`, padding:'2px 8px', borderRadius:'20px' }}>
                            {t.title.length>22?t.title.slice(0,22)+'…':t.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Activity feed */}
            <div className="card" style={{ padding:'20px' }}>
              <h2 style={{ fontSize:'11px', fontWeight:'600', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'16px' }}>Recent Activity</h2>
              {activity.length===0 ? <p style={{ fontSize:'13px', color:'var(--text3)' }}>No activity yet</p> : (
                <div>
                  {activity.slice(0,15).map(a => (
                    <div key={a.id} style={{ display:'flex', alignItems:'flex-start', gap:'12px', padding:'10px 0', borderBottom:'1px solid var(--border)' }} className="last:border-0">
                      {a.user ? <Avatar initials={a.user.avatar_initials} color={a.user.avatar_color} size={28} /> : <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--bg4)', flexShrink:0 }} />}
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:'13px', color:'var(--text)', lineHeight:'1.5' }}>
                          <span style={{ fontWeight:'500' }}>{a.user?.name||'Someone'}</span>
                          {' '}<span style={{ color:'var(--text3)' }}>{a.action.replace(/_/g,' ')}</span>
                          {a.task && <> <span style={{ fontWeight:'500' }}>"{a.task.title}"</span></>}
                          {a.old_value && a.new_value && <span style={{ color:'var(--text3)' }}> ({a.old_value} → {a.new_value})</span>}
                          {!a.old_value && a.new_value && <span style={{ color:'var(--text3)' }}>: {a.new_value}</span>}
                        </p>
                      </div>
                      <span style={{ fontSize:'11px', color:'var(--text3)', flexShrink:0 }}>{timeAgo(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TEAM TAB */}
        {tab==='team' && (
          <div className="fade-up" style={{ display:'grid', gridTemplateColumns:'240px 1fr', gap:'20px' }}>
            {/* Sidebar */}
            <div className="card" style={{ padding:'12px', height:'fit-content', position:'sticky', top:'76px' }}>
              <p style={{ fontSize:'11px', fontWeight:'600', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'4px 8px', marginBottom:'8px' }}>Team Members</p>
              {employees.map(emp => {
                const wi = workInfos[emp.id]
                const isClockedIn = !!wi?.active
                const attn = tasks.filter(t=>t.assignee_id===emp.id&&t.attention_needed).length
                return (
                  <div key={emp.id} className={`member-row ${selEmployee?.id===emp.id?'active':''}`} onClick={()=>setSelEmployee(emp)}>
                    <div style={{ position:'relative' }}>
                      <Avatar initials={emp.avatar_initials} color={emp.avatar_color} size={32} />
                      <div className="online-dot" style={{ background:isClockedIn?'var(--green)':'var(--text3)' }} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:'13px', fontWeight:'500', color:'var(--text)', marginBottom:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emp.name}</p>
                      <p style={{ fontSize:'11px', color:'var(--text3)' }}>{isClockedIn?'Active':'Offline'}</p>
                    </div>
                    {attn>0 && <span style={{ width:'18px', height:'18px', borderRadius:'50%', background:'var(--amber)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:'var(--bg)', flexShrink:0 }}>{attn}</span>}
                  </div>
                )
              })}
            </div>

            {/* Detail panel */}
            <div>
              {selEmployee ? (() => {
                const emp = selEmployee
                const empTasks = tasks.filter(t=>t.assignee_id===emp.id)
                const helperOn = tasks.filter(t=>t.helper_id===emp.id&&t.assignee_id!==emp.id)
                const wi = workInfos[emp.id]
                const done = empTasks.filter(t=>t.status==='Done').length
                const pct = empTasks.length ? Math.round(done/empTasks.length*100) : 0

                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                    {/* Header */}
                    <div className="card" style={{ padding:'24px', display:'flex', alignItems:'center', gap:'16px' }}>
                      <Avatar initials={emp.avatar_initials} color={emp.avatar_color} size={52} />
                      <div style={{ flex:1 }}>
                        <h3 style={{ fontSize:'18px', fontWeight:'600', color:'var(--text)', letterSpacing:'-0.3px', marginBottom:'4px' }}>{emp.name}</h3>
                        <p style={{ fontSize:'13px', color:'var(--text3)' }}>{emp.email}</p>
                      </div>
                      <div style={{ display:'flex', gap:'20px', textAlign:'center' }}>
                        {[
                          { v:empTasks.length, l:'Tasks' },
                          { v:`${pct}%`, l:'Done', c:pct===100?'var(--green)':undefined },
                          { v:wi?.active?fmtSecs(Math.floor((Date.now()-new Date(wi.active.started_at).getTime())/1000)):'--', l:'Session', mono:true },
                        ].map((s,i) => (
                          <div key={i}>
                            <p style={{ fontSize:'20px', fontWeight:'600', color:s.c||'var(--text)', letterSpacing:'-0.5px', fontFamily:s.mono?"'DM Mono',monospace":undefined }}>{s.v}</p>
                            <p style={{ fontSize:'11px', color:'var(--text3)' }}>{s.l}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ display:'flex', gap:'8px' }}>
                        <button className="btn-primary" style={{ fontSize:'12px', padding:'7px 14px' }} onClick={()=>{ setTaskForm(f=>({...f,assignee_id:emp.id})); setShowAddTask(true) }}>+ Assign Task</button>
                        <button className="btn-ghost" style={{ fontSize:'12px', padding:'7px 14px', color:'var(--red)', borderColor:'rgba(244,63,94,0.3)' }} onClick={()=>removeEmployee(emp.id,emp.name)}>Remove</button>
                      </div>
                    </div>

                    {/* Tasks */}
                    <div className="card" style={{ overflow:'hidden' }}>
                      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <h4 style={{ fontSize:'13px', fontWeight:'600', color:'var(--text2)' }}>Assigned Tasks ({empTasks.length})</h4>
                      </div>
                      {empTasks.length===0 ? (
                        <p style={{ padding:'24px', fontSize:'13px', color:'var(--text3)' }}>No tasks assigned yet</p>
                      ) : (
                        <div>
                          {empTasks.map(t => (
                            <div key={t.id} style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', gap:'14px', background:t.attention_needed?'rgba(245,158,11,0.03)':undefined }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', flexWrap:'wrap' }}>
                                  {t.attention_needed && <span style={{ fontSize:'11px', color:'var(--amber)', background:'var(--amber-bg)', border:'1px solid rgba(245,158,11,0.25)', padding:'2px 8px', borderRadius:'20px', fontWeight:'500' }} className="animate-pulse-dot">⚠ Attention</span>}
                                  <span style={{ fontSize:'14px', fontWeight:'500', color:'var(--text)' }}>{t.title}</span>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'8px' }}>
                                  <StatusBadge s={t.status} />
                                  {t.helper && <span style={{ fontSize:'11px', color:'var(--purple)' }}>Helper: {t.helper.name}</span>}
                                  {t.attention_reason && <span style={{ fontSize:'11px', color:'var(--amber)', background:'var(--amber-bg)', padding:'2px 8px', borderRadius:'20px', border:'1px solid rgba(245,158,11,0.2)' }}>{t.attention_reason}</span>}
                                </div>
                                <div className="progress-track" style={{ maxWidth:'200px' }}>
                                  <div className="progress-fill" style={{ width:`${t.progress}%` }} />
                                </div>
                                <p style={{ fontSize:'11px', color:'var(--text3)', marginTop:'4px' }}>{t.progress}% complete</p>
                              </div>
                              <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                                {t.attention_needed && <button onClick={()=>updateTask(t.id,{attention_needed:false,attention_reason:''}as Partial<Task>)} style={{ background:'var(--green-bg)', border:'1px solid rgba(34,211,160,0.25)', color:'var(--green)', borderRadius:'8px', padding:'5px 10px', fontSize:'11px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:'500' }}>Resolve</button>}
                                <button onClick={()=>setEditingTask(t)} className="btn-ghost" style={{ fontSize:'12px', padding:'5px 12px' }}>Edit</button>
                                <button onClick={()=>deleteTask(t.id)} style={{ background:'var(--red-bg)', border:'1px solid rgba(244,63,94,0.2)', color:'var(--red)', borderRadius:'8px', padding:'5px 10px', fontSize:'12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {helperOn.length>0 && (
                      <div className="card" style={{ padding:'20px', border:'1px solid rgba(167,139,250,0.2)', background:'rgba(167,139,250,0.03)' }}>
                        <h4 style={{ fontSize:'13px', fontWeight:'600', color:'var(--purple)', marginBottom:'14px' }}>Helping on {helperOn.length} task{helperOn.length>1?'s':''}</h4>
                        {helperOn.map(t => (
                          <div key={t.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                            <p style={{ fontSize:'13px', color:'var(--text)', flex:1 }}>{t.title}</p>
                            <StatusBadge s={t.status} />
                            {t.assignee && <span style={{ fontSize:'11px', color:'var(--text3)' }}>({t.assignee.name})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })() : (
                <div className="card" style={{ padding:'48px', textAlign:'center' }}>
                  <div style={{ width:'48px', height:'48px', borderRadius:'16px', background:'var(--bg4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color:'var(--text3)' }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/></svg>
                  </div>
                  <p style={{ fontSize:'14px', color:'var(--text3)' }}>Select an employee to view details</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TASKS TAB */}
        {tab==='tasks' && (
          <div className="fade-up">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
              <div style={{ display:'flex', gap:'6px' }}>
                {['All','To Do','In Progress','Done','Blocked'].map(f => (
                  <button key={f} onClick={()=>setStatusFilter(f)}
                    style={{ padding:'6px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:'400', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s', background:statusFilter===f?'var(--bg4)':'transparent', color:statusFilter===f?'var(--text)':'var(--text3)', border:`1px solid ${statusFilter===f?'var(--border2)':'transparent'}` }}>
                    {f} {f!=='All'&&<span style={{ fontSize:'11px', opacity:0.6 }}>({tasks.filter(t=>t.status===f).length})</span>}
                  </button>
                ))}
              </div>
              <button className="btn-primary" onClick={()=>setShowAddTask(true)} style={{ fontSize:'13px', padding:'8px 16px' }}>+ New Task</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
              {(['To Do','In Progress','Done'] as TaskStatus[]).map(col => {
                const colTasks = filtered.filter(t=>t.status===col)
                return (
                  <div key={col} className="card" style={{ overflow:'hidden' }}>
                    <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:col==='Done'?'var(--green)':col==='In Progress'?'var(--blue)':'var(--text3)' }} />
                      <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--text2)' }}>{col}</span>
                      <span style={{ fontSize:'11px', color:'var(--text3)', background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:'20px', padding:'1px 7px', marginLeft:'auto' }}>{colTasks.length}</span>
                    </div>
                    <div style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'8px', maxHeight:'560px', overflowY:'auto' }}>
                      {colTasks.map(t => (
                        <div key={t.id} style={{ background:'var(--bg4)', border:`1px solid ${t.attention_needed?'rgba(245,158,11,0.3)':'var(--border)'}`, borderRadius:'12px', padding:'14px', transition:'border-color 0.2s', cursor:'pointer' }}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor=t.attention_needed?'rgba(245,158,11,0.5)':'var(--border2)')}
                          onMouseLeave={e=>(e.currentTarget.style.borderColor=t.attention_needed?'rgba(245,158,11,0.3)':'var(--border)')}>
                          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px', marginBottom:'10px' }}>
                            <p style={{ fontSize:'13px', fontWeight:'500', color:'var(--text)', lineHeight:'1.4' }}>{t.title}</p>
                            {t.attention_needed && <span style={{ color:'var(--amber)', fontSize:'13px', flexShrink:0 }} className="animate-pulse-dot">⚠</span>}
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                            {t.assignee && <Avatar initials={t.assignee.avatar_initials} color={t.assignee.avatar_color} size={20} />}
                            <span style={{ fontSize:'11px', color:'var(--text3)' }}>{t.assignee?.name}</span>
                          </div>
                          {t.helper && <p style={{ fontSize:'11px', color:'var(--purple)', marginBottom:'8px' }}>Helper: {t.helper.name}</p>}
                          <div className="progress-track" style={{ marginBottom:'8px' }}>
                            <div className="progress-fill" style={{ width:`${t.progress}%` }} />
                          </div>
                          {t.notes && <p style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'10px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.notes}</p>}
                          <div style={{ display:'flex', gap:'6px' }}>
                            <button onClick={()=>setEditingTask(t)} style={{ flex:1, background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text3)', borderRadius:'7px', padding:'5px 0', fontSize:'11px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s' }}>Edit</button>
                            <button onClick={()=>deleteTask(t.id)} style={{ background:'var(--red-bg)', border:'1px solid rgba(244,63,94,0.2)', color:'var(--red)', borderRadius:'7px', padding:'5px 10px', fontSize:'11px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                          </div>
                        </div>
                      ))}
                      {colTasks.length===0 && <p style={{ fontSize:'12px', color:'var(--text3)', padding:'12px 0', textAlign:'center' }}>No tasks</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Blocked section */}
            {tasks.filter(t=>t.status==='Blocked').length>0 && (statusFilter==='All'||statusFilter==='Blocked') && (
              <div style={{ marginTop:'16px', background:'rgba(244,63,94,0.04)', border:'1px solid rgba(244,63,94,0.2)', borderRadius:'16px', padding:'20px' }}>
                <h3 style={{ fontSize:'13px', fontWeight:'600', color:'var(--red)', marginBottom:'14px' }}>Blocked Tasks</h3>
                {tasks.filter(t=>t.status==='Blocked').map(t => (
                  <div key={t.id} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'12px 0', borderBottom:'1px solid rgba(244,63,94,0.1)' }}>
                    {t.assignee && <Avatar initials={t.assignee.avatar_initials} color={t.assignee.avatar_color} size={28} />}
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:'13px', fontWeight:'500', color:'var(--red)' }}>{t.title}</p>
                      {t.notes && <p style={{ fontSize:'12px', color:'rgba(244,63,94,0.7)' }}>{t.notes}</p>}
                    </div>
                    <button onClick={()=>setEditingTask(t)} className="btn-ghost" style={{ fontSize:'12px', padding:'6px 12px', borderColor:'rgba(244,63,94,0.3)', color:'var(--red)' }}>Assign Helper</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* REPORTS TAB */}
        {tab==='reports' && (
          <div className="fade-up">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'16px' }}>
              {employees.map(emp => {
                const empTasks = tasks.filter(t=>t.assignee_id===emp.id)
                const done = empTasks.filter(t=>t.status==='Done').length
                const inP = empTasks.filter(t=>t.status==='In Progress').length
                const blk = empTasks.filter(t=>t.status==='Blocked').length
                const pct = empTasks.length ? Math.round(done/empTasks.length*100) : 0
                const wi = workInfos[emp.id]
                const todayHours = wi ? fmtSecs(wi.totalSeconds) : '0m'

                return (
                  <div key={emp.id} className="card" style={{ padding:'24px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'20px' }}>
                      <Avatar initials={emp.avatar_initials} color={emp.avatar_color} size={40} />
                      <div>
                        <p style={{ fontSize:'15px', fontWeight:'600', color:'var(--text)' }}>{emp.name}</p>
                        <p style={{ fontSize:'12px', color:'var(--text3)' }}>{emp.email}</p>
                      </div>
                      <div style={{ marginLeft:'auto', textAlign:'right' }}>
                        <p style={{ fontSize:'22px', fontWeight:'600', color:pct>=80?'var(--green)':pct>=50?'var(--amber)':'var(--text)', letterSpacing:'-0.5px' }}>{pct}%</p>
                        <p style={{ fontSize:'11px', color:'var(--text3)' }}>completion</p>
                      </div>
                    </div>
                    <div className="progress-track" style={{ marginBottom:'16px' }}>
                      <div className="progress-fill" style={{ width:`${pct}%`, background:pct>=80?'var(--green)':undefined }} />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
                      {[
                        { l:'Total', v:empTasks.length, c:'var(--text)' },
                        { l:'Done', v:done, c:'var(--green)' },
                        { l:'Active', v:inP, c:'var(--blue)' },
                        { l:'Today', v:todayHours, c:'var(--accent)', mono:true },
                      ].map((s,i) => (
                        <div key={i} style={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px', textAlign:'center' }}>
                          <p style={{ fontSize:'16px', fontWeight:'600', color:s.c, fontFamily:s.mono?"'DM Mono',monospace":undefined }}>{s.v}</p>
                          <p style={{ fontSize:'10px', color:'var(--text3)', marginTop:'2px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.l}</p>
                        </div>
                      ))}
                    </div>
                    {blk>0 && <div style={{ marginTop:'12px', padding:'10px 14px', background:'var(--red-bg)', border:'1px solid rgba(244,63,94,0.2)', borderRadius:'10px', fontSize:'12px', color:'var(--red)', fontWeight:'500' }}>⚠ {blk} task{blk>1?'s':''} blocked — needs attention</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* ADD TASK MODAL */}
      {showAddTask && (
        <div className="modal-overlay" onClick={()=>setShowAddTask(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3 style={{ fontSize:'17px', fontWeight:'600', color:'var(--text)', marginBottom:'20px' }}>Create New Task</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div><label style={labelStyle}>Task Title *</label><input style={inputStyle} value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} placeholder="What needs to be done?" /></div>
              <div><label style={labelStyle}>Description</label><textarea style={{...inputStyle, resize:'none'}} rows={2} value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} placeholder="Additional details..." /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div><label style={labelStyle}>Assign To *</label>
                  <select style={inputStyle as React.CSSProperties} value={taskForm.assignee_id} onChange={e=>setTaskForm(f=>({...f,assignee_id:e.target.value}))}>
                    <option value="">Select employee</option>
                    {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Helper (optional)</label>
                  <select style={inputStyle as React.CSSProperties} value={taskForm.helper_id} onChange={e=>setTaskForm(f=>({...f,helper_id:e.target.value}))}>
                    <option value="">No helper</option>
                    {employees.filter(e=>e.id!==taskForm.assignee_id).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' }}>
                <div><label style={labelStyle}>Priority</label>
                  <select style={inputStyle as React.CSSProperties} value={taskForm.priority} onChange={e=>setTaskForm(f=>({...f,priority:e.target.value}))}>
                    {['Low','Medium','High'].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Tag / Category</label><input style={inputStyle} value={taskForm.tag} onChange={e=>setTaskForm(f=>({...f,tag:e.target.value}))} placeholder="Frontend, QA…" /></div>
                <div><label style={labelStyle}>Due Date</label><input type="date" style={inputStyle} value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))} /></div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button className="btn-ghost" onClick={()=>setShowAddTask(false)} style={{ flex:1 }}>Cancel</button>
              <button className="btn-primary" onClick={createTask} disabled={saving||!taskForm.title||!taskForm.assignee_id} style={{ flex:2 }}>
                {saving?'Creating…':'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TASK MODAL */}
      {editingTask && (
        <div className="modal-overlay" onClick={()=>setEditingTask(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3 style={{ fontSize:'17px', fontWeight:'600', color:'var(--text)', marginBottom:'4px' }}>Edit Task</h3>
            <p style={{ fontSize:'13px', color:'var(--text3)', marginBottom:'20px' }}>{editingTask.title}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div><label style={labelStyle}>Status</label>
                  <select style={inputStyle as React.CSSProperties} value={editingTask.status} onChange={e=>setEditingTask(t=>t?{...t,status:e.target.value as TaskStatus}:null)}>
                    {['To Do','In Progress','Done','Blocked'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Progress %</label>
                  <input type="number" min="0" max="100" style={inputStyle} value={editingTask.progress} onChange={e=>setEditingTask(t=>t?{...t,progress:parseInt(e.target.value)||0}:null)} />
                </div>
              </div>
              <div><label style={labelStyle}>Assign Helper</label>
                <select style={inputStyle as React.CSSProperties} value={editingTask.helper_id||''} onChange={e=>setEditingTask(t=>t?{...t,helper_id:e.target.value}:null)}>
                  <option value="">No helper</option>
                  {employees.filter(e=>e.id!==editingTask.assignee_id).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Notes</label>
                <textarea style={{...inputStyle, resize:'none'}} rows={2} value={editingTask.notes||''} onChange={e=>setEditingTask(t=>t?{...t,notes:e.target.value}:null)} placeholder="Latest update notes…" />
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button className="btn-ghost" onClick={()=>setEditingTask(null)} style={{ flex:1 }}>Cancel</button>
              <button className="btn-primary" style={{ flex:2 }} onClick={async()=>{
                if(!editingTask) return; setSaving(true)
                await updateTask(editingTask.id,{status:editingTask.status,progress:editingTask.progress,notes:editingTask.notes,helper_id:editingTask.helper_id}as Partial<Task>)
                setEditingTask(null); setSaving(false)
              }}>{saving?'Saving…':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD EMPLOYEE MODAL */}
      {showAddEmp && (
        <div className="modal-overlay" onClick={()=>setShowAddEmp(false)}>
          <div className="modal" style={{ maxWidth:'400px' }} onClick={e=>e.stopPropagation()}>
            <h3 style={{ fontSize:'17px', fontWeight:'600', color:'var(--text)', marginBottom:'20px' }}>Add Team Member</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div><label style={labelStyle}>Full Name *</label><input style={inputStyle} value={empForm.name} onChange={e=>setEmpForm(f=>({...f,name:e.target.value}))} placeholder="Jane Smith" /></div>
              <div><label style={labelStyle}>Email Address *</label><input type="email" style={inputStyle} value={empForm.email} onChange={e=>setEmpForm(f=>({...f,email:e.target.value}))} placeholder="jane@company.com" /></div>
              <div><label style={labelStyle}>Temporary Password *</label><input type="password" style={inputStyle} value={empForm.password} onChange={e=>setEmpForm(f=>({...f,password:e.target.value}))} placeholder="Set a login password" /></div>
              <div>
                <label style={labelStyle}>Avatar Color</label>
                <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                  <input type="color" value={empForm.avatar_color} onChange={e=>setEmpForm(f=>({...f,avatar_color:e.target.value}))} style={{ width:'44px', height:'44px', borderRadius:'10px', border:'1px solid var(--border)', cursor:'pointer', background:'none', padding:'2px' }} />
                  <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:empForm.avatar_color+'22', color:empForm.avatar_color, border:`1px solid ${empForm.avatar_color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'600' }}>
                    {empForm.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?'}
                  </div>
                  <span style={{ fontSize:'12px', color:'var(--text3)' }}>Preview</span>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button className="btn-ghost" onClick={()=>setShowAddEmp(false)} style={{ flex:1 }}>Cancel</button>
              <button className="btn-primary" onClick={createEmployee} disabled={saving||!empForm.name||!empForm.email||!empForm.password} style={{ flex:2 }}>
                {saving?'Adding…':'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

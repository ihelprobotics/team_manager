'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Blocked'

interface User { id: string; name: string; avatar_initials: string; avatar_color: string; email: string }
interface Task {
  id: string; title: string; description?: string; status: TaskStatus
  priority: string; progress: number; notes?: string; tag?: string
  due_date?: string; attention_needed: boolean; attention_reason?: string
  assignee?: User; helper?: User; assignee_id?: string; helper_id?: string
}
interface WorkSession { id: string; started_at: string }
interface ChatMsg { role: 'user' | 'assistant'; content: string; updates?: TaskUpdate[] }
interface TaskUpdate { taskId: string; taskTitle: string; newStatus: TaskStatus; newProgress: number; notes: string; statusChange?: { from: TaskStatus; to: TaskStatus }; progressChange?: { from: number; to: number } }

function formatSeconds(s: number) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function statusBadgeClass(s: TaskStatus) {
  if (s==='To Do') return 'badge-todo'
  if (s==='In Progress') return 'badge-inprogress'
  if (s==='Done') return 'badge-done'
  return 'badge-blocked'
}

function Avatar({ initials, color, size=32 }: { initials:string; color:string; size?:number }) {
  return (
    <div className="avatar" style={{ width:size, height:size, background:color+'22', color, fontSize:size*0.36, border:`1px solid ${color}44`, flexShrink:0 }}>
      {initials}
    </div>
  )
}

export default function EmployeeDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User|null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState<'dashboard'|'chat'>('dashboard')
  const [workSession, setWorkSession] = useState<WorkSession|null>(null)
  const [timerSec, setTimerSec] = useState(0)
  const [totalToday, setTotalToday] = useState(0)
  const [timerOn, setTimerOn] = useState(false)
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [expandedTask, setExpandedTask] = useState<string|null>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout|null>(null)
  const historyRef = useRef<ChatMsg[]>([])

  useEffect(() => {
    fetch('/api/auth/me').then(r=>r.json()).then(d => {
      if (!d.user) { router.push('/login'); return }
      setUser(d.user)
    })
  }, [router])

  const loadTasks = useCallback(async () => {
    const r = await fetch('/api/tasks'); const d = await r.json(); setTasks(d.tasks||[])
  }, [])

  const loadSession = useCallback(async () => {
    const r = await fetch('/api/sessions'); const d = await r.json()
    setTotalToday(d.totalSeconds||0)
    if (d.active) {
      setWorkSession(d.active)
      setTimerSec(Math.floor((Date.now()-new Date(d.active.started_at).getTime())/1000))
      setTimerOn(true)
    }
  }, [])

  const loadChat = useCallback(async () => {
    const r = await fetch('/api/chat'); const d = await r.json()
    if (d.messages?.length) {
      const msgs = d.messages.map((m: {role:'user'|'assistant';content:string;task_updates?:TaskUpdate[]}) => ({ role:m.role, content:m.content, updates:m.task_updates }))
      setChatMsgs(msgs); historyRef.current = msgs
    }
  }, [])

  useEffect(() => { if (user) { loadTasks(); loadSession(); loadChat() } }, [user, loadTasks, loadSession, loadChat])

  useEffect(() => {
    if (timerOn) { timerRef.current = setInterval(() => setTimerSec(s=>s+1), 1000) }
    else if (timerRef.current) clearInterval(timerRef.current)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerOn])

  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [chatMsgs])

  async function toggleTimer() {
    if (!timerOn) {
      const r = await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'start'}) })
      const d = await r.json(); setWorkSession(d.session); setTimerSec(0); setTimerOn(true)
    } else {
      await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'stop'}) })
      setTotalToday(p=>p+timerSec); setWorkSession(null); setTimerOn(false); setTimerSec(0)
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const text = chatInput.trim(); setChatInput('')
    const userMsg: ChatMsg = { role:'user', content:text }
    const newMsgs = [...historyRef.current, userMsg]
    setChatMsgs(newMsgs); historyRef.current = newMsgs; setChatLoading(true)
    const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:text, history:historyRef.current.slice(-10) }) })
    const d = await r.json()
    const aiMsg: ChatMsg = { role:'assistant', content:d.reply, updates:d.updates }
    const updated = [...historyRef.current, aiMsg]
    setChatMsgs(updated); historyRef.current = updated; setChatLoading(false)
    if (d.updates?.length) loadTasks()
  }

  async function logout() {
    if (timerOn) await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'stop'}) })
    await fetch('/api/auth/logout', { method:'POST' }); router.push('/login')
  }

  const myTasks = tasks.filter(t=>t.assignee_id===user?.id)
  const helperTasks = tasks.filter(t=>t.helper_id===user?.id && t.assignee_id!==user?.id)
  const attentionTasks = myTasks.filter(t=>t.attention_needed)
  const donePct = myTasks.length ? Math.round(myTasks.filter(t=>t.status==='Done').length/myTasks.length*100) : 0

  if (!user) return (
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
          </div>
          <nav style={{ display:'flex', gap:'4px' }}>
            <button className={`nav-tab ${tab==='dashboard'?'active':''}`} onClick={()=>setTab('dashboard')}>My Tasks</button>
            <button className={`nav-tab ${tab==='chat'?'active':''}`} onClick={()=>setTab('chat')}>
              Update via Chat
              {chatMsgs.length===0 && <span style={{ marginLeft:'6px', background:'var(--accent)', color:'white', fontSize:'10px', padding:'1px 5px', borderRadius:'10px' }}>AI</span>}
            </button>
          </nav>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          {/* Timer */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--bg4)', border:`1px solid ${timerOn?'rgba(34,211,160,0.3)':'var(--border)'}`, borderRadius:'10px', padding:'7px 14px' }}>
            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:timerOn?'var(--green)':'var(--text3)', flexShrink:0 }} className={timerOn?'animate-pulse-dot':''} />
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'13px', color:timerOn?'var(--green)':'var(--text2)', letterSpacing:'0.05em' }}>{formatSeconds(timerSec)}</span>
          </div>
          <button onClick={toggleTimer} className={timerOn?'btn-ghost':''} style={timerOn ? { borderColor:'rgba(244,63,94,0.3)', color:'var(--red)', fontSize:'13px' } : { background:'var(--green)', color:'var(--bg)', border:'none', borderRadius:'10px', padding:'8px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer', transition:'all 0.2s', fontFamily:"'DM Sans',sans-serif" }}>
            {timerOn ? 'Clock Out' : '▶ Clock In'}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <Avatar initials={user.avatar_initials} color={user.avatar_color} size={30} />
            <span style={{ fontSize:'13px', color:'var(--text2)' }}>{user.name}</span>
          </div>
          <button onClick={logout} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:'13px', fontFamily:"'DM Sans',sans-serif' " }}>Sign out</button>
        </div>
      </div>

      {/* Attention banner */}
      {attentionTasks.length>0 && (
        <div style={{ padding:'12px 24px', background:'linear-gradient(135deg,rgba(244,63,94,0.06),rgba(244,63,94,0.02))', borderBottom:'1px solid rgba(244,63,94,0.15)' }}>
          <div style={{ maxWidth:'1280px', margin:'0 auto', display:'flex', alignItems:'center', gap:'12px' }}>
            <span style={{ color:'var(--red)', fontSize:'14px' }} className="animate-pulse-dot">⚠</span>
            <span style={{ fontSize:'13px', fontWeight:'500', color:'var(--red)' }}>{attentionTasks.length} task{attentionTasks.length>1?'s':''} flagged for attention —</span>
            <span style={{ fontSize:'13px', color:'rgba(244,63,94,0.7)' }}>{attentionTasks.map(t=>t.title).join(' · ')}</span>
          </div>
        </div>
      )}

      <main style={{ maxWidth:'1280px', margin:'0 auto', padding:'28px 24px' }}>

        {/* DASHBOARD TAB */}
        {tab==='dashboard' && (
          <div>
            {/* Stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'28px' }} className="fade-up">
              {[
                { label:'My Tasks', value:myTasks.length, sub:`${myTasks.filter(t=>t.status==='In Progress').length} active`, color:'var(--accent)' },
                { label:'Completed', value:myTasks.filter(t=>t.status==='Done').length, sub:`${donePct}% complete`, color:'var(--green)' },
                { label:'Helping On', value:helperTasks.length, sub:'as a helper', color:'var(--purple)' },
                { label:"Today's Time", value:formatSeconds(totalToday+(timerOn?timerSec:0)), sub:timerOn?'currently active':'total logged', color:'var(--blue)', mono:true },
              ].map((s,i) => (
                <div key={i} className="stat-card fade-up" style={{ animationDelay:`${i*0.06}s` }}>
                  <p style={{ fontSize:'11px', fontWeight:'500', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'12px' }}>{s.label}</p>
                  <p style={{ fontSize:'28px', fontWeight:'600', color:s.color, letterSpacing:'-0.5px', fontFamily:s.mono?"'DM Mono',monospace":undefined }}>{s.value}</p>
                  <p style={{ fontSize:'12px', color:'var(--text3)', marginTop:'4px' }}>{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Helper banner */}
            {helperTasks.length>0 && (
              <div style={{ background:'var(--purple-bg)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:'16px', padding:'16px 20px', marginBottom:'24px' }} className="fade-up-1">
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color:'var(--purple)' }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--purple)' }}>You&apos;re a helper on {helperTasks.length} task{helperTasks.length>1?'s':''}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {helperTasks.map(t => (
                    <div key={t.id} style={{ background:'var(--bg3)', border:'1px solid rgba(167,139,250,0.15)', borderRadius:'10px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'12px' }}>
                      <div>
                        <p style={{ fontSize:'13px', fontWeight:'500', color:'var(--text)', marginBottom:'2px' }}>{t.title}</p>
                        <p style={{ fontSize:'11px', color:'var(--text3)' }}>Assigned to {t.assignee?.name}</p>
                      </div>
                      <span className={`badge ${statusBadgeClass(t.status)}`} style={{ marginLeft:'auto' }}>{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tasks */}
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
                <h2 style={{ fontSize:'14px', fontWeight:'600', color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em' }}>My Tasks</h2>
                <button className="btn-ghost" onClick={()=>setTab('chat')} style={{ fontSize:'12px', padding:'6px 12px' }}>Update via chat →</button>
              </div>

              {myTasks.length===0 ? (
                <div className="card" style={{ padding:'48px', textAlign:'center' }}>
                  <p style={{ color:'var(--text3)', fontSize:'14px' }}>No tasks assigned yet</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {myTasks.map((t,i) => (
                    <div key={t.id} className={`task-card ${expandedTask===t.id?'active':''}`} style={{ animationDelay:`${i*0.04}s` }}
                      onClick={()=>setExpandedTask(expandedTask===t.id?null:t.id)}>
                      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                        {/* Status dot */}
                        <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background: t.status==='Done'?'var(--green)':t.status==='In Progress'?'var(--blue)':t.status==='Blocked'?'var(--red)':'var(--text3)' }} />

                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', flexWrap:'wrap' }}>
                            {t.attention_needed && <span style={{ fontSize:'11px', color:'var(--amber)', background:'var(--amber-bg)', border:'1px solid rgba(245,158,11,0.25)', padding:'2px 8px', borderRadius:'20px', fontWeight:'500' }} className="animate-pulse-dot">⚠ Attention needed</span>}
                            <span style={{ fontSize:'14px', fontWeight:'500', color:'var(--text)' }}>{t.title}</span>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                            <span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span>
                            <span className={`badge badge-${t.priority.toLowerCase()}`}>{t.priority}</span>
                            {t.tag && <span style={{ fontSize:'11px', color:'var(--text3)', background:'var(--bg4)', border:'1px solid var(--border)', padding:'2px 8px', borderRadius:'20px' }}>{t.tag}</span>}
                            {t.helper && <span style={{ fontSize:'11px', color:'var(--purple)' }}>Helper: {t.helper.name}</span>}
                            {t.due_date && <span style={{ fontSize:'11px', color:'var(--text3)' }}>Due {new Date(t.due_date).toLocaleDateString()}</span>}
                          </div>
                        </div>

                        <div style={{ flexShrink:0, textAlign:'right', minWidth:'80px' }}>
                          <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--text2)', fontFamily:"'DM Mono',monospace" }}>{t.progress}%</span>
                          <div className="progress-track" style={{ marginTop:'6px' }}>
                            <div className="progress-fill" style={{ width:`${t.progress}%` }} />
                          </div>
                        </div>

                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color:'var(--text3)', transition:'transform 0.2s', transform:expandedTask===t.id?'rotate(180deg)':'none', flexShrink:0 }}>
                          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>

                      {expandedTask===t.id && (
                        <div style={{ marginTop:'16px', paddingTop:'16px', borderTop:'1px solid var(--border)' }} onClick={e=>e.stopPropagation()}>
                          {t.description && <p style={{ fontSize:'13px', color:'var(--text2)', marginBottom:'12px', lineHeight:'1.6' }}>{t.description}</p>}
                          {t.notes && (
                            <div style={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:'10px', padding:'12px', marginBottom:'12px' }}>
                              <p style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'4px', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.06em' }}>Latest notes</p>
                              <p style={{ fontSize:'13px', color:'var(--text)', lineHeight:'1.6' }}>{t.notes}</p>
                            </div>
                          )}
                          {t.attention_reason && (
                            <div style={{ background:'var(--amber-bg)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'10px', padding:'12px', marginBottom:'12px' }}>
                              <p style={{ fontSize:'11px', color:'var(--amber)', marginBottom:'4px', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.06em' }}>Attention reason</p>
                              <p style={{ fontSize:'13px', color:'rgba(245,158,11,0.9)' }}>{t.attention_reason}</p>
                            </div>
                          )}
                          <button onClick={() => { setTab('chat'); setChatInput(`Update on "${t.title}": `) }}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', fontSize:'13px', fontFamily:"'DM Sans',sans-serif", padding:0 }}>
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

        {/* CHAT TAB */}
        {tab==='chat' && (
          <div className="fade-up" style={{ maxWidth:'680px', margin:'0 auto' }}>
            <div className="card" style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 160px)', minHeight:'520px' }}>
              {/* Chat header */}
              <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'36px', height:'36px', borderRadius:'12px', background:'linear-gradient(135deg,var(--accent),#8b85ff)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px var(--accent-glow)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <p style={{ fontSize:'14px', fontWeight:'600', color:'var(--text)' }}>Task Update Assistant</p>
                  <p style={{ fontSize:'12px', color:'var(--text3)' }}>Describe your progress — I&apos;ll update the dashboard automatically</p>
                </div>
                <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px' }}>
                  <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--green)' }} className="animate-pulse-dot" />
                  <span style={{ fontSize:'11px', color:'var(--green)' }}>AI Active</span>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'16px' }}>
                {chatMsgs.length===0 && (
                  <div style={{ textAlign:'center', padding:'32px 0' }}>
                    <div style={{ width:'48px', height:'48px', borderRadius:'16px', background:'var(--bg4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color:'var(--accent)' }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <p style={{ fontSize:'15px', fontWeight:'600', color:'var(--text)', marginBottom:'6px' }}>Hi {user.name}!</p>
                    <p style={{ fontSize:'13px', color:'var(--text3)', marginBottom:'20px' }}>Tell me what you worked on. For example:</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxWidth:'360px', margin:'0 auto' }}>
                      {[`"Finished the login redesign, everything looks great"`,`"I'm 70% done with the API bug, blocked on token refresh"`,`"Completed the test suite, all tests passing"`].map(ex => (
                        <button key={ex} onClick={()=>setChatInput(ex.replace(/"/g,''))}
                          style={{ background:'var(--bg4)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px', fontSize:'13px', color:'var(--text2)', cursor:'pointer', textAlign:'left', transition:'all 0.15s', fontFamily:"'DM Sans',sans-serif" }}
                          onMouseEnter={e=>{(e.target as HTMLButtonElement).style.borderColor='var(--accent)';(e.target as HTMLButtonElement).style.color='var(--text)'}}
                          onMouseLeave={e=>{(e.target as HTMLButtonElement).style.borderColor='var(--border)';(e.target as HTMLButtonElement).style.color='var(--text2)'}}>
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chatMsgs.map((msg,i) => (
                  <div key={i} style={{ display:'flex', gap:'10px', flexDirection:msg.role==='user'?'row-reverse':'row', alignItems:'flex-end' }}>
                    {msg.role==='user'
                      ? <Avatar initials={user.avatar_initials} color={user.avatar_color} size={28} />
                      : <div style={{ width:'28px', height:'28px', borderRadius:'10px', background:'linear-gradient(135deg,var(--accent),#8b85ff)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'11px', fontWeight:'700', color:'white' }}>AI</div>
                    }
                    <div className={msg.role==='user'?'msg-user':'msg-ai'}>
                      {msg.content}
                      {msg.updates && msg.updates.length>0 && (
                        <div className="update-card">
                          <p style={{ fontSize:'10px', color:'var(--text3)', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Dashboard updated</p>
                          {msg.updates.map((u,j) => (
                            <div key={j} style={{ paddingBottom:'6px', marginBottom:'6px', borderBottom:'1px solid var(--border)' }}>
                              <p style={{ fontSize:'12px', fontWeight:'600', color:'var(--text)', marginBottom:'4px' }}>{u.taskTitle}</p>
                              {u.statusChange && <p style={{ fontSize:'11px', color:'var(--text3)' }}>Status: <span style={{ color:'var(--text2)' }}>{u.statusChange.from} → {u.statusChange.to}</span></p>}
                              {u.progressChange && <p style={{ fontSize:'11px', color:'var(--text3)' }}>Progress: <span style={{ color:'var(--text2)' }}>{u.progressChange.from}% → {u.progressChange.to}%</span></p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div style={{ display:'flex', gap:'10px', alignItems:'flex-end' }}>
                    <div style={{ width:'28px', height:'28px', borderRadius:'10px', background:'linear-gradient(135deg,var(--accent),#8b85ff)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'11px', fontWeight:'700', color:'white' }}>AI</div>
                    <div className="msg-ai" style={{ padding:'14px 16px' }}>
                      <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
                        {[0,1,2].map(i => <div key={i} style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--text3)' }} className="animate-bounce-dot" />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={msgsEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding:'16px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:'10px', alignItems:'flex-end' }}>
                <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}}
                  placeholder="What did you work on today? Any blockers?" rows={2}
                  className="input-field" style={{ flex:1, resize:'none', maxHeight:'120px', overflowY:'auto' }} />
                <button onClick={sendChat} disabled={!chatInput.trim()||chatLoading} className="btn-primary" style={{ flexShrink:0, padding:'11px 20px', alignSelf:'flex-end' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><polygon points="22,2 15,22 11,13 2,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

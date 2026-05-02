'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      router.push(data.user.role === 'manager' ? '/manager' : '/employee')
    } catch { setError('Connection error. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:"'DM Sans', sans-serif" }}>

      {/* Background glow */}
      <div style={{ position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)', width:'600px', height:'600px', background:'radial-gradient(circle, rgba(108,99,255,0.08) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:'400px' }} className="fade-up">

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'40px' }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:'52px', height:'52px', borderRadius:'16px', background:'linear-gradient(135deg, var(--accent), #8b85ff)', marginBottom:'16px', boxShadow:'0 8px 32px var(--accent-glow)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 11l3 3L22 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize:'26px', fontWeight:'600', color:'var(--text)', letterSpacing:'-0.5px' }}>TaskFlow</h1>
          <p style={{ fontSize:'14px', color:'var(--text3)', marginTop:'6px' }}>Team task management</p>
        </div>

        {/* Card */}
        <div style={{ background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:'20px', padding:'32px', boxShadow:'0 32px 80px rgba(0,0,0,0.4)' }}>
          <h2 style={{ fontSize:'18px', fontWeight:'600', color:'var(--text)', marginBottom:'6px' }}>Welcome back</h2>
          <p style={{ fontSize:'13px', color:'var(--text3)', marginBottom:'28px' }}>Sign in to your workspace</p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:'16px' }}>
              <label className="label">Email address</label>
              <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div style={{ marginBottom:'24px' }}>
              <label className="label">Password</label>
              <input className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>

            {error && (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--red-bg)', border:'1px solid rgba(244,63,94,0.25)', borderRadius:'10px', padding:'10px 14px', marginBottom:'16px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color:'var(--red)', flexShrink:0 }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>
                <span style={{ fontSize:'13px', color:'var(--red)' }}>{error}</span>
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={loading} style={{ width:'100%', padding:'12px', fontSize:'15px' }}>
              {loading ? (
                <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
                  <span style={{ width:'14px', height:'14px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', display:'inline-block' }} className="animate-spin-slow" />
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', fontSize:'12px', color:'var(--text3)', marginTop:'24px' }}>
          Access managed by your team administrator
        </p>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
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
      // Block employees from using this page
      if (data.user.role !== 'manager') {
        setError('This login is for managers only. Use the main login page.')
        await fetch('/api/auth/logout', { method: 'POST' })
        return
      }
      router.push('/manager')
    } catch { setError('Connection error. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:"'DM Sans', sans-serif" }}>

      <div style={{ position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)', width:'500px', height:'500px', background:'radial-gradient(circle, rgba(167,139,250,0.07) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:'400px' }} className="fade-up">

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'40px' }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:'52px', height:'52px', borderRadius:'16px', background:'linear-gradient(135deg, #534AB7, #8b85ff)', marginBottom:'16px', boxShadow:'0 8px 32px rgba(83,74,183,0.4)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="white" strokeWidth="2.5"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize:'24px', fontWeight:'600', color:'var(--text)', letterSpacing:'-0.5px' }}>Manager Portal</h1>
          <p style={{ fontSize:'13px', color:'var(--text3)', marginTop:'6px' }}>Restricted access — authorised personnel only</p>
        </div>

        {/* Card */}
        <div style={{ background:'var(--bg3)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:'20px', padding:'32px', boxShadow:'0 32px 80px rgba(0,0,0,0.4)' }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:'16px' }}>
              <label style={{ fontSize:'11px', fontWeight:'500', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px', display:'block' }}>Email address</label>
              <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@company.com" required />
            </div>
            <div style={{ marginBottom:'24px' }}>
              <label style={{ fontSize:'11px', fontWeight:'500', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px', display:'block' }}>Password</label>
              <input className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>

            {error && (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--red-bg)', border:'1px solid rgba(244,63,94,0.25)', borderRadius:'10px', padding:'10px 14px', marginBottom:'16px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color:'var(--red)', flexShrink:0 }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>
                <span style={{ fontSize:'13px', color:'var(--red)' }}>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'12px', fontSize:'15px', background:'linear-gradient(135deg,#534AB7,#8b85ff)', color:'white', border:'none', borderRadius:'10px', fontFamily:"'DM Sans',sans-serif", fontWeight:'500', cursor:'pointer', transition:'all 0.2s', opacity:loading?0.6:1 }}>
              {loading ? (
                <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
                  <span style={{ width:'14px', height:'14px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', display:'inline-block' }} className="animate-spin-slow" />
                  Signing in...
                </span>
              ) : 'Access Manager Portal'}
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', fontSize:'12px', color:'var(--text3)', marginTop:'20px' }}>
          Employee?{' '}
          <a href="/login" style={{ color:'var(--accent)', textDecoration:'none' }}>Go to employee login →</a>
        </p>
      </div>
    </div>
  )
}

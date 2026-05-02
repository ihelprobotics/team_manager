import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const userId = (session.role === 'manager' && url.searchParams.get('user_id')) || session.id

  const { data: active } = await db.from('work_sessions').select('*').eq('user_id', userId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle()

  const today = new Date(); today.setHours(0,0,0,0)
  const { data: todaySessions } = await db.from('work_sessions').select('*').eq('user_id', userId).gte('started_at', today.toISOString()).order('started_at', { ascending: false })

  const totalSeconds = (todaySessions || []).reduce((sum: number, s: { duration_seconds?: number }) => sum + (s.duration_seconds || 0), 0)
  return NextResponse.json({ active, todaySessions, totalSeconds })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { action, notes } = await req.json()

  if (action === 'start') {
    await db.from('work_sessions').update({ ended_at: new Date().toISOString(), duration_seconds: 0 }).eq('user_id', session.id).is('ended_at', null)
    const { data, error } = await db.from('work_sessions').insert({ user_id: session.id, notes }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ session: data })
  }

  if (action === 'stop') {
    const { data: active } = await db.from('work_sessions').select('*').eq('user_id', session.id).is('ended_at', null).single()
    if (!active) return NextResponse.json({ error: 'No active session' }, { status: 400 })
    const endedAt = new Date()
    const duration = Math.floor((endedAt.getTime() - new Date(active.started_at as string).getTime()) / 1000)
    const { data, error } = await db.from('work_sessions').update({ ended_at: endedAt.toISOString(), duration_seconds: duration, notes: notes || active.notes }).eq('id', active.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ session: data })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

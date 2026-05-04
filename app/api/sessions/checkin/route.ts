import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { message, activity_score } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  await db.from('chat_messages').insert({
    user_id: session.id, role: 'user',
    content: `[CHECK-IN] ${message}`, task_updates: null,
  })

  const { data: active } = await db.from('work_sessions').select('id,activity_score,checkin_count')
    .eq('user_id', session.id).is('ended_at', null).maybeSingle()

  if (active) {
    const newScore = Math.round(((active.activity_score || 0) + (activity_score || 50)) / 2)
    await db.from('work_sessions').update({
      last_heartbeat: new Date().toISOString(),
      last_activity_type: 'checkin',
      activity_score: newScore,
      checkin_count: (active.checkin_count || 0) + 1,
      last_checkin_message: message,
      last_checkin_at: new Date().toISOString(),
    }).eq('id', active.id)
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()

  const { data } = await db.from('work_sessions')
    .select('*, user:user_id(id,name,avatar_initials,avatar_color)')
    .is('ended_at', null)
    .order('started_at', { ascending: false })

  return NextResponse.json({ activeSessions: data || [] })
}

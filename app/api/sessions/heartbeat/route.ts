import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { activity_type } = await req.json()

  const { data: active } = await db
    .from('work_sessions')
    .select('id')
    .eq('user_id', session.id)
    .is('ended_at', null)
    .maybeSingle()

  if (!active) return NextResponse.json({ error: 'No active session' }, { status: 400 })

  await db.from('work_sessions')
    .update({ last_heartbeat: new Date().toISOString(), last_activity_type: activity_type })
    .eq('id', active.id)

  return NextResponse.json({ ok: true })
}

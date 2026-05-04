import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET — manager fetches today's summaries for all employees
// or a specific date via ?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'manager') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)

  const { data, error } = await db
    .from('daily_summaries')
    .select('*, user:user_id(id,name,avatar_initials,avatar_color)')
    .eq('date', date)
    .order('last_updated', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also get list of available dates (last 30 days that have data)
  const { data: dates } = await db
    .from('daily_summaries')
    .select('date')
    .order('date', { ascending: false })
    .limit(30)

  const uniqueDates = [...new Set((dates || []).map((d: { date: string }) => d.date))]

  return NextResponse.json({ summaries: data || [], date, availableDates: uniqueDates })
}

// POST — called internally after each chat update to add a bullet point
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { bullet, task_title, action } = await req.json()
  if (!bullet) return NextResponse.json({ error: 'bullet required' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  const newBullet = {
    text: bullet,
    task_title: task_title || null,
    action: action || 'update',
    timestamp: now,
  }

  // Upsert: insert new row or append bullet to existing
  const { data: existing } = await db
    .from('daily_summaries')
    .select('id, bullet_points')
    .eq('user_id', session.id)
    .eq('date', today)
    .maybeSingle()

  if (existing) {
    const bullets = Array.isArray(existing.bullet_points) ? existing.bullet_points : []
    bullets.push(newBullet)
    await db.from('daily_summaries')
      .update({ bullet_points: bullets, last_updated: now })
      .eq('id', existing.id)
  } else {
    await db.from('daily_summaries').insert({
      user_id: session.id,
      date: today,
      bullet_points: [newBullet],
      last_updated: now,
    })
  }

  return NextResponse.json({ ok: true })
}

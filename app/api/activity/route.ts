import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const taskId = url.searchParams.get('task_id')

  let query = db.from('task_activity')
    .select(`*, user:user_id(name,avatar_initials,avatar_color), task:task_id(title)`)
    .order('created_at', { ascending: false }).limit(50)

  if (taskId) query = query.eq('task_id', taskId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}

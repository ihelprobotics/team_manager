import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const url = new URL(req.url)
  const assigneeId = url.searchParams.get('assignee_id')

  let query = db.from('tasks').select(`
    *, assignee:assignee_id(id,name,avatar_initials,avatar_color,role),
    helper:helper_id(id,name,avatar_initials,avatar_color,role)
  `).order('created_at', { ascending: false })

  if (session.role === 'employee') {
    query = query.or(`assignee_id.eq.${session.id},helper_id.eq.${session.id}`)
  } else if (assigneeId) {
    query = query.eq('assignee_id', assigneeId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const body = await req.json()
  const { title, description, assignee_id, helper_id, priority, tag, due_date, status } = body

  const { data, error } = await db.from('tasks').insert({
    title, description, assignee_id, helper_id,
    priority: priority || 'Medium', tag, due_date,
    status: status || 'To Do', created_by: session.id,
  }).select(`*, assignee:assignee_id(id,name,avatar_initials,avatar_color), helper:helper_id(id,name,avatar_initials,avatar_color)`).single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await db.from('task_activity').insert({ task_id: data.id, user_id: session.id, action: 'created', new_value: title })
  return NextResponse.json({ task: data })
}

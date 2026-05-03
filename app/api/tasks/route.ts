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
    *, 
    assignee:assignee_id(id,name,avatar_initials,avatar_color,role),
    helper:helper_id(id,name,avatar_initials,avatar_color,role)
  `).order('created_at', { ascending: false })

  if (session.role === 'employee') {
    query = query.or(`assignee_id.eq.${session.id},helper_id.eq.${session.id}`)
  } else if (assigneeId) {
    query = query.eq('assignee_id', assigneeId)
  }

  const { data, error } = await query
  if (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }
  return NextResponse.json({ tasks: data })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'manager') return NextResponse.json({ error: 'Forbidden — managers only' }, { status: 403 })

  const db = getSupabaseAdmin()

  // Log env vars presence (not values) for debugging
  console.log('Supabase URL set:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('Supabase Service Key set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  let body
  try {
    body = await req.json()
  } catch (e) {
    console.error('Failed to parse request body:', e)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { title, description, assignee_id, helper_id, priority, tag, due_date, status } = body
  console.log('Creating task:', { title, assignee_id, priority, status })

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!assignee_id) return NextResponse.json({ error: 'Assignee is required' }, { status: 400 })

  const insertData = {
    title,
    description: description || null,
    assignee_id,
    helper_id: helper_id || null,
    priority: priority || 'Medium',
    tag: tag || null,
    due_date: due_date || null,
    status: status || 'To Do',
    created_by: session.id,
    progress: 0,
    attention_needed: false,
  }

  console.log('Insert payload:', insertData)

  const { data, error } = await db
    .from('tasks')
    .insert(insertData)
    .select(`
      *, 
      assignee:assignee_id(id,name,avatar_initials,avatar_color), 
      helper:helper_id(id,name,avatar_initials,avatar_color)
    `)
    .single()

  if (error) {
    console.error('Task insert error:', error)
    return NextResponse.json({
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    }, { status: 500 })
  }

  // Log activity (non-blocking)
  await db.from('task_activity').insert({
    task_id: data.id,
    user_id: session.id,
    action: 'created',
    new_value: title,
  }).then(({ error: actErr }) => {
    if (actErr) console.error('Activity log error (non-fatal):', actErr)
  })

  return NextResponse.json({ task: data })
}

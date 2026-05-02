import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = getSupabaseAdmin()
  const body = await req.json()

  const { data: current } = await db.from('tasks').select('*').eq('id', id).single()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.role === 'employee' && current.assignee_id !== session.id && current.helper_id !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let updatePayload: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() }
  if (session.role === 'employee') {
    const allowed = ['status', 'progress', 'notes', 'attention_needed', 'attention_reason', 'updated_at']
    updatePayload = Object.fromEntries(Object.entries(updatePayload).filter(([k]) => allowed.includes(k)))
  }

  const { data, error } = await db.from('tasks').update(updatePayload).eq('id', id)
    .select(`*, assignee:assignee_id(id,name,avatar_initials,avatar_color), helper:helper_id(id,name,avatar_initials,avatar_color)`).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log changes
  if (body.status && body.status !== current.status)
    await db.from('task_activity').insert({ task_id: id, user_id: session.id, action: 'status_changed', old_value: current.status, new_value: body.status })
  if (body.progress !== undefined && body.progress !== current.progress)
    await db.from('task_activity').insert({ task_id: id, user_id: session.id, action: 'progress_updated', old_value: String(current.progress), new_value: String(body.progress) })
  if (body.helper_id !== undefined && body.helper_id !== current.helper_id)
    await db.from('task_activity').insert({ task_id: id, user_id: session.id, action: 'helper_assigned', new_value: body.helper_id })
  if (body.attention_needed && !current.attention_needed)
    await db.from('task_activity').insert({ task_id: id, user_id: session.id, action: 'attention_flagged', new_value: body.attention_reason })

  return NextResponse.json({ task: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = getSupabaseAdmin()
  const { error } = await db.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

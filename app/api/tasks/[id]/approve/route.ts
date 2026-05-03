import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { action } = await req.json() // 'approve' | 'reject'
  const db = getSupabaseAdmin()

  const { data, error } = await db.from('tasks')
    .update({ approval_status: action === 'approve' ? 'approved' : 'rejected', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('task_activity').insert({
    task_id: id, user_id: session.id,
    action: action === 'approve' ? 'task_approved' : 'task_rejected',
    new_value: action,
  })

  return NextResponse.json({ task: data })
}

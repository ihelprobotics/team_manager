import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { data, error } = await db.from('users').select('id,name,email,role,avatar_initials,avatar_color,created_at').eq('role', 'employee').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { name, email, password, avatar_color } = await req.json()
  if (!name || !email || !password) return NextResponse.json({ error: 'Name, email, and password required' }, { status: 400 })

  const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
  const { data, error } = await db.from('users').insert({
    name, email: email.toLowerCase().trim(),
    password_hash: `$plain$${password}`,
    role: 'employee', avatar_initials: initials,
    avatar_color: avatar_color || '#378ADD',
  }).select('id,name,email,role,avatar_initials,avatar_color').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'manager') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { id } = await req.json()
  const { error } = await db.from('users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

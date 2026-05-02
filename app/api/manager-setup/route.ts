import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// One-time route to seed the manager account on first deploy
export async function POST(req: NextRequest) {
  const { secret, name, email, password } = await req.json()
  if (secret !== process.env.MANAGER_SETUP_SECRET) {
    return NextResponse.json({ error: 'Invalid setup secret' }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
  const { data, error } = await db.from('users').insert({
    name, email: email.toLowerCase().trim(),
    password_hash: `$plain$${password}`,
    role: 'manager', avatar_initials: initials,
    avatar_color: '#534AB7',
  }).select('id,name,email,role').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data, message: 'Manager account created!' })
}

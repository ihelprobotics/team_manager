import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { encodeSession, SESSION_COOKIE_NAME } from '@/lib/auth'
import { SessionUser } from '@/lib/types'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: user, error } = await db
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  // Dev: passwords stored as $plain$xxx. In production replace with bcrypt.
  const hash = user.password_hash as string
  const validPassword = hash === password || hash === `$plain$${password}`
  if (!validPassword) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  const sessionUser: SessionUser = {
    id: user.id as string,
    email: user.email as string,
    name: user.name as string,
    role: user.role as 'employee' | 'manager',
    avatar_initials: (user.avatar_initials as string) || (user.name as string).slice(0,2).toUpperCase(),
    avatar_color: (user.avatar_color as string) || '#378ADD',
  }

  const response = NextResponse.json({ user: sessionUser })
  response.cookies.set(SESSION_COOKIE_NAME, encodeSession(sessionUser), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return response
}

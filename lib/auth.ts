import { cookies } from 'next/headers'
import { SessionUser } from './types'

const SESSION_COOKIE = 'taskflow_session'

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as SessionUser
  } catch {
    return null
  }
}

export function encodeSession(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user)).toString('base64')
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE

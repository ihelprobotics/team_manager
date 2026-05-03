import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function Home() {
  const session = await getSession()
  if (session) {
    redirect(session.role === 'manager' ? '/manager' : '/employee')
  }
  // Home always goes to employee login
  redirect('/login')
}

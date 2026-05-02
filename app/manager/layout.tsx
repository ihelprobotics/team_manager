import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'manager') redirect('/employee')
  return <>{children}</>
}

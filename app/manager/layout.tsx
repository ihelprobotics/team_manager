import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  // Not logged in → send to admin login (not the employee login)
  if (!session) redirect('/admin')
  // Logged in but not manager → send to employee dashboard
  if (session.role !== 'manager') redirect('/employee')
  return <>{children}</>
}

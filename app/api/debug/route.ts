import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// Temporary debug endpoint — remove after fixing issues
// Visit /api/debug to see exactly what's failing
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'manager') {
    return NextResponse.json({ error: 'Manager session required' }, { status: 401 })
  }

  const results: Record<string, unknown> = {
    session: { id: session.id, role: session.role, name: session.name },
    env: {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      geminiKey: !!process.env.GEMINI_API_KEY,
    },
  }

  try {
    const db = getSupabaseAdmin()

    // Test SELECT
    const { data: users, error: usersErr } = await db.from('users').select('id,name,role').limit(3)
    results.usersSelect = usersErr ? { error: usersErr.message, code: usersErr.code } : { ok: true, count: users?.length }

    // Test SELECT tasks
    const { data: tasks, error: tasksErr } = await db.from('tasks').select('id,title').limit(3)
    results.tasksSelect = tasksErr ? { error: tasksErr.message, code: tasksErr.code } : { ok: true, count: tasks?.length }

    // Test INSERT into tasks with a dummy row then immediately delete it
    const { data: inserted, error: insertErr } = await db.from('tasks').insert({
      title: '__debug_test__',
      status: 'To Do',
      priority: 'Low',
      assignee_id: session.id,
      created_by: session.id,
      progress: 0,
      attention_needed: false,
    }).select('id').single()

    if (insertErr) {
      results.tasksInsert = { error: insertErr.message, code: insertErr.code, hint: insertErr.hint, details: insertErr.details }
    } else {
      results.tasksInsert = { ok: true }
      // Clean up
      await db.from('tasks').delete().eq('id', inserted.id)
    }

    // Test Gemini API key
    const geminiTest = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }] }),
      }
    )
    const geminiData = await geminiTest.json()
    results.geminiApi = geminiData.error
      ? { error: geminiData.error.message, code: geminiData.error.code }
      : { ok: true, response: geminiData.candidates?.[0]?.content?.parts?.[0]?.text }

  } catch (e) {
    results.exception = String(e)
  }

  return NextResponse.json(results, { status: 200 })
}

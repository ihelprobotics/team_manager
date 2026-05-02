import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { message, history } = await req.json()

  const { data: tasks } = await db.from('tasks').select('id,title,status,progress,notes,priority,tag,due_date,attention_needed').or(`assignee_id.eq.${session.id},helper_id.eq.${session.id}`)

  type TaskRow = { id: string; title: string; status: string; progress: number; priority: string; notes?: string }
  const taskList = ((tasks || []) as TaskRow[]).map(t =>
    `- [ID:${t.id}] "${t.title}" | Status: ${t.status} | Progress: ${t.progress}% | Priority: ${t.priority}${t.notes ? ` | Notes: ${t.notes}` : ''}`
  ).join('\n')

  const systemPrompt = `You are a friendly task update assistant for ${session.name} at TaskFlow.

Their current tasks:
${taskList || '(No tasks assigned yet)'}

When the employee tells you about their work:
1. Understand which task(s) they are updating
2. Extract new status, progress %, and any notes
3. Reply warmly in 2-3 sentences, confirming what you understood
4. If they mention being stuck, blocked, or needing help — set attention_needed:true

End your reply with a JSON block between <<<JSON>>> markers:
<<<JSON>>>
{
  "updates": [
    {
      "taskId": "<uuid>",
      "taskTitle": "<title>",
      "newStatus": "<To Do|In Progress|Done|Blocked>",
      "newProgress": <0-100>,
      "notes": "<brief note>",
      "attention_needed": <true|false>,
      "attention_reason": "<reason if flagged, else empty>",
      "statusChange": { "from": "<old>", "to": "<new>" },
      "progressChange": { "from": <old>, "to": <new> }
    }
  ]
}
<<<JSON>>>

Only include the JSON block if there are real task updates. Skip it for general chat.`

  type MsgRow = { role: string; content: string }
  const messages = [
    ...((history || []) as MsgRow[]).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ]

  const geminiMessages = [
  { role: 'user', parts: [{ text: systemPrompt + '\n\n' + messages.map((m: {role:string;content:string}) => `${m.role === 'user' ? 'Employee' : 'Assistant'}: ${m.content}`).join('\n') }] }
]

  const apiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: geminiMessages }),
    }
  )

  const aiData = await apiResp.json()
  const fullText: string = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not process that.'
    
  let displayText = fullText
  let updates = null

  const jsonMatch = fullText.match(/<<<JSON>>>([\s\S]*?)<<<JSON>>>/)
  if (jsonMatch) {
    displayText = fullText.replace(/<<<JSON>>>[\s\S]*?<<<JSON>>>/, '').trim()
    try {
      const parsed = JSON.parse(jsonMatch[1].trim())
      updates = parsed.updates || []
      for (const u of updates) {
        const patch: Record<string, unknown> = { status: u.newStatus, progress: u.newProgress, notes: u.notes, updated_at: new Date().toISOString() }
        if (u.attention_needed) { patch.attention_needed = true; patch.attention_reason = u.attention_reason }
        await db.from('tasks').update(patch).eq('id', u.taskId)
        if (u.statusChange) await db.from('task_activity').insert({ task_id: u.taskId, user_id: session.id, action: 'status_changed', old_value: u.statusChange.from, new_value: u.statusChange.to })
        if (u.progressChange) await db.from('task_activity').insert({ task_id: u.taskId, user_id: session.id, action: 'progress_updated', old_value: String(u.progressChange.from), new_value: String(u.progressChange.to) })
        if (u.attention_needed) await db.from('task_activity').insert({ task_id: u.taskId, user_id: session.id, action: 'attention_flagged', new_value: u.attention_reason })
      }
    } catch(e) { console.error('Parse error:', e) }
  }

  await db.from('chat_messages').insert([
    { user_id: session.id, role: 'user', content: message },
    { user_id: session.id, role: 'assistant', content: displayText, task_updates: updates },
  ])

  return NextResponse.json({ reply: displayText, updates })
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { data } = await db.from('chat_messages').select('*').eq('user_id', session.id).order('created_at', { ascending: true }).limit(50)
  return NextResponse.json({ messages: data || [] })
}

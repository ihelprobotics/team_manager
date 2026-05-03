import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { message, history } = await req.json()

  const { data: tasks } = await db
    .from('tasks')
    .select('id,title,status,progress,notes,priority,tag,due_date,attention_needed')
    .or(`assignee_id.eq.${session.id},helper_id.eq.${session.id}`)

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
3. Reply warmly in 2-3 sentences confirming what you understood
4. If they mention being stuck, blocked, or needing help — set attention_needed to true

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
      "attention_reason": "<reason if flagged, else empty string>",
      "statusChange": { "from": "<old status>", "to": "<new status>" },
      "progressChange": { "from": <old number>, "to": <new number> }
    }
  ]
}
<<<JSON>>>

Only include the JSON block if there are real task updates. Skip it for general chat.`

  type MsgRow = { role: string; content: string }

  // Build Gemini conversation — inject system prompt into first user message
  const conversationText = ((history || []) as MsgRow[])
    .map(m => `${m.role === 'user' ? 'Employee' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const fullUserMessage = conversationText
    ? `${systemPrompt}\n\nConversation so far:\n${conversationText}\n\nEmployee: ${message}`
    : `${systemPrompt}\n\nEmployee: ${message}`

  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: fullUserMessage }] }],
    generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
  }

  let fullText = 'Sorry, I could not process that.'

  try {
    const apiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    )

    const aiData = await apiResp.json()

    // Log for debugging (visible in Vercel function logs)
    if (aiData.error) {
      console.error('Gemini API error:', JSON.stringify(aiData.error))
      return NextResponse.json({ reply: `AI error: ${aiData.error?.message || 'Unknown error'}`, updates: null })
    }

    fullText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not process that.'
  } catch (err) {
    console.error('Gemini fetch error:', err)
    return NextResponse.json({ reply: 'Could not reach AI service. Please try again.', updates: null })
  }

  let displayText = fullText
  let updates = null

  const jsonMatch = fullText.match(/<<<JSON>>>([\s\S]*?)<<<JSON>>>/)
  if (jsonMatch) {
    displayText = fullText.replace(/<<<JSON>>>[\s\S]*?<<<JSON>>>/, '').trim()
    try {
      const parsed = JSON.parse(jsonMatch[1].trim())
      updates = parsed.updates || []
      for (const u of updates) {
        const patch: Record<string, unknown> = {
          status: u.newStatus,
          progress: u.newProgress,
          notes: u.notes,
          updated_at: new Date().toISOString(),
        }
        if (u.attention_needed) {
          patch.attention_needed = true
          patch.attention_reason = u.attention_reason
        }
        await db.from('tasks').update(patch).eq('id', u.taskId)
        if (u.statusChange)
          await db.from('task_activity').insert({ task_id: u.taskId, user_id: session.id, action: 'status_changed', old_value: u.statusChange.from, new_value: u.statusChange.to })
        if (u.progressChange)
          await db.from('task_activity').insert({ task_id: u.taskId, user_id: session.id, action: 'progress_updated', old_value: String(u.progressChange.from), new_value: String(u.progressChange.to) })
        if (u.attention_needed)
          await db.from('task_activity').insert({ task_id: u.taskId, user_id: session.id, action: 'attention_flagged', new_value: u.attention_reason })
      }
    } catch (e) {
      console.error('JSON parse error:', e)
    }
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
  const { data } = await db
    .from('chat_messages')
    .select('*')
    .eq('user_id', session.id)
    .order('created_at', { ascending: true })
    .limit(50)
  return NextResponse.json({ messages: data || [] })
}

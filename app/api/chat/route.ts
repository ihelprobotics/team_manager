import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

async function callAI(prompt: string): Promise<string> {
  // 1. Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1200, temperature: 0.3,
        }),
      })
      const d = await res.json()
      if (d.choices?.[0]?.message?.content) return d.choices[0].message.content
    } catch (e) { console.error('Groq failed:', e) }
  }
  // 2. Gemini
  if (process.env.GEMINI_API_KEY) {
    for (const model of ['gemini-1.5-flash-8b', 'gemini-2.0-flash']) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.3 } }) }
        )
        const d = await res.json()
        if (d.candidates?.[0]?.content?.parts?.[0]?.text) return d.candidates[0].content.parts[0].text
      } catch (e) { console.error(`Gemini ${model} failed:`, e) }
    }
  }
  // 3. OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://ihelprobotics.online' },
        body: JSON.stringify({ model: 'meta-llama/llama-3.1-8b-instruct:free', messages: [{ role: 'user', content: prompt }], max_tokens: 1200 }),
      })
      const d = await res.json()
      if (d.choices?.[0]?.message?.content) return d.choices[0].message.content
    } catch (e) { console.error('OpenRouter failed:', e) }
  }
  throw new Error('All AI providers failed')
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { message, history } = await req.json()

  const { data: tasks } = await db
    .from('tasks')
    .select('id,title,status,progress,notes,priority,tag')
    .or(`assignee_id.eq.${session.id},helper_id.eq.${session.id}`)

  type TaskRow = { id: string; title: string; status: string; progress: number; priority: string; notes?: string }
  const taskList = ((tasks || []) as TaskRow[]).map(t =>
    `ID:${t.id} | "${t.title}" | Status:${t.status} | Progress:${t.progress}% | Priority:${t.priority}${t.notes ? ` | Notes:${t.notes}` : ''}`
  ).join('\n')

  type MsgRow = { role: string; content: string }
  const history10 = ((history || []) as MsgRow[]).slice(-10)
    .map(m => `${m.role === 'user' ? 'EMPLOYEE' : 'ASSISTANT'}: ${m.content}`).join('\n')

  // CRITICAL: Force JSON output always
  const prompt = `You are a task tracking assistant. Employee: ${session.name}.

EMPLOYEE TASKS (use exact IDs when updating):
${taskList || 'No tasks assigned yet.'}

${history10 ? `RECENT CONVERSATION:\n${history10}\n` : ''}
EMPLOYEE SAYS: "${message}"

YOUR JOB:
1. Write a warm 1-2 sentence reply acknowledging what they said.
2. Figure out which tasks are being updated based on what they said.
3. ALWAYS output a JSON block at the end — even if no updates, output empty updates array.

RULES FOR JSON:
- Match task by name similarity if ID not mentioned
- If employee says "done" / "finished" / "completed" → newStatus = "Done", newProgress = 100
- If employee says "working on" / "started" / "in progress" → newStatus = "In Progress"  
- If employee says "blocked" / "stuck" / "can't" / "issue" → newStatus = "Blocked", attention_needed = true
- If employee mentions a % number → use that as newProgress
- Only include tasks that were actually mentioned

RESPOND IN THIS EXACT FORMAT (reply first, then JSON):

<reply>Your friendly 1-2 sentence acknowledgment here.</reply>

<taskupdates>
{
  "updates": [
    {
      "taskId": "exact-uuid-from-list-above",
      "taskTitle": "exact task title",
      "newStatus": "In Progress",
      "newProgress": 60,
      "notes": "brief note from what employee said",
      "attention_needed": false,
      "attention_reason": "",
      "statusChange": { "from": "To Do", "to": "In Progress" },
      "progressChange": { "from": 0, "to": 60 }
    }
  ]
}
</taskupdates>`

  let fullText: string
  try {
    fullText = await callAI(prompt)
    console.log('AI raw response:', fullText.slice(0, 500))
  } catch (err) {
    console.error('AI failed:', err)
    return NextResponse.json({ reply: 'AI temporarily unavailable. Please try again.', updates: null })
  }

  // Parse reply
  const replyMatch = fullText.match(/<reply>([\s\S]*?)<\/reply>/)
  let displayText = replyMatch ? replyMatch[1].trim() : fullText.replace(/<taskupdates>[\s\S]*?<\/taskupdates>/g, '').trim()

  // Parse updates — try XML tags first, then fallback to JSON in text
  let updates: TaskRow[] | null = null
  const xmlMatch = fullText.match(/<taskupdates>([\s\S]*?)<\/taskupdates>/)
  const jsonStr = xmlMatch ? xmlMatch[1].trim() : null

  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr)
      updates = parsed.updates || []
    } catch {
      // Try to extract just the JSON object
      const objMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (objMatch) {
        try { updates = JSON.parse(objMatch[0]).updates || [] } catch { /* skip */ }
      }
    }
  }

  // Apply updates to database
  if (updates && updates.length > 0) {
    type UpdateRow = { taskId: string; newStatus: string; newProgress: number; notes: string; attention_needed: boolean; attention_reason: string; statusChange?: { from: string; to: string }; progressChange?: { from: number; to: number } }
    for (const u of (updates as unknown) as UpdateRow[]) {
      if (!u.taskId) continue
      const patch: Record<string, unknown> = {
        status: u.newStatus,
        progress: u.newProgress,
        updated_at: new Date().toISOString(),
      }
      if (u.notes) patch.notes = u.notes
      if (u.attention_needed) {
        patch.attention_needed = true
        patch.attention_reason = u.attention_reason
      }

      const { error: upErr } = await db.from('tasks').update(patch).eq('id', u.taskId)
      if (upErr) console.error('Task update error:', upErr)

      // Log activity
      const acts = []
      if (u.statusChange?.from !== u.statusChange?.to && u.statusChange)
        acts.push({ task_id: u.taskId, user_id: session.id, action: 'status_changed', old_value: u.statusChange.from, new_value: u.statusChange.to })
      if (u.progressChange?.from !== u.progressChange?.to && u.progressChange)
        acts.push({ task_id: u.taskId, user_id: session.id, action: 'progress_updated', old_value: String(u.progressChange.from), new_value: String(u.progressChange.to) })
      if (u.attention_needed)
        acts.push({ task_id: u.taskId, user_id: session.id, action: 'attention_flagged', new_value: u.attention_reason })
      if (acts.length) await db.from('task_activity').insert(acts)
    }
  }

  // Save messages
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
  const { data } = await db.from('chat_messages').select('*').eq('user_id', session.id)
    .order('created_at', { ascending: true }).limit(100)
  return NextResponse.json({ messages: data || [] })
}

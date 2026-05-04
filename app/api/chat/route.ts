import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

async function callAI(prompt: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.3 }),
      })
      const d = await res.json()
      if (d.choices?.[0]?.message?.content) return d.choices[0].message.content
    } catch (e) { console.error('Groq failed:', e) }
  }
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

  const prompt = `You are a task tracking assistant. Employee: ${session.name}.

EMPLOYEE TASKS (use exact IDs):
${taskList || 'No tasks assigned yet.'}

${history10 ? `RECENT CONVERSATION:\n${history10}\n` : ''}
EMPLOYEE SAYS: "${message}"

YOUR JOB:
1. Write a warm 1-2 sentence reply acknowledging what they said.
2. Extract task updates from what they said.
3. Write a SHORT one-line bullet summary of the update (for manager's daily report).

RULES:
- "done/finished/completed" → newStatus="Done", newProgress=100
- "working on/started/in progress" → newStatus="In Progress"
- "blocked/stuck/can't/issue/problem" → newStatus="Blocked", attention_needed=true
- "%" number mentioned → use as newProgress
- Only include tasks actually mentioned

RESPOND IN THIS EXACT FORMAT:

<reply>Your 1-2 sentence acknowledgment here.</reply>

<bullet>One-line summary for manager, e.g: "Completed login redesign (100%)" or "Working on API auth bug — 70% done, blocked on token refresh"</bullet>

<taskupdates>
{
  "updates": [
    {
      "taskId": "exact-uuid",
      "taskTitle": "exact title",
      "newStatus": "In Progress",
      "newProgress": 70,
      "notes": "brief note",
      "attention_needed": false,
      "attention_reason": "",
      "statusChange": { "from": "To Do", "to": "In Progress" },
      "progressChange": { "from": 0, "to": 70 }
    }
  ]
}
</taskupdates>`

  let fullText: string
  try {
    fullText = await callAI(prompt)
  } catch (err) {
    console.error('AI failed:', err)
    return NextResponse.json({ reply: 'AI temporarily unavailable. Please try again.', updates: null })
  }

  // Parse reply
  const replyMatch = fullText.match(/<reply>([\s\S]*?)<\/reply>/)
  const displayText = replyMatch
    ? replyMatch[1].trim()
    : fullText.replace(/<bullet>[\s\S]*?<\/bullet>/g, '').replace(/<taskupdates>[\s\S]*?<\/taskupdates>/g, '').trim()

  // Parse bullet
  const bulletMatch = fullText.match(/<bullet>([\s\S]*?)<\/bullet>/)
  const bulletText = bulletMatch ? bulletMatch[1].trim() : null

  // Parse task updates
  let updates: unknown[] | null = null
  const xmlMatch = fullText.match(/<taskupdates>([\s\S]*?)<\/taskupdates>/)
  if (xmlMatch) {
    try {
      const parsed = JSON.parse(xmlMatch[1].trim())
      updates = parsed.updates || []
    } catch {
      const objMatch = xmlMatch[1].match(/\{[\s\S]*\}/)
      if (objMatch) {
        try { updates = JSON.parse(objMatch[0]).updates || [] } catch { /* skip */ }
      }
    }
  }

  // Apply task updates to DB
  type UpdateRow = {
    taskId: string; newStatus: string; newProgress: number; notes: string
    attention_needed: boolean; attention_reason: string
    statusChange?: { from: string; to: string }; progressChange?: { from: number; to: number }
    taskTitle: string
  }

  const appliedUpdates: UpdateRow[] = []

  if (updates && updates.length > 0) {
    for (const u of (updates as unknown) as UpdateRow[]) {
      if (!u.taskId) continue
      const patch: Record<string, unknown> = {
        status: u.newStatus, progress: u.newProgress, updated_at: new Date().toISOString(),
      }
      if (u.notes) patch.notes = u.notes
      if (u.attention_needed) { patch.attention_needed = true; patch.attention_reason = u.attention_reason }

      const { error: upErr } = await db.from('tasks').update(patch).eq('id', u.taskId)
      if (upErr) { console.error('Task update error:', upErr); continue }
      appliedUpdates.push(u)

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

  // Add bullet to daily summary if there were real updates or a meaningful message
  if (bulletText && (appliedUpdates.length > 0 || message.length > 20)) {
    const firstUpdate = appliedUpdates[0]
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const newBullet = {
      text: bulletText,
      task_title: firstUpdate?.taskTitle || null,
      action: firstUpdate?.newStatus || 'update',
      timestamp: now,
    }

    const { data: existing } = await db.from('daily_summaries')
      .select('id,bullet_points')
      .eq('user_id', session.id)
      .eq('date', today)
      .maybeSingle()

    if (existing) {
      const bullets = Array.isArray(existing.bullet_points) ? existing.bullet_points : []
      bullets.push(newBullet)
      await db.from('daily_summaries').update({ bullet_points: bullets, last_updated: now }).eq('id', existing.id)
    } else {
      await db.from('daily_summaries').insert({ user_id: session.id, date: today, bullet_points: [newBullet], last_updated: now })
    }
  }

  // Save chat messages
  await db.from('chat_messages').insert([
    { user_id: session.id, role: 'user', content: message },
    { user_id: session.id, role: 'assistant', content: displayText, task_updates: appliedUpdates.length ? appliedUpdates : null },
  ])

  return NextResponse.json({ reply: displayText, updates: appliedUpdates })
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { data } = await db.from('chat_messages').select('*').eq('user_id', session.id)
    .order('created_at', { ascending: true }).limit(100)
  return NextResponse.json({ messages: data || [] })
}

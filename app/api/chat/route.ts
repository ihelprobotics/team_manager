import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// ─── AI Provider cascade ────────────────────────────────────────────
// Tries each provider in order until one works.
// All are free forever with no credit card required.
// ────────────────────────────────────────────────────────────────────

async function callAI(prompt: string): Promise<string> {
  const errors: string[] = []

  // ── 1. Groq (FREE — Llama 3.1 8B, 14,400 req/day free, no card) ──
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      })
      const data = await res.json()
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content
      }
      errors.push(`Groq: ${data.error?.message || 'No response'}`)
    } catch (e) {
      errors.push(`Groq exception: ${e}`)
    }
  }

  // ── 2. Gemini 1.5 Flash 8B (FREE tier fallback — 1000 req/day) ──
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1000 },
          }),
        }
      )
      const data = await res.json()
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text
      }
      errors.push(`Gemini 1.5-flash-8b: ${data.error?.message || 'No response'}`)
    } catch (e) {
      errors.push(`Gemini exception: ${e}`)
    }
  }

  // ── 3. Gemini 2.0 Flash (second Gemini fallback) ──
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1000 },
          }),
        }
      )
      const data = await res.json()
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text
      }
      errors.push(`Gemini 2.0-flash: ${data.error?.message || 'No response'}`)
    } catch (e) {
      errors.push(`Gemini 2.0 exception: ${e}`)
    }
  }

  // ── 4. OpenRouter free tier (FREE — many models, no card needed) ──
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://ihelprobotics.online',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
        }),
      })
      const data = await res.json()
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content
      }
      errors.push(`OpenRouter: ${data.error?.message || 'No response'}`)
    } catch (e) {
      errors.push(`OpenRouter exception: ${e}`)
    }
  }

  console.error('All AI providers failed:', errors)
  throw new Error(`All AI providers failed: ${errors.join(' | ')}`)
}

// ─── Main route ──────────────────────────────────────────────────────

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

  type MsgRow = { role: string; content: string }
  const conversationText = ((history || []) as MsgRow[])
    .map(m => `${m.role === 'user' ? 'Employee' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const prompt = `You are a friendly task update assistant for ${session.name} at TaskFlow.

Their current tasks:
${taskList || '(No tasks assigned yet)'}

When the employee tells you about their work:
1. Understand which task(s) they are updating
2. Extract new status, progress %, and any notes  
3. Reply warmly in 2-3 sentences confirming what you understood
4. If they mention being stuck, blocked, or needing help — set attention_needed to true

${conversationText ? `Conversation so far:\n${conversationText}\n` : ''}Employee: ${message}

End your reply with a JSON block between <<<JSON>>> markers ONLY if there are real task updates:
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

Skip the JSON block entirely for general chat with no task updates.`

  let fullText: string
  try {
    fullText = await callAI(prompt)
  } catch (err) {
    console.error('AI call failed:', err)
    return NextResponse.json({
      reply: 'The AI assistant is temporarily unavailable. Your task updates have NOT been saved — please try again in a moment.',
      updates: null,
    })
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

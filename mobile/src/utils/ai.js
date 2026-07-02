// ─────────────────────────────────────────────────────────────
// API key loaded from .env (EXPO_PUBLIC_ANTHROPIC_KEY=sk-ant-...)
// Never hardcode the key here — keep it in mobile/.env (gitignored)
const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY || ''
// ─────────────────────────────────────────────────────────────

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001' // fast + cost-effective for in-app use

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY SANITIZATION
// These are the ONLY fields from a task object that are ever allowed to leave
// the device toward the Claude API. No user IDs, names, emails, or teacher
// identifiers are included — even if a future caller accidentally passes a
// full task/user object.
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeTask(task) {
  return {
    title: task.title,                               // piece/task name only
    category: task.category,                         // e.g. "repertoire"
    estimated_minutes: task.estimated_minutes,
    total_time_practiced: task.total_time_practiced,
    due_date: task.due_date ?? null,
    // Explicitly excluded: id, user_id, teacher_id, ensemble_id, status, created_at
  }
}

// Strip note objects down to content + date only. The note ID and user_id
// stay in the app and are never sent outbound.
function sanitizeNotes(notes) {
  return notes.map(n => ({
    content: n.content,
    date: new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))
}

async function callClaude(prompt, maxTokens = 400) {
  if (!CLAUDE_API_KEY) {
    throw new Error('Add your Claude API key to mobile/.env as EXPO_PUBLIC_ANTHROPIC_KEY')
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.content[0].text
}

// Parse natural language into a structured practice task
export async function parseTask(text) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })

  const prompt = `Today is ${dayName}, ${todayStr}. Parse this music practice task description into structured data.

Input: "${text}"

Return ONLY a JSON object — no markdown, no explanation:
{
  "title": "short descriptive title (piece name + focus area)",
  "category": "repertoire",
  "estimated_minutes": 30,
  "difficulty": 3,
  "due_date": null
}

Rules:
- title: concise, e.g. "Autumn Leaves - Solo Changes" not the full sentence
- category: one of repertoire, technique, sight_reading, section_work
- estimated_minutes: number (default 30 if not mentioned)
- difficulty: 1-5 stars based on how hard it sounds (default 3)
- due_date: ISO date string (YYYY-MM-DD) if a deadline is mentioned, otherwise null
  - "by Wednesday" → next Wednesday's date relative to today
  - "by tonight" or "today" → today's date
  - "this week" → next Sunday's date`

  const raw = await callClaude(prompt, 300)
  const clean = raw.replace(/```json\n?|```\n?/g, '').trim()
  return JSON.parse(clean)
}

// Generate 3 short, personalised reflection prompts for a just-finished session.
// Grounded in the pieces practiced, their goals/deadlines, and how it felt.
// Returns a plain array of strings; falls back to sensible defaults on any error.
const DEFAULT_REFLECTION_PROMPTS = [
  'What went well this session, and what felt hard?',
  'What is the one thing you want to improve before next time?',
  'How did your focus and energy shape how you played today?',
]

export async function getReflectionPrompts(seed = {}) {
  const { minutes, focusRating, progressRating, energyRating, tasks = [], goals = [] } = seed
  const pieces = tasks.map(sanitizeTask)

  if (!CLAUDE_API_KEY) return DEFAULT_REFLECTION_PROMPTS

  const rate = (n) => (n ? `${n}/5` : 'not rated')
  const piecesLine = pieces.length
    ? pieces.map((p) => {
        const due = p.due_date ? `, due ${p.due_date}` : ''
        return `• ${p.title} (${(p.category || 'repertoire').replace('_', ' ')}${due})`
      }).join('\n')
    : 'No specific pieces logged.'

  const goalsLine = goals.length
    ? goals.map((g, i) => `${i + 1}. ${g}`).join('\n')
    : 'No goals set for this entry.'

  const sessionLine = minutes
    ? `A music student just finished a ${minutes}-minute practice session.\nFocus: ${rate(focusRating)}, Progress: ${rate(progressRating)}, Energy: ${rate(energyRating)}.`
    : 'A music student is writing a free-form notebook entry (not tied to a specific session).'

  const prompt = `${sessionLine}

Goals they set for this session:
${goalsLine}

Pieces practiced:
${piecesLine}

Write exactly 3 short reflection prompts to guide their practice-journal entry.
- Reference whether they made headway on their stated goals where relevant — not generic.
- Each one sentence, warm and coaching in tone, ending with a question mark.
- Draw on deliberate-practice thinking (what to fix, why, the next concrete step) without jargon.

Return ONLY a JSON array of 3 strings — no markdown, no explanation:
["...", "...", "..."]`

  try {
    const raw = await callClaude(prompt, 300)
    const clean = raw.replace(/```json\n?|```\n?/g, '').trim()
    const arr = JSON.parse(clean)
    return Array.isArray(arr) && arr.length ? arr.slice(0, 3) : DEFAULT_REFLECTION_PROMPTS
  } catch {
    return DEFAULT_REFLECTION_PROMPTS
  }
}

// Decide the optimal reminder time + write a personalised notification message.
// Claude reads practice notes, due date, and when the user typically practices
// to produce both the message body and the exact send time.
export async function getSmartReminderData(task, notes, recentSessionTimes) {
  const t = sanitizeTask(task)
  const n = sanitizeNotes(notes)

  const now = new Date()
  const nowStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  const dueLine = t.due_date
    ? `Due: ${new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'No due date'

  const minutesLeft = Math.max(0, (t.estimated_minutes || 30) - (t.total_time_practiced || 0))

  const notesSection = n.length > 0
    ? `Practice notes (newest first):\n${n.map(x => `• ${x.content}`).join('\n')}`
    : 'No practice notes yet.'

  const sessionsSection = recentSessionTimes.length > 0
    ? `Recent session times (shows when they typically practice):\n${recentSessionTimes.map(x => `• ${x}`).join('\n')}`
    : 'No session history.'

  const prompt = `Right now: ${nowStr}

Task: "${t.title}" (${(t.category || 'repertoire').replace('_', ' ')})
${dueLine}
Practiced: ${t.total_time_practiced || 0} / ${t.estimated_minutes || 30} min (${minutesLeft} min remaining)

${notesSection}

${sessionsSection}

You are scheduling a push notification reminder for this student. Decide:
1. The best DATE AND TIME to send it — factor in due date urgency, how much practice remains, and when they historically practice. Must be in the future. If no due date, pick within the next 48 hours.
2. A short notification message (1-2 sentences) that is specific and actionable — reference what they've already mastered from the notes and tell them exactly what to focus on next.

Return ONLY valid JSON, no markdown:
{
  "remind_at": "2026-05-08T18:30:00",
  "message": "Your melody is locked in — tonight nail the ii-V-I at bar 8. 25 min left before Friday."
}`

  const raw = await callClaude(prompt, 300)
  const clean = raw.replace(/```json\n?|```\n?/g, '').trim()
  const result = JSON.parse(clean)

  // Safety: if Claude picked a time in the past, default to tomorrow at 6pm
  const remindAt = new Date(result.remind_at)
  if (isNaN(remindAt.getTime()) || remindAt <= now) {
    const fallback = new Date(now)
    fallback.setDate(fallback.getDate() + 1)
    fallback.setHours(18, 0, 0, 0)
    result.remind_at = fallback.toISOString()
  }

  return result
}

// Generate the pre-session intention question.
// Asks a forward-looking question grounded in the student's actual tasks
// and recent logs — not "how do you feel?" but "what specifically are you targeting?"
export async function getPreSessionQuestion(tasks, recentLogs) {
  const taskContext = tasks.slice(0, 5).map(t => {
    const note = t.recentNote ? `, last note: "${t.recentNote}"` : ''
    return `• ${t.title} — ${t.readiness_score || 0}% ready${note}`
  }).join('\n')

  const logContext = recentLogs.slice(0, 3).map(l => {
    const answers = (l.entries || []).map(e => e.a).filter(Boolean).join('; ')
    return `• ${new Date(l.created_at).toLocaleDateString()}: mood ${l.mood_score}/5 — ${answers}`
  }).join('\n') || 'No recent logs.'

  const prompt = `A music student is about to start a practice session. Generate ONE short intention-setting question (1 sentence) to focus their mind before they begin.

Their tasks:
${taskContext || 'No tasks yet.'}

Recent check-in history:
${logContext}

Rules:
- Reference a SPECIFIC piece or passage they need to work on — never ask generically
- Frame it as an intention or goal for this session, not a reflection
- Examples of GOOD questions: "Which bars of the Donnelly B section are you targeting today?" / "Autumn Leaves is at 62% — what specifically do you want to lock in today?"
- Return ONLY the question, no preamble.`

  return callClaude(prompt, 100)
}

// Generate the quick post-session follow-up question.
// Claude reads actual task notes and previous log entries to ask something
// specific — never generic. Returns a single question string.
export async function getQuickFollowUp(lastSession, tasks, recentLogs) {
  const sessionSummary = lastSession
    ? `Just finished: ${lastSession.duration_minutes} min session, focus rating ${lastSession.focus_rating}/5`
    : 'Just finished a practice session.'

  const taskContext = tasks.slice(0, 5).map(t => {
    const notes = t.recentNote ? `last note: "${t.recentNote}"` : 'no notes yet'
    return `• ${t.title} — ${t.total_time_practiced || 0}/${t.estimated_minutes || 30} min logged, readiness ${t.readiness_score || 0}% — ${notes}`
  }).join('\n')

  const logContext = recentLogs.slice(0, 5).map(l => {
    const answers = (l.entries || []).map(e => `Q: ${e.q} → A: ${e.a}`).join('; ')
    return `• ${new Date(l.created_at).toLocaleDateString()}: mood ${l.mood_score}/5 — ${answers}`
  }).join('\n') || 'No previous check-ins.'

  const prompt = `A music student just finished a practice session. Generate ONE specific follow-up question for their post-session log.

${sessionSummary}

Their current tasks and notes:
${taskContext || 'No tasks yet.'}

Recent check-in history:
${logContext}

Rules:
- Reference a SPECIFIC piece, passage, or note from their data — never ask generically
- If a task note mentions something struggling, follow up on exactly that
- If a previous check-in mentioned something, build on it
- Examples of BAD questions: "How did practice feel?" / "Did anything click?"
- Examples of GOOD questions: "Your notes say bar 12 of Autumn Leaves was slipping — did those chord changes feel more natural today?" / "Last time you said the B section on Donnelly felt rushed. Did the slower tempo help?"
- Return ONLY the question, no preamble, no quotes around it.`

  return callClaude(prompt, 150)
}

// Generate the full deep check-in questionnaire.
// Claude reads tasks, notes, mood history, and calendar events to produce
// a set of named, specific questions — not a generic wellness survey.
export async function getDeepCheckInQuestions(tasks, moodLogs, calendarEvents) {
  const taskContext = tasks.slice(0, 8).map(t => {
    const notes = t.recentNote ? `, last note: "${t.recentNote}"` : ''
    return `• ${t.title} (${t.category}) — ${t.readiness_score || 0}% ready, ${t.total_time_practiced || 0} min logged${notes}`
  }).join('\n')

  const moodHistory = moodLogs.slice(0, 10).map(l => {
    const answers = (l.entries || []).map(e => `${e.q}: ${e.a}`).join(' | ')
    return `• ${new Date(l.created_at).toLocaleDateString()}: mood ${l.mood_score}/5 — ${answers}`
  }).join('\n') || 'First check-in.'

  const upcomingEvents = calendarEvents.slice(0, 5).map(e =>
    `• ${e.title} on ${new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
  ).join('\n') || 'No upcoming events.'

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const prompt = `Today is ${today}. Generate a short, targeted check-in questionnaire for a music student. This is their weekly mindful practice journal.

Their tasks and notes:
${taskContext || 'No tasks yet.'}

Mood and check-in history:
${moodHistory}

Upcoming calendar events:
${upcomingEvents}

Generate 5-6 questions. Structure:
1. Always start with mood (emoji scale 1-5, label each: 😴 exhausted → 😐 okay → 😊 good → ⚡ energised)
2. A gratitude question — specific to their music life if possible (e.g. "Name one moment from practice this week that felt good, even small")
3. A frustration/challenge question — reference a specific task or passage from their data that looks stuck
4. A question about something upcoming from their calendar if relevant (e.g. AP exams, a rehearsal)
5. A goal-setting question for the coming week — tied to their actual task list
6. Optionally: a reflection question that builds on a thread from a previous check-in

Rules:
- Every question must reference specific data — piece names, bar numbers, task titles, calendar events. No generic wellness questions.
- Keep each question to 1-2 sentences max.
- Return ONLY a JSON array, no markdown:
[
  { "id": "mood", "type": "emoji_scale", "question": "How are you feeling right now?" },
  { "id": "gratitude", "type": "text", "question": "..." },
  { "id": "frustration", "type": "text", "question": "..." },
  { "id": "upcoming", "type": "text", "question": "..." },
  { "id": "goal", "type": "text", "question": "..." }
]
type is either "emoji_scale" or "text".`

  const raw = await callClaude(prompt, 600)
  const clean = raw.replace(/```json\n?|```\n?/g, '').trim()
  return JSON.parse(clean)
}

// Generate today's targeted practice recommendation.
// Grounded in research: deliberate practice (Ericsson), cognitive load theory,
// interleaved vs blocked practice, spaced retrieval, Pomodoro for high-stress.
export async function getPracticeRecommendation(tasks, moodLogs, calendarEvents, sessionHistory, notebookEntries = null) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const currentHour = new Date().getHours()
  const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'evening'

  const taskContext = tasks.filter(t => t.status !== 'ready').slice(0, 6).map(t => {
    const notes = t.recentNote ? `, note: "${t.recentNote}"` : ''
    const dueStr = t.due_date ? `, due ${new Date(t.due_date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''
    return `• ${t.title} (${t.category}) — ${t.readiness_score || 0}% ready, ${t.total_time_practiced || 0}/${t.estimated_minutes || 30} min${dueStr}${notes}`
  }).join('\n')

  const recentMood = moodLogs.slice(0, 7)
  const avgMood = recentMood.length
    ? (recentMood.reduce((s, l) => s + (l.mood_score || 3), 0) / recentMood.length).toFixed(1)
    : null
  const todayMood = moodLogs[0]
  const moodContext = todayMood
    ? `Today's mood: ${todayMood.mood_score}/5. 7-day average: ${avgMood}/5.`
    : avgMood ? `No check-in today. 7-day mood average: ${avgMood}/5.` : 'No mood data yet.'

  const recentFrustrations = moodLogs
    .flatMap(l => (l.entries || []).filter(e => e.id === 'frustration' && e.a).map(e => e.a))
    .slice(0, 3).map(f => `• "${f}"`).join('\n')

  const upcomingEvents = calendarEvents
    .filter(e => new Date(e.date) >= new Date())
    .slice(0, 5)
    .map(e => `• ${e.title} — ${new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
    .join('\n') || 'Nothing upcoming.'

  const recentSessionMins = sessionHistory.slice(0, 7)
    .reduce((s, sess) => s + (sess.duration_minutes || 0), 0)

  const notebookSection = notebookEntries && notebookEntries.length > 0
    ? `\n${buildNotebookContext(notebookEntries)}`
    : ''

  const prompt = `Today is ${today}, ${timeOfDay}. You are a music practice coach generating today's specific practice recommendation for a student.

Mood & wellbeing:
${moodContext}
${recentFrustrations ? `Recent frustrations from journal:\n${recentFrustrations}` : ''}

Practice tasks (not yet ready):
${taskContext || 'No active tasks.'}

Upcoming calendar events:
${upcomingEvents}

Practice volume this week: ${recentSessionMins} minutes across ${Math.min(sessionHistory.length, 7)} sessions.${notebookSection}

Generate a specific, research-backed practice recommendation for today. You must:

1. NAME the exact task, piece, and passage to work on (e.g. "bars 9-16 of the Donnelly B section" not "work on repertoire")
2. NAME the specific practice METHOD with brief rationale from research:
   - High stress / low energy / big events coming → short targeted session, cognitive load theory, spaced retrieval on one small thing
   - Good mood / high energy → deliberate practice on weakest point, interleaved with a second task
   - Consistent low mood this week → mental practice or listening-based session (reduces performance anxiety)
   - Behind on a due date → blocked repetition at 60-70% tempo, Pomodoro structure
3. Give a SPECIFIC duration and structure (e.g. "25 min: 5 min slow run-through, 15 min bars 9-16 at 60% tempo × 5 reps, 5 min full tempo playthrough")
4. Keep the tone direct and coach-like, 3-5 sentences max. No fluff.

Return ONLY a JSON object:
{
  "headline": "10-min targeted session on Autumn Leaves changes",
  "method": "Spaced retrieval",
  "method_reason": "AP exams this week — cognitive load research shows short, targeted retrieval beats long sessions under high stress",
  "task_focus": "Autumn Leaves — bars 9-16, the ii-V-I turnaround",
  "duration_minutes": 10,
  "structure": "5 min slow hands-only at 60% tempo, 5 min full tempo × 3 reps. Stop there.",
  "full_tip": "You have AP exams tomorrow and your mood has been low all week. Research on cognitive load says this isn't the time for new material — consolidation works better. Spend exactly 10 minutes on bars 9-16 of Autumn Leaves, the ii-V-I you noted is still slipping. Slow tempo, three clean reps. That's it for today."
}`

  const raw = await callClaude(prompt, 500)
  const clean = raw.replace(/```json\n?|```\n?/g, '').trim()
  return JSON.parse(clean)
}

// Build a sanitized notebook context string to include in prompts when
// the user has enabled "Let Claude read my notebook".
export function buildNotebookContext(entries) {
  if (!entries || entries.length === 0) return null
  const lines = entries.slice(0, 10).map(e => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const tag = e.tags?.[0] || 'general'
    const preview = (e.content || '').slice(0, 200).replace(/\n/g, ' ')
    return `• [${date}] "${e.title || 'Untitled'}" (${tag})${preview ? ': ' + preview : ''}`
  })
  return `Recent notebook entries:\n${lines.join('\n')}`
}

// Generate an AI table of contents from the user's notebook entries.
// Groups by theme or time period and writes 1-2 sentence summaries per section.
export async function getNotebookTableOfContents(entries) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const entryList = entries.slice(0, 50).map(e => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const tag = e.tags?.[0] || 'general'
    const preview = (e.content || '').slice(0, 120).replace(/\n/g, ' ')
    return `• [${date}] "${e.title || 'Untitled'}" (${tag})${preview ? ': ' + preview : ''}`
  }).join('\n')

  const prompt = `Today is ${today}. A music student has ${entries.length} notebook entries. Generate a table of contents that organises these into meaningful themes or time periods.

Entries (newest first):
${entryList}

Rules:
- Group by theme (e.g. Practice Reflections, Lesson Notes, Music Writing, Technique) OR by time period — whichever makes more sense
- For each group, write 1-2 sentences summarising patterns you notice — reference specific pieces, concepts, or recurring themes
- Keep it concise — this is a navigation aid, not an essay
- Use plain text: section name in CAPS followed by a brief summary and a short entry list
- No markdown symbols (**, ##, etc.) — just plain text
- Max 350 words

Example format:
PRACTICE REFLECTIONS (8 entries, Mar–May)
Mostly focused on Autumn Leaves chord changes. Energy dips mid-week consistently across three weeks.
  Mar 12 — First crack at the ii-V-I turnaround
  ...

Return only the table of contents text, nothing else.`

  return callClaude(prompt, 600)
}

// Multi-turn Claude call with system prompt and conversation history.
// Used by the AI Chat screen — other functions use callClaude() instead.
async function callClaudeWithHistory(systemPrompt, messages, maxTokens = 600) {
  if (!CLAUDE_API_KEY) {
    throw new Error('Add your Claude API key to mobile/.env as EXPO_PUBLIC_ANTHROPIC_KEY')
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.content[0].text
}

// Freeform coaching chat with full app context in the system prompt.
// history is an array of { role: 'user'|'assistant', text: string }.
// context contains tasks, moodLogs, sessions, calendarEvents, notebookEntries, stats.
export async function getChatResponse(userMessage, history, context) {
  const {
    tasks = [],
    moodLogs = [],
    sessions = [],
    calendarEvents = [],
    notebookEntries = null,
    stats = {},
  } = context

  const taskContext = tasks
    .filter(t => t.status !== 'ready')
    .slice(0, 8)
    .map(t => {
      const s = sanitizeTask(t)
      return `• ${s.title} (${s.category || 'repertoire'}) — ${t.readiness_score || 0}% ready, ${s.total_time_practiced || 0}/${s.estimated_minutes || 30} min practiced`
    }).join('\n') || 'No active tasks.'

  const recentMood = moodLogs.slice(0, 7)
  const avgMood = recentMood.length
    ? (recentMood.reduce((s, l) => s + (l.mood_score || 3), 0) / recentMood.length).toFixed(1)
    : null
  const moodContext = avgMood ? `7-day mood average: ${avgMood}/5` : 'No mood data.'

  const recentFrustrations = moodLogs
    .flatMap(l => (l.entries || []).filter(e => e.id === 'frustration' && e.a).map(e => e.a))
    .slice(0, 2).join('; ')

  const today = new Date()
  const in14Days = new Date(today)
  in14Days.setDate(today.getDate() + 14)
  const upcomingEvents = calendarEvents
    .filter(e => { const d = new Date(e.date); return d >= today && d <= in14Days })
    .slice(0, 5)
    .map(e => `• ${e.title} — ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    .join('\n') || 'Nothing upcoming in next 2 weeks.'

  const sessionContext = sessions.slice(0, 7).map(s =>
    `• ${new Date(s.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${s.duration_minutes} min, focus ${s.focus_rating}/5`
  ).join('\n') || 'No recent sessions.'

  const notebookSection = notebookEntries && notebookEntries.length > 0
    ? `\n${buildNotebookContext(notebookEntries)}`
    : ''

  const statsContext = [
    stats.streak_count > 0 ? `Current streak: ${stats.streak_count} days` : null,
    stats.level ? `Level ${stats.level}` : null,
    stats.weekly_minutes != null ? `This week: ${stats.weekly_minutes} / ${stats.weekly_goal_minutes || 0} min` : null,
  ].filter(Boolean).join(' · ')

  const systemPrompt = `You are a personal music practice coach. You know this student's full practice history — you are NOT a generic chatbot.

Student stats: ${statsContext || 'No stats yet.'}

Active tasks:
${taskContext}

Mood: ${moodContext}${recentFrustrations ? ` Frustrations: "${recentFrustrations}"` : ''}

Recent sessions:
${sessionContext}

Upcoming events (next 14 days):
${upcomingEvents}${notebookSection}

Rules:
- Always reference specific pieces, passages, or data from above — never give generic advice
- Be direct and coach-like, not chatbot-like. Sound like a real human music teacher
- Keep responses concise: 2-4 sentences for most replies
- If asked to recommend repertoire, base it on what they're already working on
- Never mention user IDs, emails, or any technical app internals`

  const apiMessages = [
    ...history.map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: userMessage },
  ]

  return callClaudeWithHistory(systemPrompt, apiMessages, 600)
}

// Generate a personalised coaching tip based on practice history + notes
export async function getCoachingTip(taskTitle, practiceMinutes, notes) {
  const n = sanitizeNotes(notes)
  const notesSection = n.length > 0
    ? `Notes from past sessions:\n${n.map(x => `• ${x.content}`).join('\n')}`
    : 'No practice notes yet.'

  const prompt = `You are a supportive, knowledgeable music coach. Write a short coaching tip (2-3 sentences) for this student's practice task.

Task: "${taskTitle}"
Total time practiced so far: ${practiceMinutes} minutes
${notesSection}

Be specific and actionable. If the notes mention something mastered, focus on what logically comes next. If there are no notes, give a useful starting tip for the task. Sound encouraging, not generic. No bullet points — just natural coach language.`

  return callClaude(prompt, 250)
}

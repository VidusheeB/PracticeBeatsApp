// Supabase Edge Function — invoked every minute via pg_cron.
// 1. Scans notifications that are due and still pending.
// 2. Runs a relevance guard: drops any whose reason no longer holds
//    (task already practiced today, or task deleted) so we never nag.
// 3. Delivers the survivors through Expo push in batched calls.
//
// Every external round-trip is batched — the work is a constant number of
// queries regardless of how many notifications are due (no per-row N+1).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH = 100 // Expo accepts up to 100 messages per request

type Notif = {
  id: string
  user_id: string
  task_id: string | null
  title: string
  body: string
  type: string
}

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // bypasses RLS so we can read all tokens
  )

  const now = new Date()

  // 1. Everything due and still pending
  const { data: pending, error } = await supabase
    .from('scheduled_notifications')
    .select('id, user_id, task_id, title, body, type')
    .eq('status', 'pending')
    .lte('send_at', now.toISOString())
    .limit(200)

  if (error) return json({ error: error.message }, 500)
  if (!pending?.length) return json({ ok: 'nothing due' })

  // 2. Guard — batch-load the tasks behind every task_reminder in one query.
  const taskIds = [...new Set(
    pending.filter((n) => n.type === 'task_reminder' && n.task_id).map((n) => n.task_id!),
  )]
  const taskById = new Map<string, { status: string; last_practiced_date: string | null }>()
  if (taskIds.length) {
    const { data: tasks } = await supabase
      .from('practice_tasks')
      .select('id, status, last_practiced_date')
      .in('id', taskIds)
    for (const t of tasks ?? []) taskById.set(t.id, t)
  }

  // Start of today (Deno Deploy runs in UTC; last_practiced_date is UTC ISO,
  // so lexicographic string comparison is a valid time comparison).
  const startOfToday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  )).toISOString()

  const stillRelevant = (n: Notif): boolean => {
    if (n.type !== 'task_reminder' || !n.task_id) return true // other types: no guard yet
    const task = taskById.get(n.task_id)
    if (!task) return false                                    // task was deleted
    if (task.last_practiced_date && task.last_practiced_date >= startOfToday) return false // already practiced today
    return true
  }

  const deliver = (pending as Notif[]).filter(stillRelevant)
  const suppressed = (pending as Notif[]).filter((n) => !stillRelevant(n))

  // 3. Retire suppressed rows in a single write.
  if (suppressed.length) {
    await supabase.from('scheduled_notifications')
      .update({ status: 'suppressed', sent_at: now.toISOString() })
      .in('id', suppressed.map((n) => n.id))
  }

  if (!deliver.length) {
    return json({ ok: `delivered 0, suppressed ${suppressed.length}` })
  }

  // 4. One token lookup for all recipients, grouped by user.
  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', [...new Set(deliver.map((n) => n.user_id))])

  const tokensByUser = new Map<string, string[]>()
  for (const { user_id, token } of tokenRows ?? []) {
    const arr = tokensByUser.get(user_id) ?? []
    arr.push(token)
    tokensByUser.set(user_id, arr)
  }

  // 5. Fan out to one message per (notification x device), pushed in batches.
  const messages = deliver.flatMap((n) =>
    (tokensByUser.get(n.user_id) ?? []).map((token) => ({
      to: token,
      title: n.title,
      body: n.body,
      sound: 'default',
      channelId: 'practicebeats',
      priority: 'high',
    }))
  )

  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + EXPO_BATCH)),
    })
    if (!res.ok) console.error('Expo push failed:', await res.text())
  }

  // 6. Mark delivered in one write — even rows whose user had no token yet,
  //    so we never retry them in a loop.
  await supabase.from('scheduled_notifications')
    .update({ status: 'sent', sent_at: now.toISOString() })
    .in('id', deliver.map((n) => n.id))

  return json({ ok: `delivered ${deliver.length}, suppressed ${suppressed.length}` })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yqcwvpwzykawwndbyakw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxY3d2cHd6eWthd3duZGJ5YWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDg2ODcsImV4cCI6MjA5MzU4NDY4N30.Bw7OG0xfaLCu450CZUpGqXsWNMSTORGaZCD3DsRKqNI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // required for React Native
  },
})

// ---------------------------------------------------------------------------
// BUSINESS LOGIC (previously in Python backend)
// ---------------------------------------------------------------------------

function calculatePoints(durationMinutes, focusRating, streakCount) {
  let points = durationMinutes
  if (streakCount >= 30) points *= 2
  else if (streakCount >= 7) points *= 1.5
  else if (streakCount >= 3) points *= 1.2
  if (focusRating >= 4) points *= 1.2
  return Math.round(points)
}

function calculateNewStreak(lastPracticeDate, currentStreak) {
  if (!lastPracticeDate) return 1
  const last = new Date(lastPracticeDate)
  const today = new Date()
  last.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today - last) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return currentStreak  // already practiced today
  if (diffDays === 1) return currentStreak + 1  // consecutive day
  return 1  // missed day(s) — reset
}

function calculateReadiness(task, minutesAdded, focusRating) {
  const total = (task.total_time_practiced || 0) + minutesAdded
  const timeScore = Math.min(total / (task.estimated_minutes || 30), 1) * 100
  const qualityScore = focusRating ? (focusRating / 5) * 100 : 0
  const readiness = Math.min(Math.round(timeScore * 0.7 + qualityScore * 0.3), 100)
  const status = total === 0 ? 'not_started' : readiness >= 80 ? 'ready' : 'in_progress'
  return { readiness_score: readiness, status }
}

function getWeekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

async function checkAndAwardBadges(userId, updatedProfile, session) {
  const { data: existing } = await supabase
    .from('badges').select('badge_type').eq('user_id', userId)
  const earned = new Set((existing || []).map(b => b.badge_type))
  const toAward = []

  if (!earned.has('first_session')) toAward.push('first_session')
  if (!earned.has('streak_3') && updatedProfile.streak_count >= 3) toAward.push('streak_3')
  if (!earned.has('streak_7') && updatedProfile.streak_count >= 7) toAward.push('streak_7')
  if (!earned.has('streak_30') && updatedProfile.streak_count >= 30) toAward.push('streak_30')
  if (!earned.has('marathon') && session.duration_minutes >= 60) toAward.push('marathon')
  if (!earned.has('perfect_focus') && session.focus_rating === 5) toAward.push('perfect_focus')
  const hour = new Date(session.start_time).getHours()
  if (!earned.has('early_bird') && hour < 8) toAward.push('early_bird')
  if (!earned.has('night_owl') && hour >= 22) toAward.push('night_owl')

  if (toAward.length > 0) {
    await supabase.from('badges').insert(
      toAward.map(badge_type => ({ user_id: userId, badge_type }))
    )
  }
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

export const auth = {
  async signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: userData.name } },
    })
    if (error) throw new Error(error.message)

    if (data.user) {
      const teacherCode = userData.role === 'teacher'
        ? Math.floor(100000 + Math.random() * 900000).toString()
        : null

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        name: userData.name,
        instrument: userData.instrument || null,
        section: userData.section || 'brass',
        role: userData.role || 'personal',
        teacher_code: teacherCode,
      })
      if (profileError) throw new Error(profileError.message)

      // Link student to teacher if code provided
      if (userData.role === 'student' && userData.teacher_code_to_join) {
        const { data: teacher } = await supabase
          .from('profiles')
          .select('id')
          .eq('teacher_code', userData.teacher_code_to_join)
          .single()
        if (teacher) {
          await supabase.from('profiles')
            .update({ teacher_id: teacher.id })
            .eq('id', data.user.id)
        }
      }
    }

    return data.user
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    return data.user
  },

  async signOut() {
    await supabase.auth.signOut()
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  },
}

// ---------------------------------------------------------------------------
// DATABASE OPERATIONS
// ---------------------------------------------------------------------------

export const db = {
  // Profile
  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', userId).single()
    if (error) throw new Error(error.message)
    return data
  },

  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles').update(updates).eq('id', userId).select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async getUserStats(userId) {
    const weekStart = getWeekStart().toISOString()
    const [{ data: profile, error }, { data: sessions }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('practice_sessions')
        .select('duration_minutes')
        .eq('user_id', userId)
        .gte('start_time', weekStart),
    ])
    if (error) throw new Error(error.message)
    const weeklyMinutes = (sessions || []).reduce((s, r) => s + r.duration_minutes, 0)
    const weeklyGoal = profile.weekly_goal_minutes || 120
    return {
      ...profile,
      weekly_minutes: weeklyMinutes,
      weekly_goal_minutes: weeklyGoal,
      weekly_progress_percent: weeklyGoal > 0 ? (weeklyMinutes / weeklyGoal) * 100 : 0,
    }
  },

  // Tasks
  async getTasks(userId) {
    const { data, error } = await supabase
      .from('practice_tasks').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data
  },

  async createTask(taskData) {
    const { data, error } = await supabase
      .from('practice_tasks').insert(taskData).select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async updateTask(taskId, updates) {
    const { data, error } = await supabase
      .from('practice_tasks').update(updates).eq('id', taskId).select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async deleteTask(taskId) {
    const { error } = await supabase.from('practice_tasks').delete().eq('id', taskId)
    if (error) throw new Error(error.message)
  },

  // Sessions
  async createSession(sessionData, profile) {
    const { tasks, ...fields } = sessionData
    const pointsEarned = calculatePoints(
      fields.duration_minutes, fields.focus_rating, profile.streak_count
    )

    const { data: session, error } = await supabase
      .from('practice_sessions')
      .insert({ ...fields, user_id: profile.id, points_earned: pointsEarned })
      .select().single()
    if (error) throw new Error(error.message)

    // Save session-task breakdown + update each task
    if (tasks?.length) {
      const { error: sessionTasksError } = await supabase.from('session_tasks').insert(
        tasks.map(t => ({ session_id: session.id, task_id: t.task_id, minutes_spent: t.minutes_spent }))
      )
      if (sessionTasksError) throw new Error(sessionTasksError.message)

      const taskIds = tasks.map(t => t.task_id)
      const { data: taskRows, error: tasksError } = await supabase
        .from('practice_tasks')
        .select('*')
        .in('id', taskIds)
      if (tasksError) throw new Error(tasksError.message)

      const taskById = new Map((taskRows || []).map(task => [task.id, task]))
      const practicedAt = new Date().toISOString()
      await Promise.all(tasks.map(async (t) => {
        const task = taskById.get(t.task_id)
        if (task) {
          const updates = calculateReadiness(task, t.minutes_spent, fields.focus_rating)
          const { error: updateError } = await supabase.from('practice_tasks').update({
            ...updates,
            total_time_practiced: (task.total_time_practiced || 0) + t.minutes_spent,
            last_practiced_date: practicedAt,
          }).eq('id', t.task_id)
          if (updateError) throw new Error(updateError.message)
        }
      }))
    }

    // Update profile: streak, points, level
    const newStreak = calculateNewStreak(profile.last_practice_date, profile.streak_count)
    const newPoints = (profile.total_points || 0) + pointsEarned
    const newLevel = Math.floor(newPoints / 100) + 1
    const updatedProfile = { ...profile, streak_count: newStreak, total_points: newPoints, level: newLevel }

    await supabase.from('profiles').update({
      streak_count: newStreak,
      total_points: newPoints,
      level: newLevel,
      last_practice_date: new Date().toISOString(),
    }).eq('id', profile.id)

    await checkAndAwardBadges(profile.id, updatedProfile, session)

    return { ...session, points_earned: pointsEarned }
  },

  async getSessions(userId, startDate, endDate) {
    let query = supabase.from('practice_sessions').select('*').eq('user_id', userId)
    if (startDate) query = query.gte('start_time', startDate)
    if (endDate) query = query.lte('start_time', endDate)
    const { data, error } = await query.order('start_time', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  // Badges
  async getUserBadges(userId) {
    const { data, error } = await supabase.from('badges').select('*').eq('user_id', userId)
    if (error) throw new Error(error.message)
    return data || []
  },

  // Calendar Events
  async getCalendarEvents(userId, options = {}) {
    const {
      startDate = null,
      endDate = null,
      includeEnsembleEvents = true,
    } = options
    let ensembleIds = []
    if (includeEnsembleEvents) {
      const { data: memberRows, error: memberError } = await supabase
        .from('ensemble_members').select('ensemble_id').eq('student_id', userId)
      if (memberError) throw new Error(memberError.message)
      ensembleIds = (memberRows || []).map(r => r.ensemble_id)
    }

    let query = supabase
      .from('calendar_events')
      .select('*, ensembles:ensemble_id(name)')
      .order('date')

    const orParts = [`user_id.eq.${userId}`, `created_by.eq.${userId}`]
    if (ensembleIds.length > 0) {
      orParts.push(`ensemble_id.in.(${ensembleIds.join(',')})`)
    }
    query = query.or(orParts.join(','))
    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', `${endDate}T23:59:59`)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data || []).map(e => ({
      ...e,
      ensemble_name: e.ensembles?.name || null,
      is_own: e.user_id === userId || e.created_by === userId,
    }))
  },

  async createCalendarEvent(eventData) {
    const { data, error } = await supabase
      .from('calendar_events').insert(eventData).select('*, ensembles:ensemble_id(name)').single()
    if (error) throw new Error(error.message)
    return { ...data, ensemble_name: data.ensembles?.name || null, is_own: true }
  },

  async deleteCalendarEvent(eventId) {
    const { error } = await supabase.from('calendar_events').delete().eq('id', eventId)
    if (error) throw new Error(error.message)
  },

  // Mood Logs — quick (post-session) and deep (weekly) check-ins
  async saveMoodLog(userId, { type, mood_score, entries, session_id = null }) {
    const { data, error } = await supabase
      .from('mood_logs')
      .insert({ user_id: userId, type, mood_score, entries, session_id })
      .select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async getMoodLogs(userId, limit = 30) {
    const { data, error } = await supabase
      .from('mood_logs').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(limit)
    if (error) throw new Error(error.message)
    return data || []
  },

  async getLastDeepCheckIn(userId) {
    const { data } = await supabase
      .from('mood_logs').select('*').eq('user_id', userId).eq('type', 'deep')
      .order('created_at', { ascending: false }).limit(1).single()
    return data || null
  },

  // ---------------------------------------------------------------------------
  // NOTEBOOK
  // ---------------------------------------------------------------------------

  async getNotebookEntries(userId) {
    const { data, error } = await supabase
      .from('notebook_entries').select('*').eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },
  async createNotebookEntry(userId, entryData) {
    const { data, error } = await supabase
      .from('notebook_entries')
      .insert({ user_id: userId, ...entryData })
      .select().single()
    if (error) throw new Error(error.message)
    return data
  },
  async updateNotebookEntry(id, updates) {
    const { data, error } = await supabase
      .from('notebook_entries').update(updates).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    return data
  },
  async deleteNotebookEntry(id) {
    const { error } = await supabase.from('notebook_entries').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  // Google Calendar Sync — replaces all Google-sourced events for this user.
  // Pass events=null to clear (used on disconnect).
  async syncGoogleCalendarEvents(userId, events) {
    // Always clear existing Google events first
    await supabase.from('calendar_events')
      .delete()
      .eq('user_id', userId)
      .eq('source', 'google')

    if (events && events.length > 0) {
      const { error } = await supabase.from('calendar_events').insert(
        events.map(e => ({
          user_id: userId,
          created_by: userId,
          title: e.title,
          date: e.date,
          start_time: e.time || '09:00',
          event_type: 'other',
          source: 'google',
        }))
      )
      if (error) throw new Error(error.message)
    }

    // Update profile: connected flag + last synced time
    await supabase.from('profiles').update({
      google_calendar_connected: !!(events && events.length >= 0),
      google_calendar_synced_at: events ? new Date().toISOString() : null,
    }).eq('id', userId)

    return events ? events.length : 0
  },

  // Push Tokens — one row per device, upserted on every login
  async savePushToken(userId, token, platform) {
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform }, { onConflict: 'token' })
    if (error) throw new Error(error.message)
  },

  // Server-side notification queue — replaces local scheduling for smart reminders.
  // Deletes any existing unsent reminder for this task first so there's never a duplicate.
  async scheduleNotification(userId, taskId, title, body, sendAt) {
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('task_id', taskId)
      .eq('sent', false)

    const { error } = await supabase
      .from('scheduled_notifications')
      .insert({ user_id: userId, task_id: taskId, title, body, send_at: sendAt })
    if (error) throw new Error(error.message)
  },

  async cancelScheduledNotification(userId, taskId) {
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('task_id', taskId)
      .eq('sent', false)
  },

  // Task Notes (AI practice journal)
  async getTaskNotes(taskId) {
    const { data, error } = await supabase
      .from('task_notes').select('*').eq('task_id', taskId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  async addTaskNote(taskId, userId, content) {
    const { data, error } = await supabase
      .from('task_notes').insert({ task_id: taskId, user_id: userId, content }).select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async deleteTaskNote(noteId) {
    const { error } = await supabase.from('task_notes').delete().eq('id', noteId)
    if (error) throw new Error(error.message)
  },

  // Notes / Messaging
  async getNotesConversation(user1Id, user2Id) {
    const { data, error } = await supabase
      .from('notes').select('*')
      .or(`and(sender_id.eq.${user1Id},recipient_id.eq.${user2Id}),and(sender_id.eq.${user2Id},recipient_id.eq.${user1Id})`)
      .order('created_at')
    if (error) throw new Error(error.message)
    return data || []
  },

  async getNotes(userId, teacherId) {
    if (!teacherId) return []
    return this.getNotesConversation(userId, teacherId)
  },

  async sendNote(senderId, recipientId, content) {
    const { data, error } = await supabase
      .from('notes')
      .insert({ sender_id: senderId, recipient_id: recipientId, content })
      .select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async markAllNotesRead(recipientId, senderId) {
    await supabase.from('notes')
      .update({ is_read: true })
      .eq('recipient_id', recipientId)
      .eq('sender_id', senderId)
  },

  async getTeacherByCode(code) {
    const { data } = await supabase
      .from('profiles').select('id, name, instrument')
      .eq('teacher_code', code).eq('role', 'teacher').single()
    return data || null
  },

  // Teacher-student
  async getTeacherStudents(teacherId) {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('teacher_id', teacherId)
    if (error) throw new Error(error.message)
    return data || []
  },

  async getStudentSummary(teacherId, studentId) {
    const weekStart = getWeekStart().toISOString()
    const [{ data: profile }, { data: sessions }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', studentId).single(),
      supabase.from('practice_sessions').select('duration_minutes')
        .eq('user_id', studentId).gte('start_time', weekStart),
    ])
    return {
      weekly_minutes: (sessions || []).reduce((s, r) => s + r.duration_minutes, 0),
      streak_count: profile?.streak_count || 0,
      total_sessions_this_week: (sessions || []).length,
    }
  },

  async getStudentActivityLog(teacherId, studentId) {
    const { data, error } = await supabase
      .from('practice_sessions').select('*').eq('user_id', studentId)
      .order('start_time', { ascending: false }).limit(20)
    if (error) throw new Error(error.message)
    return data || []
  },

  // ---------------------------------------------------------------------------
  // ENSEMBLES
  // ---------------------------------------------------------------------------

  async getTeacherEnsembles(teacherId) {
    const { data, error } = await supabase
      .from('ensembles').select('*').eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  async createEnsemble(teacherId, name, description = '') {
    const { data, error } = await supabase
      .from('ensembles').insert({ teacher_id: teacherId, name, description }).select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async updateEnsemble(ensembleId, updates) {
    const { data, error } = await supabase
      .from('ensembles').update(updates).eq('id', ensembleId).select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async deleteEnsemble(ensembleId) {
    const { error } = await supabase.from('ensembles').delete().eq('id', ensembleId)
    if (error) throw new Error(error.message)
  },

  async getEnsembleMembers(ensembleId) {
    const { data, error } = await supabase
      .from('ensemble_members')
      .select('student_id, joined_at, profiles:student_id(id, name, instrument, streak_count, total_points, level)')
      .eq('ensemble_id', ensembleId)
    if (error) throw new Error(error.message)
    return (data || []).map(r => ({ ...r.profiles, joined_at: r.joined_at }))
  },

  async addMemberToEnsemble(ensembleId, studentId) {
    const { error } = await supabase
      .from('ensemble_members').insert({ ensemble_id: ensembleId, student_id: studentId })
    if (error) throw new Error(error.message)
  },

  async removeMemberFromEnsemble(ensembleId, studentId) {
    const { error } = await supabase
      .from('ensemble_members').delete()
      .eq('ensemble_id', ensembleId).eq('student_id', studentId)
    if (error) throw new Error(error.message)
  },

  async getStudentEnsembles(studentId) {
    const { data, error } = await supabase
      .from('ensemble_members')
      .select('ensemble_id, ensembles:ensemble_id(id, name, description, archived, teacher_id, profiles:teacher_id(name))')
      .eq('student_id', studentId)
    if (error) throw new Error(error.message)
    return (data || []).map(r => ({ ...r.ensembles })).filter(e => !e.archived)
  },

  // ---------------------------------------------------------------------------
  // ASSIGNMENTS
  // ---------------------------------------------------------------------------

  async getEnsembleAssignments(ensembleId) {
    const { data, error } = await supabase
      .from('assignments').select('*').eq('ensemble_id', ensembleId)
      .order('due_date', { ascending: true })
    if (error) throw new Error(error.message)
    return data || []
  },

  async createAssignment(assignmentData) {
    const { ensemble_id, teacher_id, title, description, due_date } = assignmentData
    const { data: assignment, error } = await supabase
      .from('assignments').insert({ ensemble_id, teacher_id, title, description, due_date }).select().single()
    if (error) throw new Error(error.message)

    // Auto-create a task + submission for every current member
    const members = await this.getEnsembleMembers(ensemble_id)
    for (const member of members) {
      const { data: task } = await supabase.from('practice_tasks').insert({
        user_id: member.id, title, category: 'repertoire',
        estimated_minutes: 30,
      }).select().single()
      if (task) {
        await supabase.from('assignment_submissions').insert({
          assignment_id: assignment.id, student_id: member.id, task_id: task.id,
        })
      }
    }
    return assignment
  },

  async deleteAssignment(assignmentId) {
    const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)
    if (error) throw new Error(error.message)
  },

  async getAssignmentSubmissions(assignmentId) {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .select('*, profiles:student_id(id, name, instrument), practice_tasks:task_id(readiness_score, status, total_time_practiced)')
      .eq('assignment_id', assignmentId)
    if (error) throw new Error(error.message)
    return (data || []).map(s => ({
      ...s,
      student: s.profiles,
      readiness_score: s.practice_tasks?.readiness_score ?? 0,
      status: s.practice_tasks?.status ?? 'not_started',
      total_time_practiced: s.practice_tasks?.total_time_practiced ?? 0,
    }))
  },

  async gradeSubmission(submissionId, grade, feedback) {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .update({ teacher_grade: grade, teacher_feedback: feedback, graded_at: new Date().toISOString() })
      .eq('id', submissionId).select().single()
    if (error) throw new Error(error.message)
    return data
  },

  async getStudentAssignments(studentId) {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .select('*, assignments:assignment_id(id, title, description, due_date, ensemble_id, ensembles:ensemble_id(name)), practice_tasks:task_id(readiness_score, status)')
      .eq('student_id', studentId)
    if (error) throw new Error(error.message)
    return data || []
  },

  // ---------------------------------------------------------------------------
  // CHALLENGES
  // ---------------------------------------------------------------------------

  async getTeacherChallenges(teacherId) {
    const { data, error } = await supabase
      .from('challenges')
      .select('*, challenge_ensembles(ensemble_id, ensembles:ensemble_id(name))')
      .eq('teacher_id', teacherId)
      .order('end_date', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  async createChallenge(challengeData, ensembleIds) {
    const { teacher_id, title, type, target_minutes, start_date, end_date } = challengeData
    const { data: challenge, error } = await supabase
      .from('challenges').insert({ teacher_id, title, type, target_minutes, start_date, end_date })
      .select().single()
    if (error) throw new Error(error.message)
    await supabase.from('challenge_ensembles').insert(
      ensembleIds.map(ensemble_id => ({ challenge_id: challenge.id, ensemble_id }))
    )
    return challenge
  },

  async deleteChallenge(challengeId) {
    const { error } = await supabase.from('challenges').delete().eq('id', challengeId)
    if (error) throw new Error(error.message)
  },

  async getStudentChallenges(studentId) {
    const { data, error } = await supabase
      .from('challenge_ensembles')
      .select('challenge_id, ensemble_id, challenges:challenge_id(*), ensembles:ensemble_id(name)')
      .in('ensemble_id', (
        await supabase.from('ensemble_members').select('ensemble_id').eq('student_id', studentId)
      ).data?.map(r => r.ensemble_id) || [])
    if (error) throw new Error(error.message)
    return (data || []).map(r => ({ ...r.challenges, ensemble_name: r.ensembles?.name }))
  },

  async getChallengeLeaderboard(challengeId) {
    // Get all ensembles in this challenge
    const { data: ceRows } = await supabase
      .from('challenge_ensembles')
      .select('ensemble_id, ensembles:ensemble_id(name)')
      .eq('challenge_id', challengeId)
    const ensembleIds = (ceRows || []).map(r => r.ensemble_id)
    const ensembleNames = Object.fromEntries((ceRows || []).map(r => [r.ensemble_id, r.ensembles?.name]))

    // Get the challenge window
    const { data: challenge } = await supabase
      .from('challenges').select('*').eq('id', challengeId).single()
    if (!challenge) return []

    // Get all members across all ensembles
    const { data: members } = await supabase
      .from('ensemble_members')
      .select('student_id, ensemble_id, profiles:student_id(id, name, instrument)')
      .in('ensemble_id', ensembleIds)

    if (!members?.length) return []

    const studentIds = members.map(m => m.student_id)

    // Get sessions in the challenge window
    const { data: sessions } = await supabase
      .from('practice_sessions')
      .select('user_id, points_earned, duration_minutes')
      .in('user_id', studentIds)
      .gte('start_time', challenge.start_date)
      .lte('start_time', challenge.end_date)

    // Aggregate per student
    const memberMap = {}
    for (const m of members) {
      memberMap[m.student_id] = {
        ...m.profiles,
        ensemble_id: m.ensemble_id,
        ensemble_name: ensembleNames[m.ensemble_id],
        xp_earned: 0,
        minutes_practiced: 0,
      }
    }
    for (const s of sessions || []) {
      if (memberMap[s.user_id]) {
        memberMap[s.user_id].xp_earned += s.points_earned
        memberMap[s.user_id].minutes_practiced += s.duration_minutes
      }
    }

    const students = Object.values(memberMap)
    const metric = challenge.type === 'xp_sprint' ? 'xp_earned' : 'minutes_practiced'

    if (ensembleIds.length === 1) {
      // Individual leaderboard
      return students.sort((a, b) => b[metric] - a[metric]).map((s, i) => ({ ...s, rank: i + 1 }))
    }

    // Class vs class — group by ensemble, compute avg
    const ensembleStats = {}
    for (const s of students) {
      if (!ensembleStats[s.ensemble_id]) {
        ensembleStats[s.ensemble_id] = { ensemble_id: s.ensemble_id, ensemble_name: s.ensemble_name, total: 0, count: 0, members: [] }
      }
      ensembleStats[s.ensemble_id].total += s[metric]
      ensembleStats[s.ensemble_id].count++
      ensembleStats[s.ensemble_id].members.push(s)
    }
    return Object.values(ensembleStats)
      .map(e => ({ ...e, avg: e.count > 0 ? Math.round(e.total / e.count) : 0 }))
      .sort((a, b) => b.avg - a.avg)
      .map((e, i) => ({
        ...e,
        rank: i + 1,
        members: e.members.sort((a, b) => b[metric] - a[metric]).map((s, j) => ({ ...s, rank: j + 1 })),
      }))
  },
}

# PracticeBeats — Claude Context

> Read this at the start of every session. Full feature backlog is in `TODO.md`.

---

## FIRST TIME SETUP (VS Code / new machine)

If this is a fresh clone, do these steps before anything else:

```bash
cd mobile
npm install
```

Then create `mobile/.env` with your Claude API key:
```
EXPO_PUBLIC_ANTHROPIC_KEY=sk-ant-your-key-here
```

To run the app:
```bash
npx expo start
```

Scan the QR code with the Expo Go app on your phone (iOS or Android).

**Still needs setup (manual steps):**
- [ ] Paste real Claude API key into `mobile/.env`
- [ ] Set Google Cloud OAuth client IDs in `mobile/src/utils/googleAuth.js` (top of file, 3 constants)
- [ ] Run SQL in Supabase for notebook (see TODO.md — `notebook_entries` table + `ai_read_notebook` column)
- [ ] **Wire up scheduled notifications** — `deliver-notifications` edge function is deployed, but nothing invokes it yet. Run `supabase/notifications-cron.sql` once in the Supabase SQL editor (paste the project's `service_role` key where the file says to — deliberately not something Claude should do, since it means putting a secret key into a query). Until this runs, no push notifications actually fire.

---

## What this app is

**PracticeBeats** — a music practice tracker for ensemble musicians (students + teachers).
Think Duolingo gamification meets Google Calendar scheduling, with Claude as a practice coach.

Target users: high school / college music students and their teachers.
Most differentiating feature: **evidence-based, hyper-specific AI practice recommendations** — not "play something fun", but "spend 10 min on bars 9–16 of the Donnelly B section at 60% tempo using spaced retrieval, because you have AP exams tomorrow and your mood has been low all week."

---

## Tech stack

| Layer | What |
|---|---|
| Mobile app | React Native + Expo (managed workflow), NativeWind (Tailwind) |
| Backend / DB | Supabase (Postgres + Auth + Edge Functions + RLS) |
| AI | Claude API (Haiku 4.5) via direct fetch in `mobile/src/utils/ai.js` |
| Notifications | Expo Push + Supabase Edge Function `deliver-notifications` |
| Calendar | Google Calendar OAuth (`expo-auth-session`) |
| Token storage | `expo-secure-store` (Google OAuth tokens only) |

Legacy: there's also a `frontend/` (React + Vite) and `backend/` (FastAPI) from the original hackathon build — both are effectively deprecated in favour of the mobile app.

---

## Repo structure (what matters)

```
mobile/
  App.js                          # Navigation: bottom tabs + stack screens
  src/
    components/                   # All screens and UI components
    contexts/AppContext.jsx        # Global state: user, tasks, auth, actions
    utils/
      ai.js                       # All Claude API calls — key loaded from .env
      supabase.js                  # All DB operations + business logic (XP, streaks, readiness)
      googleAuth.js               # Google OAuth token management + Calendar API fetch
      notifications.js            # Expo push token + local notification scheduling
  .env                            # GITIGNORED — paste Claude API key here
  app.json                        # Bundle ID: com.practicebeats.app, scheme: practicebeats
supabase/
  functions/deliver-notifications/ # Edge Function: reads scheduled_notifications, sends via Expo
TODO.md                           # Full feature backlog + built inventory
CLAUDE.md                         # This file
```

---

## Supabase project

- **URL**: `https://yqcwvpwzykawwndbyakw.supabase.co`
- **Project ref**: `yqcwvpwzykawwndbyakw`
- All DB operations go through `mobile/src/utils/supabase.js` — the `db` export.

### Tables (all with RLS enabled)
`profiles`, `practice_tasks`, `practice_sessions`, `session_tasks`, `badges`, `notes`, `ensembles`, `ensemble_members`, `assignments`, `assignment_submissions`, `challenges`, `challenge_ensembles`, `calendar_events`, `task_notes`, `mood_logs`, `push_tokens`, `scheduled_notifications`, `notebook_entries`

### SQL status
All migrations confirmed run ✅ except:
- `notebook_entries` table — see TODO.md for exact SQL
- `ai_read_notebook` column on `profiles` — see TODO.md for exact SQL

---

## Key architectural decisions (don't undo these)

- **No FastAPI** — all business logic (XP calc, streak, readiness score) lives client-side in `supabase.js`. Supabase RLS enforces security.
- **Privacy layer** — `sanitizeTask()` and `sanitizeNotes()` in `ai.js` are an explicit allowlist. No user IDs, names, emails, or teacher identifiers ever leave the device toward Anthropic. Don't remove this.
- **Claude API key** — loaded from `mobile/.env` as `EXPO_PUBLIC_ANTHROPIC_KEY`. Never hardcode in source. File is gitignored.
- **Google OAuth tokens** — stored in `expo-secure-store` (device-only), NOT in Supabase. `google_calendar_connected` bool on profile is just a display flag.
- **Mood logs** — three types: `quick` (post-session, ~60s), `deep` (weekly reflection, 5-6 Claude questions), `pre_session` (before timer starts, mood + Claude intention question).
- **Calendar events** — `source` column: `manual` (user added), `google` (OAuth sync), `ensemble` (teacher pushed to class).

---

## AI functions in ai.js

| Function | When called | What it does |
|---|---|---|
| `parseTask(text)` | Smart Add | NL → structured task JSON |
| `getPreSessionQuestion(tasks, logs)` | Before practice | Specific intention question |
| `getQuickFollowUp(session, tasks, logs)` | After practice | Specific reflection question |
| `getDeepCheckInQuestions(tasks, logs, events)` | Weekly check-in | 5-6 personalised survey questions |
| `getPracticeRecommendation(tasks, logs, events, sessions, notebookEntries?)` | Dashboard | Evidence-based plan (method + specific bars + duration) |
| `getCoachingTip(title, minutes, notes)` | Task Detail | 2-3 sentence coaching tip |
| `getSmartReminderData(task, notes, times)` | Task notifications | Message text + optimal send time |
| `buildNotebookContext(entries)` | Internal | Sanitizes notebook entries for prompt inclusion |
| `getNotebookTableOfContents(entries)` | Notebook screen | AI-generated TOC grouped by theme/time |

---

## Navigation structure

**Bottom tabs**: Home (Dashboard) · Calendar · Practice (timer, centre FAB) · Tasks or Classes (role-dependent) · Profile

**Stack screens**: Achievements · Messages · EnsembleDetail · AssignmentCreate · AssignmentDetail · ChallengeCreate · ChallengeLeaderboard · StudentEnsembleView · AllStudents (TeacherDashboard) · TaskDetail · PrivacyPolicy · DeepCheckIn (Weekly Reflection) · Notebook · NotebookEditor

---

## User roles

- `teacher` — sees Classes tab instead of Tasks, can create ensembles/assignments/challenges, has teacher code
- `student` — linked to teacher via 6-digit code, sees ensemble events + assignments + challenges
- `personal` — not linked to teacher, same as student but no ensemble features (differentiated experience not yet built)

---

## Ideas from Vidushee (capture these, don't lose them)

- **Mood check-in should feel like a conversation**, not a form. Claude prompts questions one at a time — "how are you feeling?", emoji scale, then "name two things you're grateful for", "anything frustrating you?", "what are your goals this week?" — not a static survey.
- **Recommendations must be hyper-specific**, not vague. Not "play something easy". Instead: "spend 10 min on bars 9–16 of the Donnelly B section at 60% tempo — that's the passage your notes say is slipping." Grounded in actual research (Ericsson deliberate practice, cognitive load theory, interleaved vs blocked practice, spaced retrieval, Pomodoro for high-stress periods).
- **Google Calendar context** makes recommendations much smarter — if Claude sees "AP Biology exam tomorrow", it recommends a short targeted session instead of a full drill. This is why OAuth matters.
- **Notebook** should be closer to Google Docs than a text field. Rich text, hyperlinks. AI generates a table of contents. Toggle: "let AI read my notebook" → Claude uses it as extra coaching context.
- **AI Chat screen** — student types "I've been playing these big band charts, recommend similar ones" and Claude knows their full history (tasks, notes, ensemble, mood). Not a generic chatbot — fully context-loaded.
- **UI redesign** — Vidushee sketched: left sidebar nav (vs current bottom tabs), split-pane with activity feed on the right, progress bar at bottom showing hrs / XP / completed this week. "Positive message" card + "How r u feeling" button on the home activity panel.
- **The most differentiated feature in the music ed space** is the evidence-based practice method recommendations. Nothing else does this. Lean into it.
- **API cost**: using Claude Haiku 4.5 — ~$0.80/1M input tokens, plenty for demo on $5 credit. Could upgrade just `getPracticeRecommendation` to Sonnet if output feels generic (one-line change in ai.js).

---

## What's fully built ✅

- Email + password auth, teacher / student / personal roles
- Teacher 6-digit code, student joins via code, session persistence
- Dashboard: weekly goal ring, streak, XP/level, challenge banners, task preview, AI practice plan, quick action buttons
- Practice timer: focus/progress/energy ratings, XP calc, streak + badge awarding
- Pre-session check-in: mood + Claude intention question before timer starts
- Tasks: filter tabs, manual create, Smart Add (Claude structures natural language), Task Detail, readiness bar
- Practice notes (per-task AI memory), AI coaching tip, smart notifications (Claude picks message + send time)
- Calendar: month grid, dot indicators, personal + class events, assignment due dates, day-before reminders
- Google Calendar OAuth: connect via Google sign-in, syncs 90 days of events, auto-refresh tokens, disconnect
- Classes (teacher): create/archive/delete, add/remove students, roster
- Assignments: create → auto-task per student, readiness tracking, grade + feedback
- Challenges: XP sprint + minutes types, individual + class-vs-class leaderboards
- Mindful Practice layer: pre-session check-in (mood + Claude intention), post-session quick reflection, weekly deep check-in (Claude generates personalised 5-6 question survey)
- Today's Practice Plan: evidence-based recommendation (deliberate practice, spaced retrieval, Pomodoro, cognitive load) — specific task, bars, method, duration
- Profile: editable name, editable weekly goal, Google Calendar connect section, teacher code, achievements link, notebook link
- Messaging: teacher ↔ student text notes
- Achievements: 8 badge types
- Privacy Policy screen + AI data sanitisation layer (allowlist, no PII to Anthropic)
- Push notification infrastructure: Expo token registration + Supabase Edge Function `deliver-notifications` (needs deployment)
- **Notebook**: entry list + search, autosave editor, tag chips (Reflection/Lesson Note/Music Writing/Technique/Repertoire/General), AI Table of Contents, "Let Claude read" toggle, post-session reflection prompt

---

## Session log (newest first)

### Session: AI Chat screen
- Built `AIChat.jsx` — freeform chat screen with iMessage-style bubbles, typing indicator, starter prompts, KeyboardAvoidingView, auto-scroll
- Added `getChatResponse(userMessage, history, context)` to `ai.js` — system prompt loads full app context (tasks, mood, sessions, calendar, notebook), sanitized, no PII
- Added `callClaudeWithHistory()` internal helper for multi-turn Claude calls with system prompt
- Registered `AIChat` as stack screen in `App.js`
- Added "Ask Your Practice Coach" full-width button on Dashboard above quick actions row

### Session: VS Code setup
- Updated CLAUDE.md with first-time setup instructions for VS Code
- Claude API key now loaded from `mobile/.env` (gitignored) via `EXPO_PUBLIC_ANTHROPIC_KEY`

### Session: continue-app-development (continued)
- **Built Notebook feature** — fully integrated:
  - `Notebook.jsx` — entry list, search, "Let Claude read" toggle, AI Table of Contents button
  - `NotebookEditor.jsx` — full-screen debounced autosave editor with tag chips, create-on-first-save
  - `supabase.js` — added `getNotebookEntries`, `createNotebookEntry`, `updateNotebookEntry`, `deleteNotebookEntry`
  - `ai.js` — added `buildNotebookContext`, `getNotebookTableOfContents`, updated `getPracticeRecommendation` (5th param)
  - `App.js` — registered `Notebook` and `NotebookEditor` screens
  - `Dashboard.jsx` — added side-by-side "Weekly Reflection" + "My Notebook" quick action buttons
  - `PracticeSession.jsx` — post-session complete screen now has "Write Reflection" button linking to `NotebookEditor` with `sessionId`
  - `Profile.jsx` — added "My Notebook" link in quick links section
  - `TodayRecommendation.jsx` — fetches notebook entries when `user.ai_read_notebook` is true and passes to recommendation
- SQL for `notebook_entries` and `ai_read_notebook` still needs to be run in Supabase (see TODO.md)

### Session: continue-app-development
- Built ICS calendar import (later replaced with Google OAuth)
- Built `PreSessionCheckIn` — mood + Claude intention question shown before timer starts
- Built `GoogleCalendarConnect` — full OAuth flow, token refresh, disconnect
- Replaced ICS copy-paste with Google sign-in sheet
- Added editable display name + weekly goal to Profile
- Updated `app.json` with bundle ID (`com.practicebeats.app`), scheme (`practicebeats`)
- Installed `expo-auth-session`, `expo-web-browser`, `expo-secure-store`, `expo-crypto`
- Created `TODO.md` and `CLAUDE.md` for persistent context
- Agreed: CLAUDE.md gets updated every session with decisions, ideas, and progress

### Session: document-app-components (prior session)
- Built full Mindful Practice layer: `MindfulCheckIn` (post-session), `DeepCheckIn` (weekly), `TodayRecommendation` (evidence-based plan)
- All AI functions in `ai.js`: `getPreSessionQuestion`, `getQuickFollowUp`, `getDeepCheckInQuestions`, `getPracticeRecommendation`, `getCoachingTip`, `getSmartReminderData`
- Discussed Notebook, AI Chat, avatar builder, UI redesign — all deferred to future sessions
- Decided on two mood modes: quick (every session, ~60s) and deep (weekly, Claude-generated questions)

---

## Next priorities (pick up here)

1. **Server-side push notifications** — Edge Function at `supabase/functions/deliver-notifications/index.ts` is deployed and includes a relevance guard (skips reminders for tasks already practiced/deleted) + batched delivery. Nothing invokes it yet — run `supabase/notifications-cron.sql` once (see "Still needs setup" above) to wire up the every-minute `pg_cron` trigger.
2. **UI redesign** — left sidebar nav, split-pane layout, activity feed on right, progress bar at bottom (hrs/XP/completed this week)
3. **Image attachments in messaging** — teacher ↔ student photo support

---

## Git

- **Active branch**: `claude/continue-app-development-tBZDj`
- Always develop on this branch and push here.
- Never push to `main` without explicit permission.

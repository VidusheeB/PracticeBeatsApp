import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useApp } from '../contexts/AppContext'
import { db } from '../utils/supabase'
import MindfulCheckIn from './MindfulCheckIn'
import PreSessionCheckIn from './PreSessionCheckIn'
import SessionGoalsModal from './SessionGoalsModal'

export default function PracticeSession() {
  const navigation = useNavigation()
  const route = useRoute()
  const { user, tasks, saveSession, setToast } = useApp()

  const [phase, setPhase] = useState('setup')
  const [seconds, setSeconds] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const timerRef = useRef(null)
  const [selectedTasks, setSelectedTasks] = useState(new Set())
  const [focusRating, setFocusRating] = useState(0)
  const [progressRating, setProgressRating] = useState(0)
  const [energyRating, setEnergyRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [sessionResult, setSessionResult] = useState(null)
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [showPreCheckIn, setShowPreCheckIn] = useState(false)
  const [showGoalsModal, setShowGoalsModal] = useState(false)
  const [sessionGoals, setSessionGoals] = useState([])
  const [goalResults, setGoalResults] = useState([null, null, null])
  const [reflectionEntry, setReflectionEntry] = useState(null)

  useEffect(() => {
    if (route.params?.selectedTask) {
      setSelectedTasks(new Set([route.params.selectedTask]))
    }
  }, [route.params])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const startTimer = () => {
    if (timerRef.current) return
    setShowGoalsModal(true)
  }

  const handleGoalsDone = (goals) => {
    setSessionGoals(goals)
    setShowGoalsModal(false)
    setShowPreCheckIn(true)
  }

  const beginTimerAfterCheckIn = () => {
    setShowPreCheckIn(false)
    setStartTime(new Date())
    setPhase('active')
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }

  const pauseTimer = () => { clearInterval(timerRef.current); timerRef.current = null; setPhase('paused') }
  const resumeTimer = () => {
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    setPhase('active')
  }
  const stopTimer = () => { clearInterval(timerRef.current); timerRef.current = null; setPhase('rating') }

  const formatTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const pad = n => n.toString().padStart(2, '0')
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
  }

  const buildTaskBreakdown = (durationMinutes) => {
    const taskIds = Array.from(selectedTasks)
    if (taskIds.length === 0) return []
    const base = Math.floor(durationMinutes / taskIds.length)
    const remainder = durationMinutes - base * taskIds.length
    return taskIds.map((taskId, i) => ({ task_id: taskId, minutes_spent: base + (i < remainder ? 1 : 0) }))
  }

  const buildGoalsPayload = () => sessionGoals.map((text, i) => ({ text, accomplished: goalResults[i] ?? null }))

  const formatReflectionContent = (goalsPayload) => {
    if (!goalsPayload.length) return ''
    const lines = goalsPayload.map((g, i) => {
      const mark = g.accomplished === true ? '✅ Accomplished'
        : g.accomplished === false ? '❌ Not yet'
        : '– Not marked'
      return `${i + 1}. ${g.text} — ${mark}`
    })
    return `Goals for this session:\n${lines.join('\n')}\n`
  }

  // Every practice session gets a reflection entry automatically — the
  // "Add Reflection" button opens/extends it, but it exists whether or not
  // the user ever taps that button.
  const createSessionReflection = async (sessionRow, goalsPayload) => {
    try {
      const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const entry = await db.createNotebookEntry(user.id, {
        title: `Practice Reflection · ${dateLabel}`,
        content: formatReflectionContent(goalsPayload),
        tags: ['reflection'],
        session_id: sessionRow.id,
      })
      return entry
    } catch {
      return null // non-blocking — session save already succeeded
    }
  }

  const handleSaveSession = async () => {
    if (!startTime) { setToast('Session start time is missing', 'error'); return }
    const durationMinutes = Math.max(1, Math.ceil(seconds / 60))
    const goalsPayload = buildGoalsPayload()
    try {
      const result = await saveSession({
        start_time: startTime.toISOString(),
        duration_minutes: durationMinutes,
        focus_rating: focusRating || null,
        progress_rating: progressRating || null,
        energy_rating: energyRating || null,
        notes: notes || null,
        goals: goalsPayload,
        tasks: buildTaskBreakdown(durationMinutes),
      })
      setSessionResult(result)
      setReflectionEntry(await createSessionReflection(result, goalsPayload))
      setPhase('complete')
      setShowCheckIn(true)
    } catch {
      setToast('Failed to save session', 'error')
    }
  }

  const handleQuickSave = async () => {
    if (!startTime) { setToast('Session start time is missing', 'error'); return }
    const durationMinutes = Math.max(1, Math.ceil(seconds / 60))
    const goalsPayload = buildGoalsPayload()
    try {
      const result = await saveSession({
        start_time: startTime.toISOString(),
        duration_minutes: durationMinutes,
        focus_rating: null, progress_rating: null, energy_rating: null,
        notes: `Quick save - ${durationMinutes} min`,
        goals: goalsPayload,
        tasks: buildTaskBreakdown(durationMinutes),
      })
      await createSessionReflection(result, goalsPayload)
      setToast(`Saved ${durationMinutes} min of practice!`, 'success')
      navigation.navigate('Home')
    } catch {
      setToast('Failed to save session', 'error')
    }
  }

  const toggleTask = (taskId) => {
    const next = new Set(selectedTasks)
    next.has(taskId) ? next.delete(taskId) : next.add(taskId)
    setSelectedTasks(next)
  }

  const RatingInput = ({ label, value, onChange }) => (
    <View className="mb-4">
      <Text className="text-sm text-gray-600 mb-2 text-center">{label}</Text>
      <View className="flex-row justify-center gap-2">
        {[1,2,3,4,5].map(r => (
          <TouchableOpacity
            key={r}
            onPress={() => onChange(r)}
            className={`w-12 h-12 rounded-full items-center justify-center ${value === r ? 'bg-indigo-500' : 'bg-gray-100'}`}
          >
            <Text className="text-xl">
              {r <= 2 ? '😫' : r === 3 ? '😐' : r === 4 ? '😊' : '🤩'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )

  // SETUP PHASE
  if (phase === 'setup') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pt-4 pb-24">
        <Text className="text-2xl font-bold text-gray-900 mb-1">Start Practice</Text>
        <Text className="text-gray-500 mb-6">What are you working on today?</Text>

        {tasks.length === 0 ? (
          <View className="bg-white rounded-2xl p-6 items-center mb-6">
            <Text className="text-4xl mb-2">🎵</Text>
            <Text className="text-gray-500 mb-1">No tasks yet</Text>
            <Text className="text-sm text-gray-400 text-center">You can still practice freely! Add tasks from the Tasks tab to track specific pieces.</Text>
          </View>
        ) : (
          <View className="gap-2 mb-6">
            <Text className="text-xs text-gray-400 mb-1">Select tasks to track (optional)</Text>
            {tasks.map(task => (
              <TouchableOpacity
                key={task.id}
                onPress={() => toggleTask(task.id)}
                className={`p-4 rounded-xl border-2 ${
                  selectedTasks.has(task.id) ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-gray-100'
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                    selectedTasks.has(task.id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'
                  }`}>
                    {selectedTasks.has(task.id) && <Text className="text-white text-xs">✓</Text>}
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">{task.title}</Text>
                    <Text className="text-sm text-gray-500">{task.total_time_practiced}/{task.estimated_minutes} min practiced</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={startTimer}
          className="rounded-xl py-4 items-center bg-indigo-500"
        >
          <Text className="text-white font-semibold text-lg">
            {selectedTasks.size === 0 ? 'Start Free Practice' : 'Start Timer'}
          </Text>
        </TouchableOpacity>

        {showGoalsModal && (
          <SessionGoalsModal onDone={handleGoalsDone} />
        )}

        {showPreCheckIn && (
          <PreSessionCheckIn
            onDone={beginTimerAfterCheckIn}
            onSkip={beginTimerAfterCheckIn}
          />
        )}
      </ScrollView>
      </SafeAreaView>
    )
  }

  // ACTIVE / PAUSED PHASE
  if (phase === 'active' || phase === 'paused') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-gray-500 mb-2">{phase === 'paused' ? '⏸ Paused' : '🎵 Practicing...'}</Text>
        <Text className="text-6xl font-bold text-indigo-500 mb-8 font-mono">{formatTime(seconds)}</Text>

        <View className="mb-8 items-center">
          <Text className="text-sm text-gray-600 mb-2">Working on:</Text>
          {selectedTasks.size === 0 ? (
            <Text className="font-medium text-gray-900">🎵 Free Practice</Text>
          ) : (
            Array.from(selectedTasks).map(id => {
              const task = tasks.find(t => t.id === id)
              return task ? <Text key={id} className="font-medium text-gray-900">{task.title}</Text> : null
            })
          )}
        </View>

        {sessionGoals.length > 0 && (
          <View className="w-full max-w-md bg-indigo-50 rounded-2xl px-4 py-3 mb-8">
            <Text className="text-xs font-semibold text-indigo-600 mb-1">Today's Goals</Text>
            {sessionGoals.map((g, i) => (
              <Text key={i} className="text-sm text-indigo-900">• {g}</Text>
            ))}
          </View>
        )}

        <View className="gap-4 items-center">
          <View className="flex-row gap-4">
            {phase === 'active' ? (
              <TouchableOpacity onPress={pauseTimer} className="px-8 py-4 bg-gray-200 rounded-xl">
                <Text className="text-gray-700 font-semibold">⏸ Pause</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={resumeTimer} className="px-8 py-4 bg-indigo-500 rounded-xl">
                <Text className="text-white font-semibold">▶ Resume</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={stopTimer} className="px-8 py-4 bg-red-500 rounded-xl">
              <Text className="text-white font-semibold">⏹ Finish</Text>
            </TouchableOpacity>
          </View>

          {phase === 'paused' && seconds >= 60 && (
            <TouchableOpacity onPress={handleQuickSave} className="px-6 py-3 bg-green-500 rounded-xl">
              <Text className="text-white font-semibold">💾 Save Progress & Exit</Text>
            </TouchableOpacity>
          )}
          {phase === 'paused' && seconds < 60 && (
            <Text className="text-sm text-gray-400">Practice at least 1 minute to save progress</Text>
          )}
        </View>

        <TextInput
          className="mt-8 w-full max-w-md border border-gray-200 rounded-xl px-4 py-3 bg-white"
          style={{ minHeight: 80, textAlignVertical: 'top' }}
          value={notes}
          onChangeText={setNotes}
          placeholder="Quick note (optional)..."
          multiline
          blurOnSubmit={false}
        />
      </View>
      </SafeAreaView>
    )
  }

  // RATING PHASE
  if (phase === 'rating') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 py-8 items-center flex-grow justify-center">
        <Text className="text-6xl mb-4">🎉</Text>
        <Text className="text-2xl font-bold text-gray-900 mb-1">Great work!</Text>
        <Text className="text-gray-500 mb-8">
          You practiced for <Text className="font-bold text-indigo-500">{Math.ceil(seconds / 60)} minutes</Text>
        </Text>
        <View className="w-full">
          <RatingInput label="How focused were you?" value={focusRating} onChange={setFocusRating} />
          <RatingInput label="Did you make progress?" value={progressRating} onChange={setProgressRating} />
          <RatingInput label="How's your energy?" value={energyRating} onChange={setEnergyRating} />
        </View>

        {sessionGoals.length > 0 && (
          <View className="w-full mb-6">
            <Text className="text-sm text-gray-600 mb-3 text-center">Did you accomplish your goals?</Text>
            {sessionGoals.map((goal, i) => (
              <View key={i} className="bg-white rounded-xl p-3 mb-2 border border-gray-100">
                <Text className="text-sm text-gray-800 mb-2">{goal}</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setGoalResults(prev => prev.map((r, j) => j === i ? true : r))}
                    className={`flex-1 py-2 rounded-lg items-center ${goalResults[i] === true ? 'bg-green-500' : 'bg-gray-100'}`}
                  >
                    <Text className={goalResults[i] === true ? 'text-white font-semibold' : 'text-gray-500'}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setGoalResults(prev => prev.map((r, j) => j === i ? false : r))}
                    className={`flex-1 py-2 rounded-lg items-center ${goalResults[i] === false ? 'bg-red-500' : 'bg-gray-100'}`}
                  >
                    <Text className={goalResults[i] === false ? 'text-white font-semibold' : 'text-gray-500'}>Not yet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <TextInput
          className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white mb-6"
          value={notes}
          onChangeText={setNotes}
          placeholder="Any notes about this session?"
        />
        <TouchableOpacity onPress={handleSaveSession} className="bg-indigo-500 rounded-xl py-4 w-full items-center">
          <Text className="text-white font-semibold text-lg">Save & Finish</Text>
        </TouchableOpacity>
      </ScrollView>
      </SafeAreaView>
    )
  }

  // COMPLETE PHASE
  if (phase === 'complete' && sessionResult) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-8xl mb-4">🎵</Text>
        <Text className="text-3xl font-bold text-gray-900 mb-2">Session Complete!</Text>
        <View className="bg-indigo-50 rounded-2xl px-8 py-6 mb-6 items-center">
          <Text className="text-sm text-indigo-500 mb-1">XP Earned</Text>
          <Text className="text-4xl font-bold text-indigo-500">+{sessionResult.points_earned}</Text>
        </View>
        {user?.streak_count > 0 && (
          <View className="flex-row items-center gap-2 bg-orange-100 px-6 py-3 rounded-full mb-6">
            <Text className="text-2xl">🔥</Text>
            <Text className="font-bold text-orange-600">{user.streak_count} day streak!</Text>
          </View>
        )}
        <Text className="text-gray-500 italic mb-8">
          {focusRating >= 4 ? 'Excellent focus! Keep it up!' : 'Every practice session counts!'}
        </Text>
        <View className="flex-row gap-3 w-full">
          <TouchableOpacity
            onPress={() => navigation.navigate('NotebookEditor', {
              // The reflection entry already exists — it was auto-created
              // alongside the session — so we open it in place rather than
              // creating a second one.
              entry: reflectionEntry || undefined,
              sessionId: sessionResult.id,
              reflection: true,
              reflectionSeed: {
                minutes: Math.ceil(seconds / 60),
                focusRating,
                progressRating,
                energyRating,
                tasks: tasks.filter(t => selectedTasks.has(t.id)),
                goals: sessionGoals,
                goalResults,
              },
            })}
            className="flex-1 bg-amber-50 rounded-xl py-3 items-center border border-amber-100"
          >
            <Text className="text-xl mb-0.5">📓</Text>
            <Text className="text-amber-700 font-semibold text-sm">Add Reflection</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Home')} className="flex-1 bg-indigo-500 rounded-xl py-3 items-center">
            <Text className="text-white font-semibold">Dashboard</Text>
          </TouchableOpacity>
        </View>

        {showCheckIn && (
          <MindfulCheckIn
            session={sessionResult}
            onDismiss={() => {
              setShowCheckIn(false)
              navigation.navigate('Home')
            }}
          />
        )}
      </View>
      </SafeAreaView>
    )
  }

  return null
}

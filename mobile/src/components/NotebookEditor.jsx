import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useApp } from '../contexts/AppContext'
import { db } from '../utils/supabase'
import { getReflectionPrompts } from '../utils/ai'

const TAGS = [
  { key: 'reflection',    label: 'Reflection',    bg: '#f0fdf4', text: '#16a34a' },
  { key: 'lesson_note',   label: 'Lesson Note',   bg: '#eff6ff', text: '#2563eb' },
  { key: 'music_writing', label: 'Music Writing', bg: '#fdf4ff', text: '#9333ea' },
  { key: 'technique',     label: 'Technique',     bg: '#fff7ed', text: '#ea580c' },
  { key: 'repertoire',    label: 'Repertoire',    bg: '#f0f9ff', text: '#0284c7' },
  { key: 'general',       label: 'General',       bg: '#f9fafb', text: '#6b7280' },
]

export default function NotebookEditor() {
  const navigation = useNavigation()
  const route = useRoute()
  const { user, tasks, setToast } = useApp()

  const initialEntry = route.params?.entry
  const sessionId = route.params?.sessionId || null
  const isSessionReflection = !!route.params?.reflection
  // Guided prompts aren't exclusive to the post-session flow — any brand new
  // entry (session reflection OR a blank entry from the Notebook "+" button)
  // gets them. Session reflections always qualify even though they arrive
  // pre-filled with the goals summary; other entries only if truly empty.
  const isFreshEntry = isSessionReflection
    || (!initialEntry?.content?.trim() && !initialEntry?.title?.trim())

  const [title, setTitle] = useState(initialEntry?.title || '')
  const [content, setContent] = useState(initialEntry?.content || '')
  const [tags, setTags] = useState(initialEntry?.tags || [])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [prompts, setPrompts] = useState([])
  const [promptsLoading, setPromptsLoading] = useState(isFreshEntry)

  const entryIdRef = useRef(initialEntry?.id || null)
  const saveTimerRef = useRef(null)
  const latestDraftRef = useRef({ title: initialEntry?.title || '', content: initialEntry?.content || '', tags: initialEntry?.tags || [] })
  const dirtyRef = useRef(false)

  const persistEntry = useCallback(async (t, c, tgs) => {
    const payload = {
      title: t.trim() || 'Untitled',
      content: c,
      tags: tgs,
      updated_at: new Date().toISOString(),
    }
    if (entryIdRef.current) {
      await db.updateNotebookEntry(entryIdRef.current, payload)
      return
    }
    const created = await db.createNotebookEntry(user.id, {
      ...payload,
      session_id: sessionId,
    })
    entryIdRef.current = created.id
  }, [user.id, sessionId])

  // Save to Supabase — creates if no ID yet, updates if exists
  const save = useCallback(async (t, c, tgs, { silent = false } = {}) => {
    if (!silent) setSaving(true)
    try {
      await persistEntry(t, c, tgs)
      dirtyRef.current = false
      if (!silent) setSavedAt(new Date())
    } catch {
      if (!silent) setToast('Failed to save', 'error')
    } finally {
      if (!silent) setSaving(false)
    }
  }, [persistEntry, setToast])

  // Debounce autosave — fires 1.5s after last keystroke
  const scheduleAutosave = useCallback((t, c, tgs) => {
    latestDraftRef.current = { title: t, content: c, tags: tgs }
    dirtyRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => save(t, c, tgs), 1500)
  }, [save])

  // Flush any pending edit when leaving before the debounce fires.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      if (dirtyRef.current) {
        const draft = latestDraftRef.current
        save(draft.title, draft.content, draft.tags, { silent: true }).catch(() => {})
      }
    }
  }, [save])

  const handleTitleChange = (v) => { setTitle(v); scheduleAutosave(v, content, tags) }
  const handleContentChange = (v) => { setContent(v); scheduleAutosave(title, v, tags) }

  const handleTagToggle = (key) => {
    const next = tags.includes(key) ? tags.filter(t => t !== key) : [key, ...tags.filter(t => t !== key)]
    setTags(next)
    scheduleAutosave(title, content, next)
  }

  // Session-reflection entries get an auto title + tag; any fresh entry
  // (session-triggered or a blank one from Notebook's "+") gets AI prompts —
  // grounded in the session just finished, or in current tasks otherwise.
  useEffect(() => {
    if (isSessionReflection) {
      const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      setTitle(prev => prev || `Practice Reflection · ${dateLabel}`)
      setTags(prev => prev.includes('reflection') ? prev : ['reflection', ...prev])
    }

    if (!isFreshEntry) return
    const seed = route.params?.reflectionSeed || { tasks: tasks.slice(0, 5) }

    let cancelled = false
    getReflectionPrompts(seed)
      .then(p => { if (!cancelled) setPrompts(p) })
      .finally(() => { if (!cancelled) setPromptsLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drop a prompt into the body as a heading to write an answer under.
  const addPrompt = (text) => {
    const next = content ? `${content.trimEnd()}\n\n${text}\n` : `${text}\n`
    setContent(next)
    scheduleAutosave(title, next, tags)
  }

  const handleDone = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await save(title, content, tags)
    navigation.goBack()
  }

  const handleDelete = () => {
    Alert.alert('Delete Entry', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (entryIdRef.current) await db.deleteNotebookEntry(entryIdRef.current)
          navigation.goBack()
        },
      },
    ])
  }

  const savedLabel = () => {
    if (saving) return 'Saving...'
    if (!savedAt) return ''
    const secs = Math.round((Date.now() - savedAt) / 1000)
    if (secs < 5) return 'Saved'
    if (secs < 60) return `Saved ${secs}s ago`
    return `Saved ${Math.round(secs / 60)}m ago`
  }

  const insets = useSafeAreaInsets()

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Toolbar */}
      <View
        className="flex-row items-center justify-between px-4 pb-2 border-b border-gray-100"
        style={{ paddingTop: insets.top + 8 }}
      >
        <TouchableOpacity onPress={handleDone} className="py-1 pr-3">
          <Text className="text-indigo-500 font-semibold text-base">‹ Done</Text>
        </TouchableOpacity>
        <Text className="text-xs text-gray-400">{savedLabel()}</Text>
        <TouchableOpacity onPress={handleDelete} className="py-1 pl-3">
          <Text className="text-red-400 text-sm font-medium">Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <TextInput
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Title"
          placeholderTextColor="#d1d5db"
          style={{ fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 12 }}
          multiline={false}
          returnKeyType="next"
        />

        {/* Tag chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 20, marginBottom: 20 }}
        >
          {TAGS.map(tag => {
            const active = tags.includes(tag.key)
            return (
              <TouchableOpacity
                key={tag.key}
                onPress={() => handleTagToggle(tag.key)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 999, borderWidth: 1,
                  backgroundColor: active ? tag.bg : 'white',
                  borderColor: active ? tag.text : '#e5e7eb',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: active ? tag.text : '#9ca3af' }}>
                  {tag.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Guided AI prompts — shown for any fresh entry, not just post-session */}
        {isFreshEntry && (
          <View className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-5">
            <Text className="text-amber-800 font-semibold text-sm mb-1">
              {isSessionReflection ? 'Reflect on this session ✨' : 'Need inspiration? ✨'}
            </Text>
            {promptsLoading ? (
              <Text className="text-amber-500 text-sm italic mt-1">Thinking of prompts for you…</Text>
            ) : (
              <>
                <Text className="text-amber-600 text-xs mb-3">Tap a prompt to add it to your entry.</Text>
                {prompts.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => addPrompt(p)}
                    className="flex-row items-start gap-2 py-2 border-t border-amber-100"
                  >
                    <Text className="text-amber-400 font-bold text-base leading-6">＋</Text>
                    <Text className="flex-1 text-amber-900 text-sm leading-6">{p}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {/* Divider */}
        <View className="h-px bg-gray-100 mb-4" />

        {/* Body */}
        <TextInput
          value={content}
          onChangeText={handleContentChange}
          placeholder="Start writing..."
          placeholderTextColor="#d1d5db"
          style={{
            fontSize: 16,
            color: '#1f2937',
            lineHeight: 26,
            minHeight: 400,
            textAlignVertical: 'top',
          }}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

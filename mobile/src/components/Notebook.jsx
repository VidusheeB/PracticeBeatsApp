import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator } from 'react-native'
import { useState, useCallback } from 'react'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useApp } from '../contexts/AppContext'
import { db } from '../utils/supabase'

const TAG_META = {
  reflection:    { label: 'Reflection',    symbol: '✦' },
  lesson_note:   { label: 'Lesson Note',   symbol: '♩' },
  music_writing: { label: 'Music Writing', symbol: '♪' },
  technique:     { label: 'Technique',     symbol: '◈' },
  repertoire:    { label: 'Repertoire',    symbol: '♫' },
  general:       { label: 'General',       symbol: '·' },
}

const CREAM = '#F8F7FF'
const CREAM_DARK = '#EEEDF8'
const INK = '#1C1B2E'
const INK_LIGHT = '#6B6880'
const INK_FAINT = '#A8A6BE'
const RULE = '#E0DFF0'
const ACCENT = '#6366f1'

function formatDateShort(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function preview(content, maxLen = 80) {
  if (!content) return ''
  const stripped = content.replace(/\n/g, ' ').trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped
}

export default function Notebook() {
  const navigation = useNavigation()
  const { user, updateProfile, setToast } = useApp()

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [aiReadEnabled, setAIReadEnabled] = useState(user?.ai_read_notebook || false)
  const [showContents, setShowContents] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await db.getNotebookEntries(user.id)
      setEntries(data)
    } catch {
      setToast('Failed to load notebook', 'error')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleNewEntry = async () => {
    try {
      const entry = await db.createNotebookEntry(user.id, { title: '', content: '', tags: [] })
      navigation.navigate('NotebookEditor', { entry })
    } catch {
      setToast('Failed to create entry', 'error')
    }
  }

  const handleToggleAIRead = async (value) => {
    const prev = aiReadEnabled
    setAIReadEnabled(value)
    try {
      await updateProfile({ ai_read_notebook: value })
      setToast(
        value ? 'Claude will read your notebook for coaching context' : 'Notebook hidden from Claude',
        'success'
      )
    } catch (err) {
      setAIReadEnabled(prev)
      setToast(err.message || 'Failed to update', 'error')
    }
  }

  const filtered = entries.filter(e =>
    !search ||
    (e.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.content || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Book cover / title area */}
        <View style={{
          backgroundColor: CREAM_DARK,
          borderBottomWidth: 2,
          borderBottomColor: RULE,
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 20,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, letterSpacing: 3, color: INK_FAINT, textTransform: 'uppercase', marginBottom: 6 }}>
                Practice Journal
              </Text>
              <Text style={{ fontSize: 26, fontWeight: '700', color: INK, letterSpacing: -0.5, lineHeight: 32 }}>
                {`${user?.name?.split(' ')[0] || 'My'}'s Notebook`}
              </Text>
              <Text style={{ fontSize: 13, color: INK_LIGHT, marginTop: 4 }}>
                {entries.length === 0 ? 'No entries yet' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setShowSearch(!showSearch)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: RULE, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 16 }}>🔍</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNewEntry}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: ACCENT,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: 'white', fontSize: 22, lineHeight: 28, marginTop: -2 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showSearch && (
            <TextInput
              style={{
                marginTop: 14,
                backgroundColor: 'white',
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 9,
                fontSize: 14,
                color: INK,
                borderWidth: 1,
                borderColor: RULE,
              }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search entries…"
              placeholderTextColor={INK_FAINT}
              autoFocus
            />
          )}

          {/* AI read toggle */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: RULE,
          }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: INK_LIGHT }}>Let Claude read this</Text>
              <Text style={{ fontSize: 11, color: INK_FAINT, marginTop: 1 }}>Adds notebook context to AI coaching</Text>
            </View>
            <Switch
              value={aiReadEnabled}
              onValueChange={handleToggleAIRead}
              trackColor={{ false: RULE, true: ACCENT }}
              thumbColor="white"
            />
          </View>
        </View>

        {loading ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ paddingTop: 60, paddingHorizontal: 32, alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 48 }}>📓</Text>
            {search ? (
              <Text style={{ color: INK_LIGHT, textAlign: 'center', fontSize: 15 }}>
                No entries matching "{search}"
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 18, fontWeight: '600', color: INK, textAlign: 'center' }}>
                  Your notebook is empty
                </Text>
                <Text style={{ color: INK_LIGHT, textAlign: 'center', fontSize: 14, lineHeight: 22 }}>
                  Write session reflections, lesson notes, music ideas, or anything you want Claude to know about your practice.
                </Text>
                <TouchableOpacity
                  onPress={handleNewEntry}
                  style={{ backgroundColor: ACCENT, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10, marginTop: 4 }}
                >
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>Write First Entry</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <>
            {/* Inline Contents / TOC */}
            <View style={{ marginHorizontal: 24, marginTop: 24, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => setShowContents(!showContents)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}
              >
                <Text style={{ fontSize: 11, letterSpacing: 3, color: INK_FAINT, textTransform: 'uppercase' }}>
                  Contents
                </Text>
                <Text style={{ fontSize: 12, color: INK_FAINT }}>{showContents ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {showContents && (
                <View style={{ borderTopWidth: 1, borderTopColor: RULE }}>
                  {filtered.map((entry, i) => {
                    const tagKey = entry.tags?.[0]
                    const tagMeta = TAG_META[tagKey] || TAG_META.general
                    return (
                      <TouchableOpacity
                        key={entry.id}
                        onPress={() => navigation.navigate('NotebookEditor', { entry })}
                        style={{
                          flexDirection: 'row', alignItems: 'baseline',
                          paddingVertical: 9,
                          borderBottomWidth: 1,
                          borderBottomColor: RULE,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: INK_FAINT, width: 26, fontVariant: ['tabular-nums'] }}>
                          {i + 1}
                        </Text>
                        <Text style={{ fontSize: 13, color: ACCENT, marginRight: 6 }}>{tagMeta.symbol}</Text>
                        <Text
                          style={{ flex: 1, fontSize: 14, color: INK, fontWeight: '500' }}
                          numberOfLines={1}
                        >
                          {entry.title || 'Untitled'}
                        </Text>
                        <Text style={{ fontSize: 12, color: INK_FAINT, marginLeft: 8, flexShrink: 0 }}>
                          {formatDateShort(entry.updated_at)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>

            {/* Rule */}
            <View style={{ marginHorizontal: 24, marginVertical: 20, height: 1, backgroundColor: RULE }} />

            {/* Chapters */}
            <View style={{ paddingHorizontal: 24, gap: 0 }}>
              {filtered.map((entry, i) => {
                const tagKey = entry.tags?.[0]
                const tagMeta = TAG_META[tagKey] || TAG_META.general
                return (
                  <TouchableOpacity
                    key={entry.id}
                    onPress={() => navigation.navigate('NotebookEditor', { entry })}
                    activeOpacity={0.7}
                    style={{
                      paddingVertical: 20,
                      borderBottomWidth: 1,
                      borderBottomColor: RULE,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: INK_FAINT, letterSpacing: 1, textTransform: 'uppercase' }}>
                        {tagMeta.symbol} {tagMeta.label}
                      </Text>
                      {entry.session_id && (
                        <Text style={{ fontSize: 11, color: ACCENT, letterSpacing: 1, textTransform: 'uppercase' }}>
                          · Post-session
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: INK, letterSpacing: -0.3, lineHeight: 24, marginBottom: 6 }}>
                      {entry.title || 'Untitled'}
                    </Text>
                    {!!entry.content && (
                      <Text style={{ fontSize: 14, color: INK_LIGHT, lineHeight: 21 }}>
                        {preview(entry.content)}
                      </Text>
                    )}
                    <Text style={{ fontSize: 12, color: INK_FAINT, marginTop: 10 }}>
                      {formatDateShort(entry.updated_at)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

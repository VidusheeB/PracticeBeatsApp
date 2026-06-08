import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useState, useEffect } from 'react'
import { useNavigation } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useApp } from '../contexts/AppContext'
import { db } from '../utils/supabase'

const MOOD_EMOJI = { 1: '😫', 2: '😞', 3: '😐', 4: '😊', 5: '🤩' }

function formatDate(isoString) {
  const d = new Date(isoString)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(isoString) {
  const d = new Date(isoString)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function PracticeSessionsLog() {
  const navigation = useNavigation()
  const { user } = useApp()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    db.getSessions(user.id).then(data => {
      setSessions(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user?.id])

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
  const totalXP = sessions.reduce((sum, s) => sum + (s.points_earned || 0), 0)

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pt-4 pb-24">
        {/* Header */}
        <View className="flex-row items-center gap-3 mb-4">
          <TouchableOpacity onPress={() => navigation.goBack()} className="w-9 h-9 bg-white rounded-full items-center justify-center shadow-sm">
            <Text className="text-gray-600 text-lg">‹</Text>
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-bold text-gray-900">Practice History</Text>
            <Text className="text-gray-500 text-sm">{sessions.length} sessions logged</Text>
          </View>
        </View>

        {/* Summary row */}
        {sessions.length > 0 && (
          <View className="bg-indigo-500 rounded-2xl p-4 mb-5 flex-row justify-around">
            <View className="items-center">
              <Text className="text-white text-2xl font-bold">{Math.round(totalMinutes / 60)}h</Text>
              <Text className="text-indigo-200 text-xs">Total Time</Text>
            </View>
            <View className="w-px bg-indigo-400" />
            <View className="items-center">
              <Text className="text-white text-2xl font-bold">{sessions.length}</Text>
              <Text className="text-indigo-200 text-xs">Sessions</Text>
            </View>
            <View className="w-px bg-indigo-400" />
            <View className="items-center">
              <Text className="text-white text-2xl font-bold">{totalXP}</Text>
              <Text className="text-indigo-200 text-xs">XP Earned</Text>
            </View>
          </View>
        )}

        {loading ? (
          <View className="bg-white rounded-2xl p-12 items-center">
            <Text className="text-gray-400">Loading...</Text>
          </View>
        ) : sessions.length === 0 ? (
          <View className="bg-white rounded-2xl p-12 items-center">
            <Text className="text-4xl mb-3">🎵</Text>
            <Text className="text-gray-500">No sessions yet.</Text>
            <Text className="text-sm text-gray-400 mt-1">Start practicing to see your history here.</Text>
          </View>
        ) : (
          <View className="gap-3">
            {sessions.map(session => {
              const isOpen = expanded === session.id
              const avgRating = [session.focus_rating, session.progress_rating, session.energy_rating]
                .filter(Boolean)
                .reduce((a, b, _, arr) => a + b / arr.length, 0)
              return (
                <TouchableOpacity
                  key={session.id}
                  onPress={() => setExpanded(isOpen ? null : session.id)}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden"
                  activeOpacity={0.8}
                >
                  <View className="px-4 py-4 flex-row items-center gap-3">
                    <View className="w-12 h-12 bg-indigo-50 rounded-xl items-center justify-center">
                      <Text className="text-indigo-500 font-bold text-sm">{session.duration_minutes}m</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-900">{formatDate(session.start_time)}</Text>
                      <Text className="text-sm text-gray-500">{formatTime(session.start_time)}</Text>
                    </View>
                    <View className="items-end gap-1">
                      {session.points_earned > 0 && (
                        <Text className="text-xs text-indigo-500 font-medium">+{session.points_earned} XP</Text>
                      )}
                      {avgRating > 0 && (
                        <Text className="text-base">{MOOD_EMOJI[Math.round(avgRating)]}</Text>
                      )}
                    </View>
                    <Text className="text-gray-300 text-sm ml-1">{isOpen ? '▲' : '▼'}</Text>
                  </View>

                  {isOpen && (
                    <View className="px-4 pb-4 border-t border-gray-50 pt-3 gap-2">
                      {(session.focus_rating || session.progress_rating || session.energy_rating) && (
                        <View className="flex-row gap-4">
                          {session.focus_rating && (
                            <View className="items-center">
                              <Text className="text-lg">{MOOD_EMOJI[session.focus_rating]}</Text>
                              <Text className="text-xs text-gray-400">Focus</Text>
                            </View>
                          )}
                          {session.progress_rating && (
                            <View className="items-center">
                              <Text className="text-lg">{MOOD_EMOJI[session.progress_rating]}</Text>
                              <Text className="text-xs text-gray-400">Progress</Text>
                            </View>
                          )}
                          {session.energy_rating && (
                            <View className="items-center">
                              <Text className="text-lg">{MOOD_EMOJI[session.energy_rating]}</Text>
                              <Text className="text-xs text-gray-400">Energy</Text>
                            </View>
                          )}
                        </View>
                      )}
                      {session.notes ? (
                        <Text className="text-sm text-gray-600 italic">"{session.notes}"</Text>
                      ) : null}
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

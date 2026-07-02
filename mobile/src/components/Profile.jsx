import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native'
import { useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useApp } from '../contexts/AppContext'
import GoogleCalendarConnect from './GoogleCalendarConnect'

export default function Profile() {
  const { user, logout, joinTeacher, updateProfile, setToast } = useApp()
  const navigation = useNavigation()

  const [teacherCode, setTeacherCode] = useState('')
  const [joining, setJoining] = useState(false)

  // Editable profile fields
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(user?.name || '')
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalValue, setGoalValue] = useState(String(user?.weekly_goal_minutes ?? 120))
  const [savingProfile, setSavingProfile] = useState(false)

  const handleJoinTeacher = async () => {
    if (teacherCode.trim().length !== 6) { setToast('Enter the 6-digit code from your teacher', 'error'); return }
    setJoining(true)
    try {
      await joinTeacher(teacherCode.trim())
      setTeacherCode('')
    } catch (err) {
      setToast(err.message, 'error')
    } finally {
      setJoining(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ])
  }

  const handleSaveName = async () => {
    if (!nameValue.trim()) return
    setSavingProfile(true)
    try {
      await updateProfile({ name: nameValue.trim() })
      setEditingName(false)
      setToast('Name updated', 'success')
    } catch (err) {
      setToast(err.message, 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSaveGoal = async () => {
    const mins = parseInt(goalValue)
    if (!mins || mins < 1 || mins > 10080) { setToast('Enter a valid number of minutes (1–10080)', 'error'); return }
    setSavingProfile(true)
    try {
      await updateProfile({ weekly_goal_minutes: mins })
      setEditingGoal(false)
      setToast('Weekly goal updated', 'success')
    } catch (err) {
      setToast(err.message, 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const xpIntoLevel = (user?.total_points ?? 0) % 100

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
    <ScrollView contentContainerClassName="px-4 pt-4 pb-24 gap-5">

      {/* Profile card */}
      <View className="bg-white rounded-2xl p-6 shadow-sm items-center gap-3">
        <View className="w-20 h-20 rounded-full bg-indigo-100 items-center justify-center">
          <Text style={{ fontSize: 40 }}>{(user?.name || '?').charAt(0).toUpperCase()}</Text>
        </View>

        {editingName ? (
          <View className="w-full flex-row gap-2 items-center">
            <TextInput
              className="flex-1 border border-indigo-300 rounded-xl px-3 py-2 text-base text-gray-900 text-center"
              value={nameValue}
              onChangeText={setNameValue}
              autoFocus
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity onPress={handleSaveName} disabled={savingProfile} className="bg-indigo-500 px-4 py-2 rounded-xl">
              <Text className="text-white font-medium text-sm">{savingProfile ? '...' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingName(false); setNameValue(user?.name || '') }}>
              <Text className="text-gray-400 px-2">✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditingName(true)} className="flex-row items-center gap-2">
            <Text className="text-xl font-bold text-gray-900">{user?.name}</Text>
            <Text className="text-gray-400 text-sm">✏️</Text>
          </TouchableOpacity>
        )}

        <Text className="text-gray-500 capitalize">
          {user?.instrument || 'No instrument set'}{user?.section ? ` · ${user.section}` : ''}
        </Text>

        <View className="flex-row gap-6 pt-3 border-t border-gray-100 w-full justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold text-indigo-500">Lv {user?.level ?? 1}</Text>
            <Text className="text-xs text-gray-500">Level</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold text-orange-500">{user?.streak_count ?? 0}</Text>
            <Text className="text-xs text-gray-500">Day Streak</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold text-purple-500">{user?.total_points ?? 0}</Text>
            <Text className="text-xs text-gray-500">Total XP</Text>
          </View>
        </View>

        <View className="w-full">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-400">Level {user?.level ?? 1}</Text>
            <Text className="text-xs text-gray-400">{xpIntoLevel}/100 XP</Text>
          </View>
          <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <View className="h-2 bg-indigo-500 rounded-full" style={{ width: `${xpIntoLevel}%` }} />
          </View>
        </View>
      </View>

      {/* Weekly goal */}
      <View className="bg-white rounded-2xl p-4 shadow-sm gap-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Text style={{ fontSize: 22 }}>🎯</Text>
            <Text className="font-semibold text-gray-900">Weekly Practice Goal</Text>
          </View>
          {!editingGoal && (
            <TouchableOpacity onPress={() => setEditingGoal(true)}>
              <Text className="text-indigo-500 text-sm font-medium">Edit</Text>
            </TouchableOpacity>
          )}
        </View>
        {editingGoal ? (
          <View className="flex-row gap-2 items-center">
            <TextInput
              className="flex-1 border border-indigo-300 rounded-xl px-3 py-2 text-base text-gray-900"
              value={goalValue}
              onChangeText={v => setGoalValue(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              autoFocus
            />
            <Text className="text-gray-500">min / week</Text>
            <TouchableOpacity onPress={handleSaveGoal} disabled={savingProfile} className="bg-indigo-500 px-4 py-2 rounded-xl">
              <Text className="text-white font-medium text-sm">{savingProfile ? '...' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingGoal(false); setGoalValue(String(user?.weekly_goal_minutes ?? 120)) }}>
              <Text className="text-gray-400 px-1">✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text className="text-gray-500 text-sm">{user?.weekly_goal_minutes ?? 120} min / week</Text>
            <View className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
              <View
                className="h-2 bg-indigo-500 rounded-full"
                style={{ width: `${Math.min(((user?.weekly_minutes ?? 0) / (user?.weekly_goal_minutes ?? 120)) * 100, 100)}%` }}
              />
            </View>
            <Text className="text-xs text-gray-400 mt-1">
              {user?.weekly_minutes ?? 0} / {user?.weekly_goal_minutes ?? 120} min this week
            </Text>
          </View>
        )}
      </View>

      {/* Google Calendar OAuth */}
      <GoogleCalendarConnect />

      {/* Teacher section */}
      {user?.role === 'teacher' ? (
        <View className="bg-blue-50 rounded-2xl p-4 gap-2">
          <Text className="text-sm font-medium text-gray-600">Your Teacher Code</Text>
          <Text className="text-3xl font-mono font-bold text-indigo-500 tracking-widest">
            {user?.teacher_code || '------'}
          </Text>
          <Text className="text-xs text-gray-500">Share this with students so they can join your class</Text>
        </View>
      ) : user?.teacher_id ? (
        <View className="bg-white rounded-2xl p-4 shadow-sm gap-3">
          <Text className="font-semibold text-gray-900">Your Teacher</Text>
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center">
              <Text style={{ fontSize: 20 }}>👨‍🏫</Text>
            </View>
            <Text className="flex-1 text-gray-600">Linked to your teacher</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Messages')}
              className="bg-indigo-500 px-4 py-2 rounded-xl"
            >
              <Text className="text-white font-medium text-sm">Messages</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="bg-white rounded-2xl p-4 shadow-sm gap-3">
          <Text className="font-semibold text-gray-900">Join a Teacher</Text>
          <Text className="text-sm text-gray-500">
            Enter your teacher's 6-digit code to connect and unlock messaging
          </Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-mono"
            value={teacherCode}
            onChangeText={t => setTeacherCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            onPress={handleJoinTeacher}
            disabled={joining || teacherCode.length !== 6}
            className={`py-3 rounded-xl items-center ${joining || teacherCode.length !== 6 ? 'bg-indigo-300' : 'bg-indigo-500'}`}
          >
            <Text className="text-white font-semibold">{joining ? 'Joining...' : 'Join Teacher'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick links */}
      <View className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {user?.role !== 'teacher' && (
          <TouchableOpacity
            onPress={() => navigation.navigate('StudentEnsembleView')}
            className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100"
          >
            <View className="flex-row items-center gap-3">
              <Text style={{ fontSize: 22 }}>🎼</Text>
              <Text className="font-medium text-gray-900">My Classes & Challenges</Text>
            </View>
            <Text className="text-gray-400 text-lg">›</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => navigation.navigate('Notebook')}
          className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100"
        >
          <View className="flex-row items-center gap-3">
            <Text style={{ fontSize: 22 }}>📓</Text>
            <Text className="font-medium text-gray-900">My Notebook</Text>
          </View>
          <Text className="text-gray-400 text-lg">›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Achievements')}
          className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100"
        >
          <View className="flex-row items-center gap-3">
            <Text style={{ fontSize: 22 }}>🏆</Text>
            <Text className="font-medium text-gray-900">Achievements & Badges</Text>
          </View>
          <Text className="text-gray-400 text-lg">›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('PracticeSessionsLog')}
          className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100"
        >
          <View className="flex-row items-center gap-3">
            <Text style={{ fontSize: 22 }}>📅</Text>
            <Text className="font-medium text-gray-900">Practice History</Text>
          </View>
          <Text className="text-gray-400 text-lg">›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('PrivacyPolicy')}
          className="flex-row items-center justify-between px-4 py-4"
        >
          <View className="flex-row items-center gap-3">
            <Text style={{ fontSize: 22 }}>🔒</Text>
            <Text className="font-medium text-gray-900">Privacy Policy</Text>
          </View>
          <Text className="text-gray-400 text-lg">›</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={handleLogout} className="bg-red-50 rounded-2xl p-4 items-center">
        <Text className="text-red-500 font-semibold">Log Out</Text>
      </TouchableOpacity>

    </ScrollView>
    </SafeAreaView>
  )
}

import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useEffect, useCallback } from 'react'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useApp } from '../contexts/AppContext'
import { db } from '../utils/supabase'

export default function EnsembleList() {
  const { user, createEnsemble, archiveEnsemble, deleteEnsemble } = useApp()
  const navigation = useNavigation()
  const [ensembles, setEnsembles] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    const data = await db.getTeacherEnsembles(user.id)
    setEnsembles(data)
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const active = ensembles.filter(e => !e.archived)
  const archived = ensembles.filter(e => e.archived)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await createEnsemble(name.trim(), description.trim())
      setName(''); setDescription(''); setShowCreate(false)
      await load()
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleArchive = (ensemble) => {
    Alert.alert(
      ensemble.archived ? 'Restore Class' : 'Archive Class',
      ensemble.archived
        ? `Restore "${ensemble.name}" to your active classes?`
        : `Archive "${ensemble.name}"? Students won't lose their data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: ensemble.archived ? 'Restore' : 'Archive', onPress: async () => {
          await archiveEnsemble(ensemble.id, !ensemble.archived)
          await load()
        }},
      ]
    )
  }

  const handleDelete = (ensemble) => {
    Alert.alert(
      'Delete Class',
      `This will permanently delete "${ensemble.name}" and all its assignments and challenges. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteEnsemble(ensemble.id)
          await load()
        }},
      ]
    )
  }

  const EnsembleCard = ({ ensemble }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('EnsembleDetail', { ensemble })}
      className="bg-white rounded-2xl p-4 shadow-sm"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="font-semibold text-gray-900 text-base">{ensemble.name}</Text>
          {!!ensemble.description && (
            <Text className="text-sm text-gray-500 mt-0.5">{ensemble.description}</Text>
          )}
        </View>
        <Text className="text-gray-400 text-lg ml-2">›</Text>
      </View>
      <View className="flex-row gap-2 mt-3">
        <TouchableOpacity
          onPress={() => handleArchive(ensemble)}
          className="flex-1 py-1.5 rounded-lg bg-gray-100 items-center"
        >
          <Text className="text-xs text-gray-600">{ensemble.archived ? 'Restore' : 'Archive'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDelete(ensemble)}
          className="flex-1 py-1.5 rounded-lg bg-red-50 items-center"
        >
          <Text className="text-xs text-red-500">Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
    <ScrollView contentContainerClassName="px-4 pt-4 pb-24 gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-gray-900">Classes</Text>
        <TouchableOpacity
          onPress={() => setShowCreate(!showCreate)}
          className="bg-indigo-500 px-4 py-2 rounded-xl"
        >
          <Text className="text-white font-semibold text-sm">+ New Class</Text>
        </TouchableOpacity>
      </View>

      {showCreate && (
        <View className="bg-white rounded-2xl p-4 shadow-sm gap-3">
          <Text className="font-semibold text-gray-900">New Class</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Jazz Band A"
            autoFocus
          />
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3"
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
          />
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={handleCreate}
              disabled={creating || !name.trim()}
              className={`flex-1 py-3 rounded-xl items-center ${creating || !name.trim() ? 'bg-indigo-300' : 'bg-indigo-500'}`}
            >
              <Text className="text-white font-semibold">{creating ? 'Creating...' : 'Create'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreate(false)} className="px-4 py-3 bg-gray-100 rounded-xl">
              <Text className="text-gray-700">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {active.length === 0 && !showCreate ? (
        <View className="bg-white rounded-2xl py-12 items-center">
          <Text className="text-4xl mb-2">🎵</Text>
          <Text className="text-gray-500">No classes yet</Text>
          <Text className="text-sm text-gray-400 mt-1">Create your first class to get started</Text>
        </View>
      ) : (
        <View className="gap-3">
          {active.map(e => <EnsembleCard key={e.id} ensemble={e} />)}
        </View>
      )}

      <TouchableOpacity
        onPress={() => navigation.navigate('AllStudents')}
        className="bg-white rounded-2xl p-4 shadow-sm flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-3">
          <Text style={{ fontSize: 22 }}>👥</Text>
          <View>
            <Text className="font-medium text-gray-900">All My Students</Text>
            <Text className="text-xs text-gray-500">Roster, teacher code, individual notes</Text>
          </View>
        </View>
        <Text className="text-gray-400 text-lg">›</Text>
      </TouchableOpacity>

      {archived.length > 0 && (
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => setShowArchived(!showArchived)}
            className="flex-row items-center gap-2"
          >
            <Text className="text-sm font-medium text-gray-500">
              Archived ({archived.length})
            </Text>
            <Text className="text-gray-400">{showArchived ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showArchived && archived.map(e => (
            <View key={e.id} className="opacity-60">
              <EnsembleCard ensemble={e} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
    </SafeAreaView>
  )
}

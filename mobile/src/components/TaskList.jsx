import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native'
import { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useApp } from '../contexts/AppContext'
import TaskCard from './TaskCard'
import SmartTaskCreate from './SmartTaskCreate'

const categories = [
  { value: 'repertoire', label: 'Repertoire', icon: '🎵' },
  { value: 'technique', label: 'Technique', icon: '🎯' },
  { value: 'sight_reading', label: 'Sight Reading', icon: '👀' },
  { value: 'section_work', label: 'Section Work', icon: '👥' },
]

const filters = [
  { value: 'all', label: 'All' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready', label: 'Ready' },
]

export default function TaskList() {
  const { tasks, createTask, deleteTask } = useApp()

  const [filter, setFilter] = useState('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showSmartCreate, setShowSmartCreate] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', category: 'repertoire', difficulty: 3, estimated_minutes: '30' })

  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.status === 'ready' && b.status !== 'ready') return 1
    if (b.status === 'ready' && a.status !== 'ready') return -1
    return (a.readiness_score ?? 0) - (b.readiness_score ?? 0)
  })

  const handleCreate = async () => {
    if (!newTask.title.trim()) return
    try {
      await createTask({ title: newTask.title, category: newTask.category, difficulty: newTask.difficulty, estimated_minutes: parseInt(newTask.estimated_minutes) || 30 })
      setNewTask({ title: '', category: 'repertoire', difficulty: 3, estimated_minutes: '30' })
      setShowCreateForm(false)
    } catch {}
  }

  const handleDelete = (taskId) => {
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTask(taskId) },
    ])
  }

  const filterCounts = {
    all: tasks.length,
    not_started: tasks.filter(t => t.status === 'not_started').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    ready: tasks.filter(t => t.status === 'ready').length,
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
    <ScrollView contentContainerClassName="px-4 pt-4 pb-24">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-bold text-gray-900">Tasks</Text>
          <Text className="text-gray-500">{tasks.length} total tasks</Text>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => setShowSmartCreate(true)}
            className="bg-indigo-500 px-3 py-2 rounded-xl flex-row items-center gap-1"
          >
            <Text className="text-white font-semibold text-sm">✨ Smart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowCreateForm(!showCreateForm)}
            className="bg-gray-100 px-3 py-2 rounded-xl"
          >
            <Text className="text-gray-700 font-semibold text-sm">+ Manual</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SmartTaskCreate
        visible={showSmartCreate}
        onClose={() => setShowSmartCreate(false)}
        onSave={async (parsed) => {
          try {
            await createTask(parsed)
          } catch {}
        }}
      />

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
        <View className="flex-row gap-2">
          {filters.map(f => (
            <TouchableOpacity
              key={f.value}
              onPress={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-full ${filter === f.value ? 'bg-indigo-500' : 'bg-gray-100'}`}
            >
              <Text className={`text-sm font-medium ${filter === f.value ? 'text-white' : 'text-gray-600'}`}>
                {f.label} ({filterCounts[f.value]})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Create Form */}
      {showCreateForm && (
        <View className="bg-white rounded-2xl p-4 mb-4 gap-4 shadow-sm">
          <Text className="font-semibold text-gray-900">New Practice Task</Text>

          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3"
            value={newTask.title}
            onChangeText={v => setNewTask({ ...newTask, title: v })}
            placeholder="e.g., Autumn Leaves - Solo Section"
          />

          <View className="flex-row flex-wrap gap-2">
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.value}
                onPress={() => setNewTask({ ...newTask, category: cat.value })}
                className={`py-3 rounded-xl border-2 items-center justify-center ${
                  newTask.category === cat.value ? 'bg-indigo-50 border-indigo-500' : 'bg-gray-50 border-transparent'
                }`}
                style={{ width: '47%' }}
              >
                <Text className="text-xl mb-1">{cat.icon}</Text>
                <Text className="text-xs font-medium text-center">{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="text-sm text-gray-600 mb-1">Difficulty</Text>
              <View className="flex-row gap-1">
                {[1,2,3,4,5].map(level => (
                  <TouchableOpacity key={level} onPress={() => setNewTask({ ...newTask, difficulty: level })} className="flex-1 py-2 items-center">
                    <Text className={level <= newTask.difficulty ? 'text-amber-400 text-xl' : 'text-gray-300 text-xl'}>★</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View className="flex-1">
              <Text className="text-sm text-gray-600 mb-1">Est. Time (min)</Text>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-2"
                value={newTask.estimated_minutes}
                onChangeText={v => setNewTask({ ...newTask, estimated_minutes: v.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View className="flex-row gap-2">
            <TouchableOpacity onPress={handleCreate} className="flex-1 bg-indigo-500 rounded-xl py-3 items-center">
              <Text className="text-white font-semibold">Create Task</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreateForm(false)} className="px-4 py-3 bg-gray-100 rounded-xl">
              <Text className="text-gray-700">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Task List */}
      {sortedTasks.length > 0 ? (
        <View className="gap-3">
          {sortedTasks.map(task => (
            <View key={task.id}>
              <TaskCard task={task} rehearsal={null} />
              <TouchableOpacity
                onPress={() => handleDelete(task.id)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-50 items-center justify-center"
              >
                <Text className="text-red-500 text-xs">✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View className="bg-white rounded-2xl py-12 items-center">
          <Text className="text-4xl mb-2">{filter === 'ready' ? '🎉' : '📝'}</Text>
          <Text className="text-gray-500">
            {filter === 'all' ? 'No tasks yet. Add your first task!'
              : filter === 'ready' ? 'No tasks are ready yet. Keep practicing!'
              : `No ${filter.replace('_', ' ')} tasks`}
          </Text>
        </View>
      )}
    </ScrollView>
    </SafeAreaView>
  )
}

import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native'
import { useState } from 'react'

// Mandatory bottom sheet shown before every practice session — free practice
// included. No skip button and onRequestClose is a no-op: the user must name
// 3 goals before the timer can start. Goals flow into the session's reflection
// seed so the AI reflection prompts can ask whether they were met.
export default function SessionGoalsModal({ onDone }) {
  const [goals, setGoals] = useState(['', '', ''])

  const setGoal = (i, text) => {
    const next = [...goals]
    next[i] = text
    setGoals(next)
  }

  const trimmed = goals.map(g => g.trim())
  const allFilled = trimmed.every(g => g.length > 0)

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => {}}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">

          <View className="w-12 h-1 bg-gray-200 rounded-full self-center mb-5" />

          <Text className="text-xl font-bold text-gray-900 mb-0.5">Set 3 Goals</Text>
          <Text className="text-sm text-gray-400 mb-5">
            Required before every session — keeps you focused and gives Claude something concrete to coach against.
          </Text>

          {[0, 1, 2].map(i => (
            <View key={i} className="mb-3">
              <Text className="text-xs font-medium text-gray-500 mb-1">Goal {i + 1}</Text>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-gray-50"
                value={goals[i]}
                onChangeText={(t) => setGoal(i, t)}
                placeholder={
                  i === 0 ? 'e.g. Clean up bars 9–16 at 60% tempo'
                  : i === 1 ? 'e.g. Run the B section without stopping'
                  : 'e.g. Fix intonation on the high passage'
                }
                returnKeyType="next"
              />
            </View>
          ))}

          <TouchableOpacity
            onPress={() => onDone(trimmed)}
            disabled={!allFilled}
            className={`mt-3 py-4 rounded-xl items-center ${allFilled ? 'bg-indigo-500' : 'bg-indigo-200'}`}
          >
            <Text className="text-white font-semibold text-lg">Begin Practice</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  )
}

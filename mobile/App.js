import './global.css'

import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { supabase } from './src/utils/supabase'

import { AppProvider, useApp } from './src/contexts/AppContext'

import Login from './src/components/Login'
import Dashboard from './src/components/Dashboard'
import PracticeSession from './src/components/PracticeSession'
import Calendar from './src/components/Calendar'
import Messages from './src/components/Messages'
import TaskList from './src/components/TaskList'
import TeacherDashboard from './src/components/TeacherDashboard'
import Achievements from './src/components/Achievements'
import Profile from './src/components/Profile'
import EnsembleList from './src/components/EnsembleList'
import EnsembleDetail from './src/components/EnsembleDetail'
import AssignmentCreate from './src/components/AssignmentCreate'
import AssignmentDetail from './src/components/AssignmentDetail'
import ChallengeCreate from './src/components/ChallengeCreate'
import ChallengeLeaderboard from './src/components/ChallengeLeaderboard'
import StudentEnsembleView from './src/components/StudentEnsembleView'
import TaskDetail from './src/components/TaskDetail'
import PrivacyPolicy from './src/components/PrivacyPolicy'
import DeepCheckIn from './src/components/DeepCheckIn'
import Notebook from './src/components/Notebook'
import NotebookEditor from './src/components/NotebookEditor'
import AIChat from './src/components/AIChat'
import PracticeSessionsLog from './src/components/PracticeSessionsLog'
import Toast from './src/components/Toast'

const Tab = createBottomTabNavigator()
const Stack = createStackNavigator()

function MainTabs() {
  const { user } = useApp()
  const isTeacher = user?.role === 'teacher'

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopColor: '#e5e7eb',
          paddingBottom: 20,
          paddingTop: 8,
          height: 80,
        },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={Dashboard}
        options={{ tabBarLabel: 'Home', tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏠</Text> }}
      />
      <Tab.Screen
        name="Calendar"
        component={Calendar}
        options={{ tabBarLabel: 'Calendar', tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text> }}
      />
      <Tab.Screen
        name="Practice"
        component={PracticeSession}
        options={{
          tabBarLabel: 'Practice',
          tabBarIcon: () => (
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: '#6366f1',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              shadowColor: '#6366f1', shadowOpacity: 0.4, shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}>
              <Text style={{ color: 'white', fontSize: 22 }}>▶</Text>
            </View>
          ),
        }}
      />
      {isTeacher ? (
        <Tab.Screen
          name="Classes"
          component={EnsembleList}
          options={{ tabBarLabel: 'Classes', tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎼</Text> }}
        />
      ) : (
        <Tab.Screen
          name="Tasks"
          component={TaskList}
          options={{ tabBarLabel: 'Tasks', tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text> }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={Profile}
        options={{ tabBarLabel: 'Profile', tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text> }}
      />
    </Tab.Navigator>
  )
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="Achievements"
        component={Achievements}
        options={{ headerShown: true, title: 'Achievements', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="Messages"
        component={Messages}
        options={{ headerShown: true, title: 'Messages', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="EnsembleDetail"
        component={EnsembleDetail}
        options={{ headerShown: true, title: 'Class', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="AssignmentCreate"
        component={AssignmentCreate}
        options={{ headerShown: true, title: 'New Assignment', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="AssignmentDetail"
        component={AssignmentDetail}
        options={{ headerShown: true, title: 'Assignment', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="ChallengeCreate"
        component={ChallengeCreate}
        options={{ headerShown: true, title: 'New Challenge', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="ChallengeLeaderboard"
        component={ChallengeLeaderboard}
        options={{ headerShown: true, title: 'Leaderboard', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="StudentEnsembleView"
        component={StudentEnsembleView}
        options={{ headerShown: true, title: 'My Classes', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="AllStudents"
        component={TeacherDashboard}
        options={{ headerShown: true, title: 'All Students', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetail}
        options={{ headerShown: true, title: 'Task', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicy}
        options={{ headerShown: true, title: 'Privacy Policy', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="DeepCheckIn"
        component={DeepCheckIn}
        options={{ headerShown: true, title: 'Weekly Reflection', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="Notebook"
        component={Notebook}
        options={{ headerShown: true, title: 'Notebook', headerTintColor: '#6366f1' }}
      />
      <Stack.Screen
        name="NotebookEditor"
        component={NotebookEditor}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AIChat"
        component={AIChat}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PracticeSessionsLog"
        component={PracticeSessionsLog}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  )
}

function RootNavigator() {
  const { user, loading, toast, clearToast, loadUserData } = useApp()
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user.id).finally(() => setBootstrapping(false))
      } else {
        setBootstrapping(false)
      }
    })
  }, [])

  if (bootstrapping || loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>🎵</Text>
        <ActivityIndicator color="#6366f1" />
      </View>
    )
  }

  return (
    <>
      <NavigationContainer>
        {user ? <AppStack /> : <Login />}
      </NavigationContainer>
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  )
}

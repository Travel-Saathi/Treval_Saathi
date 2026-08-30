import { useAuth } from '@clerk/expo'
import { router } from 'expo-router'
import {
  SafeAreaView,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'

export default function ProfileScreen() {
  const { signOut } = useAuth()

  const handleSignOut = async () => {
    try {
      await signOut()

      // Send user back to Sign In page
      router.replace('/(auth)/sign-in')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
      >
        <Text style={styles.signOutText}>
          Sign Out
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },

  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },

  signOutButton: {
    backgroundColor: '#E53935',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },

  signOutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
})
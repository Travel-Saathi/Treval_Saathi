import { useAuth, useSignIn } from '@clerk/expo'
import { Link, router } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export default function SignInScreen() {
  const { isLoaded, isSignedIn } = useAuth()
  const { signIn } = useSignIn()

  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const onSignInPress = async () => {
    if (!isLoaded || loading) return

    try {
      setLoading(true)
      setErrorMessage('')

      const { error } = await signIn.password({
        emailAddress: emailAddress.trim(),
        password,
      })

      if (error) {
        setErrorMessage('Invalid email or password.')
        return
      }

      if (signIn.status === 'complete') {
        router.replace('/(root)/(tabs)')
        return
      }

      setErrorMessage('Sign in could not be completed.')
    } catch (error) {
      console.error('Sign in error:', error)
      setErrorMessage('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  if (!isLoaded) {
    return null
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Text style={styles.logo}>✈</Text>
          </View>

          <Text style={styles.brandName}>TRAVELER</Text>

          <Text style={styles.title}>Welcome Back</Text>

          <Text style={styles.subtitle}>
            Your next adventure is waiting for you
          </Text>

          <View style={styles.routeContainer}>
            <View style={styles.routeLine} />

            <View style={styles.routeDot} />

            <Text style={styles.routePlane}>✈</Text>

            <View style={styles.routeDot} />
          </View>
        </View>

        {/* Sign In Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Sign In</Text>

            <Text style={styles.cardSubtitle}>
              Continue your journey with us
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>✉</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#9BA79E"
                value={emailAddress}
                onChangeText={setEmailAddress}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PASSWORD</Text>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>●</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#9BA79E"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.button,
              loading && styles.buttonDisabled,
            ]}
            onPress={onSignInPress}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Text>

            <Text style={styles.buttonArrow}>→</Text>
          </Pressable>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />

            <Text style={styles.dividerText}>NEW TO TRAVELER?</Text>

            <View style={styles.divider} />
          </View>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>
              Start your adventure today
            </Text>

            <Link href="/(auth)/sign-up" asChild>
              <Pressable style={styles.signupButton}>
                <Text style={styles.signupLink}>
                  Create Account
                </Text>

                <Text style={styles.signupArrow}>→</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {/* Bottom Travel Decoration */}
        <View style={styles.bottomRoute}>
          <View style={styles.bottomLine} />

          <Text style={styles.bottomIcon}>⌖</Text>
          <Text style={styles.bottomIcon}>✈</Text>
          <Text style={styles.bottomIcon}>⌖</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F6F2',
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 35,
  },

  hero: {
    alignItems: 'center',
    marginBottom: 26,
  },

  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E5EFE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#D2E2D5',
  },

  logo: {
    fontSize: 32,
    color: '#1D6143',
  },

  brandName: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#B88A37',
    marginBottom: 9,
  },

  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#173D2A',
    letterSpacing: -0.7,
  },

  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#718077',
    textAlign: 'center',
  },

  routeContainer: {
    width: 150,
    height: 30,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  routeLine: {
    position: 'absolute',
    width: 120,
    height: 1,
    backgroundColor: '#C7D5CA',
  },

  routeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#B88A37',
    marginHorizontal: 43,
  },

  routePlane: {
    position: 'absolute',
    fontSize: 18,
    color: '#176B45',
    backgroundColor: '#F3F6F2',
    paddingHorizontal: 6,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5EBE6',
    shadowColor: '#173D2A',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.09,
    shadowRadius: 24,
    elevation: 6,
  },

  cardHeader: {
    marginBottom: 24,
  },

  cardTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: '#173D2A',
    letterSpacing: -0.3,
  },

  cardSubtitle: {
    marginTop: 5,
    fontSize: 14,
    color: '#849087',
  },

  inputGroup: {
    marginBottom: 18,
  },

  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#607066',
    marginBottom: 8,
    marginLeft: 2,
  },

  inputWrapper: {
    height: 56,
    borderWidth: 1,
    borderColor: '#DCE5DE',
    backgroundColor: '#F8FAF8',
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  inputIcon: {
    width: 26,
    fontSize: 15,
    color: '#1D6143',
    textAlign: 'center',
    marginRight: 5,
  },

  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: '#1F2937',
  },

  errorBox: {
    backgroundColor: '#FFF3F1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1D0CB',
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },

  errorText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '600',
  },

  button: {
    height: 58,
    borderRadius: 16,
    backgroundColor: '#176B45',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 4,
    shadowColor: '#176B45',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  buttonArrow: {
    position: 'absolute',
    right: 20,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 18,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E4EAE5',
  },

  dividerText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    color: '#9AA59D',
    marginHorizontal: 10,
  },

  signupRow: {
    alignItems: 'center',
  },

  signupText: {
    fontSize: 14,
    color: '#78867D',
    marginBottom: 10,
  },

  signupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#EEF5EF',
  },

  signupLink: {
    color: '#176B45',
    fontSize: 14,
    fontWeight: '800',
  },

  signupArrow: {
    color: '#176B45',
    fontSize: 18,
    marginLeft: 8,
    fontWeight: '700',
  },

  bottomRoute: {
    height: 55,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  bottomLine: {
    position: 'absolute',
    width: '65%',
    height: 1,
    backgroundColor: '#CBD7CD',
  },

  bottomIcon: {
    backgroundColor: '#F3F6F2',
    paddingHorizontal: 13,
    color: '#B88A37',
    fontSize: 15,
  },
})
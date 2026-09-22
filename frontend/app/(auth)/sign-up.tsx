import { useSignUp } from '@clerk/expo'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignUpScreen() {
  const { signUp } = useSignUp()
  const router = useRouter()

  const [step, setStep] = useState('email')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [emailAddress, setEmailAddress] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreed, setAgreed] = useState(false)

  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // STEP 1: Create email signup and send verification code
  const sendVerificationCode = async () => {
    if (!firstName.trim()) {
      setErrorMessage('Please enter your first name.')
      return
    }

    if (!lastName.trim()) {
      setErrorMessage('Please enter your last name.')
      return
    }

    if (!emailPattern.test(emailAddress.trim())) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')

      // Start Clerk signup with email
      const { error } = await signUp.create({
        emailAddress: emailAddress.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })

      if (error) {
        console.error('Signup error:', error)

        setErrorMessage(
          error.message || 'Unable to start signup.'
        )
        return
      }

      // Send actual verification code to email
      const { error: sendError } =
        await signUp.verifications.sendEmailCode()

      if (sendError) {
        console.error(
          'Send code error:',
          sendError
        )

        setErrorMessage(
          sendError.message ||
            'Unable to send verification code.'
        )
        return
      }

      setStep('verify')

      Alert.alert(
        'Verification Code Sent',
        'Please check your email and enter the code.'
      )
    } catch (err) {
      console.error(err)
      setErrorMessage('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  // STEP 2: Verify email code
 const verifyCode = async () => {
  try {
    setLoading(true)
    setErrorMessage('')

    const { error } =
      await signUp.verifications.verifyEmailCode({
        code: verificationCode.trim(),
      })

    if (error) {
      console.error('Verification error:', error)
      setErrorMessage('Invalid verification code.')
      return
    }

    console.log('Verification status:', signUp.status)

    if (signUp.status === 'complete') {
  await signUp.finalize({
    navigate: ({ decorateUrl }) => {
      const url = decorateUrl('/(root)')
      router.replace(url as any)
    },
  })

  return
}

    // Email verified, but Clerk still needs the password
    setStep('password')

  } catch (err) {
    console.error('Verification error:', err)
    setErrorMessage('Unable to verify the code.')
  } finally {
    setLoading(false)
  }
}

  // STEP 3: Set password and complete account
const createAccount = async () => {
  if (!password) {
    setErrorMessage('Please create a password.')
    return
  }

  if (password.length < 8) {
    setErrorMessage('Password must be at least 8 characters long.')
    return
  }

  if (password !== confirmPassword) {
    setErrorMessage('Passwords do not match.')
    return
  }

  if (!agreed) {
    setErrorMessage('Please agree to the Terms & Conditions.')
    return
  }

  try {
    setLoading(true)
    setErrorMessage('')

    const { error } = await signUp.password({
      password,
    })

    if (error) {
      console.error('Password error:', error)

      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : 'Unable to create password.'

      setErrorMessage(message)
      return
    }

    console.log('===== CLERK AFTER PASSWORD =====')
    console.log('Status:', signUp.status)
    console.log('Created User ID:', signUp.createdUserId)
    console.log('Created Session ID:', signUp.createdSessionId)
    console.log('Missing fields:', signUp.missingFields)
    console.log('Unverified fields:', signUp.unverifiedFields)

    // Since email and password are now complete,
    // Clerk should mark the signup as complete.
    if (signUp.status !== 'complete') {
      setErrorMessage(
        `Signup is not complete. Missing fields: ${
          signUp.missingFields?.join(', ') || 'unknown'
        }`
      )
      return
    }

    console.log('CLERK SIGNUP COMPLETE')
    console.log('USER ID:', signUp.createdUserId)

    // Do not call finalize() here when there is no created session.
    // The Clerk user has already been created once status is complete.
    router.replace('../(root)')

  } catch (err) {
    console.error('Create account error:', err)
    setErrorMessage('Unable to create account. Please try again.')
  } finally {
    setLoading(false)
  }
}

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* PREMIUM TRAVEL HERO */}
        <View style={styles.hero}>
          <View style={styles.heroDecorationOne} />
          <View style={styles.heroDecorationTwo} />

          <View style={styles.heroContent}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoIcon}>✈</Text>
            </View>

            <Text style={styles.heroEyebrow}>
              DISCOVER THE WORLD
            </Text>

            <Text style={styles.heroTitle}>
              Begin Your Adventure
            </Text>

            <Text style={styles.heroSubtitle}>
              Your next unforgettable journey starts here.
            </Text>

            {/* Travel route indicators */}
            <View style={styles.routeContainer}>
              <View style={styles.routeLine} />

              <View style={styles.routeItem}>
                <View style={styles.routeCircleActive}>
                  <Text style={styles.routeIcon}>●</Text>
                </View>
                <Text style={styles.routeLabel}>START</Text>
              </View>

              <View style={styles.routeItem}>
                <View style={styles.routeCircle}>
                  <Text style={styles.routeIcon}>✉</Text>
                </View>
                <Text style={styles.routeLabel}>VERIFY</Text>
              </View>

              <View style={styles.routeItem}>
                <View style={styles.routeCircle}>
                  <Text style={styles.routeIcon}>✦</Text>
                </View>
                <Text style={styles.routeLabel}>EXPLORE</Text>
              </View>
            </View>
          </View>
        </View>

        {/* FORM CARD */}
        <View style={styles.formCard}>
          {/* STEP 1 - EMAIL */}
          {step === 'email' && (
            <>
              <View style={styles.stepHeader}>
                <Text style={styles.stepBadge}>01</Text>

                <View style={styles.stepHeaderText}>
                  <Text style={styles.formTitle}>
                    Create your account
                  </Text>

                  <Text style={styles.formSubtitle}>
                    Tell us a little about yourself to begin.
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>First Name</Text>

              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>◉</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Enter your first name"
                  placeholderTextColor="#97A49D"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  editable={!loading}
                />
              </View>

              <Text style={styles.label}>Last Name</Text>

              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>◉</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Enter your last name"
                  placeholderTextColor="#97A49D"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  editable={!loading}
                />
              </View>

              <Text style={styles.label}>Email Address</Text>

              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>✉</Text>

                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#97A49D"
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorSymbol}>!</Text>

                  <Text style={styles.error}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.button,
                  loading && styles.disabledButton,
                ]}
                onPress={sendVerificationCode}
                disabled={loading}
              >
                <View>
                  <Text style={styles.buttonText}>
                    {loading
                      ? 'Sending Code...'
                      : 'Continue Your Journey'}
                  </Text>

                  <Text style={styles.buttonSubtext}>
                    Verify your email to continue
                  </Text>
                </View>

                <Text style={styles.buttonArrow}>→</Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>
                  ALREADY A TRAVELER?
                </Text>
                <View style={styles.divider} />
              </View>

              <Link
                href="/(auth)/sign-in"
                style={styles.link}
              >
                Sign in to your account
              </Link>
            </>
          )}

          {/* STEP 2 - VERIFY CODE */}
          {step === 'verify' && (
            <>
              <View style={styles.stepHeader}>
                <Text style={styles.stepBadge}>02</Text>

                <View style={styles.stepHeaderText}>
                  <Text style={styles.formTitle}>
                    Verify your email
                  </Text>

                  <Text style={styles.formSubtitle}>
                    One more checkpoint before your journey.
                  </Text>
                </View>
              </View>

              <View style={styles.verificationIconBox}>
                <Text style={styles.verificationIcon}>✉</Text>
              </View>

              <Text style={styles.verificationTitle}>
                Check your inbox
              </Text>

              <Text style={styles.verificationText}>
                We sent a verification code to:
              </Text>

              <View style={styles.emailPill}>
                <Text style={styles.emailText}>
                  {emailAddress}
                </Text>
              </View>

              <Text style={styles.label}>
                Verification Code
              </Text>

              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>⌘</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Enter verification code"
                  placeholderTextColor="#97A49D"
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                />
              </View>

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorSymbol}>!</Text>

                  <Text style={styles.error}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.button,
                  loading && styles.disabledButton,
                ]}
                onPress={verifyCode}
                disabled={loading}
              >
                <View>
                  <Text style={styles.buttonText}>
                    {loading
                      ? 'Verifying...'
                      : 'Verify & Continue'}
                  </Text>

                  <Text style={styles.buttonSubtext}>
                    Confirm your travel identity
                  </Text>
                </View>

                <Text style={styles.buttonArrow}>→</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setVerificationCode('')
                  setStep('email')
                }}
                style={styles.backButton}
              >
                <Text style={styles.backArrow}>←</Text>

                <Text style={styles.backText}>
                  Change email address
                </Text>
              </Pressable>
            </>
          )}

          {/* STEP 3 - PASSWORD */}
          {step === 'password' && (
            <>
              <View style={styles.stepHeader}>
                <Text style={styles.stepBadge}>03</Text>

                <View style={styles.stepHeaderText}>
                  <Text style={styles.formTitle}>
                    Secure your journey
                  </Text>

                  <Text style={styles.formSubtitle}>
                    Create a password to protect your account.
                  </Text>
                </View>
              </View>

              <View style={styles.successBox}>
                <View style={styles.successCircle}>
                  <Text style={styles.successCheck}>✓</Text>
                </View>

                <View>
                  <Text style={styles.successTitle}>
                    Email verified
                  </Text>

                  <Text style={styles.successText}>
                    Your identity checkpoint is complete.
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Create Password</Text>

              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>◈</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Minimum 15 characters"
                  placeholderTextColor="#97A49D"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!loading}
                />
              </View>

              <Text style={styles.label}>Confirm Password</Text>

              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>◈</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  placeholderTextColor="#97A49D"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  editable={!loading}
                />
              </View>

              <Pressable
                style={styles.agreement}
                onPress={() => setAgreed(!agreed)}
                disabled={loading}
              >
                <View
                  style={[
                    styles.checkbox,
                    agreed && styles.checked,
                  ]}
                >
                  {agreed && (
                    <Text style={styles.check}>✓</Text>
                  )}
                </View>

                <Text style={styles.agreementText}>
                  I agree to the Terms & Conditions
                </Text>
              </Pressable>

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorSymbol}>!</Text>

                  <Text style={styles.error}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.button,
                  loading && styles.disabledButton,
                ]}
                onPress={createAccount}
                disabled={loading}
              >
                <View>
                  <Text style={styles.buttonText}>
                    {loading
                      ? 'Creating Account...'
                      : 'Start Your Journey'}
                  </Text>

                  <Text style={styles.buttonSubtext}>
                    Your adventure is ready to begin
                  </Text>
                </View>

                <Text style={styles.buttonArrow}>✈</Text>
              </Pressable>
            </>
          )}
        </View>
                
        {/* BOTTOM TRAVEL ROUTE */}
        <View style={styles.bottomJourney}>
          <View style={styles.bottomRouteLine} />

          <View style={styles.bottomRouteItem}>
            <View style={styles.bottomRouteDot} />
            <Text style={styles.bottomRouteText}>PLAN</Text>
          </View>

          <Text style={styles.bottomPlane}>✈</Text>

          <View style={styles.bottomRouteItem}>
            <View style={styles.bottomRouteDot} />
            <Text style={styles.bottomRouteText}>TRAVEL</Text>
          </View>

          <View style={styles.bottomRouteItem}>
            <View style={styles.bottomRouteDotGold} />
            <Text style={styles.bottomRouteText}>EXPLORE</Text>
          </View>
        </View>

        {/* Required Clerk CAPTCHA container */}
        <View
          nativeID="clerk-captcha"
          style={styles.captcha}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F6F1',
  },

  container: {
    flexGrow: 1,
    paddingBottom: 36,
  },

  hero: {
    minHeight: 310,
    backgroundColor: '#075C38',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: 'hidden',
    paddingTop: 54,
    paddingHorizontal: 24,
    paddingBottom: 38,
  },

  heroDecorationOne: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0B7045',
    top: -105,
    right: -75,
    opacity: 0.7,
  },

  heroDecorationTwo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: '#56A879',
    bottom: -95,
    left: -45,
    opacity: 0.55,
  },

  heroContent: {
    alignItems: 'center',
  },

  logoBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E9C46A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 8,
    marginBottom: 14,
  },

  logoIcon: {
    fontSize: 28,
    color: '#075C38',
    transform: [{ rotate: '-18deg' }],
  },

  heroEyebrow: {
    color: '#C8E3D3',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 8,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },

  heroSubtitle: {
    color: '#D6EADF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 9,
    lineHeight: 21,
  },
 ddividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
    gap: 12,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E1E8E4',
  },

  orText: {
    color: '#8A9891',
    fontSize: 12,
    fontWeight: 'bold',
  },

 googleButton: {
  height: 48,
  borderWidth: 1,
  borderColor: '#D1D5DB',
  borderRadius: 8,
  backgroundColor: '#FFFFFF',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
},

googleIcon: {
  fontSize: 20,
  fontWeight: 'bold',
  color: '#4285F4',
  marginRight: 10,
},

googleText: {
  color: '#5F6368',
  fontSize: 14,
  fontWeight: '500',
},
  signupSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 25,
  },

  routeContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    position: 'relative',
    paddingHorizontal: 8,
  },

  routeLine: {
    position: 'absolute',
    top: 18,
    left: 40,
    right: 40,
    height: 1,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#7FC69B',
  },

  routeItem: {
    alignItems: 'center',
    width: 68,
    zIndex: 1,
  },

  routeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0D6A43',
    borderWidth: 1,
    borderColor: '#6FB88D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  routeCircleActive: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E9C46A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },

  routeIcon: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  routeLabel: {
    color: '#DCEFE4',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 7,
  },

  formCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: -22,
    borderRadius: 28,
    padding: 22,
    shadowColor: '#173629',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 10,
  },

  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },

  stepBadge: {
    color: '#B18423',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    backgroundColor: '#FBF4DF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 12,
    overflow: 'hidden',
  },

  stepHeaderText: {
    flex: 1,
  },

  formTitle: {
    color: '#173629',
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  formSubtitle: {
    color: '#78877F',
    fontSize: 13,
    marginTop: 5,
    lineHeight: 19,
  },

  label: {
    color: '#315143',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 10,
    letterSpacing: 0.2,
  },

  inputShell: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F8F6',
    borderWidth: 1,
    borderColor: '#E3EAE5',
    borderRadius: 16,
    paddingHorizontal: 15,
    marginBottom: 5,
  },

  inputIcon: {
    width: 27,
    color: '#0A7045',
    fontSize: 17,
    textAlign: 'center',
    marginRight: 8,
  },

  input: {
    flex: 1,
    color: '#1C3025',
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 14,
  },

  button: {
    minHeight: 66,
    backgroundColor: '#075C38',
    borderRadius: 18,
    paddingHorizontal: 20,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#075C38',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 7,
  },

  disabledButton: {
    opacity: 0.6,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  buttonSubtext: {
    color: '#B9DCC8',
    fontSize: 10,
    marginTop: 3,
  },

  buttonArrow: {
    color: '#E9C46A',
    fontSize: 27,
    fontWeight: '400',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF2F0',
    borderWidth: 1,
    borderColor: '#FFD8D2',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 10,
  },

  errorSymbol: {
    width: 21,
    height: 21,
    borderRadius: 11,
    overflow: 'hidden',
    textAlign: 'center',
    color: '#FFFFFF',
    backgroundColor: '#DC4C3E',
    fontWeight: '800',
    marginRight: 8,
  },

  error: {
    flex: 1,
    color: '#B52F25',
    fontSize: 12,
    lineHeight: 18,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 14,
  },

  divrider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E7ECE8',
  },

  dividerText: {
    color: '#9AA69F',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginHorizontal: 10,
  },

  link: {
    color: '#075C38',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 6,
  },

  verificationIconBox: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EDF7F0',
    borderWidth: 1,
    borderColor: '#D4EBDD',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },

  verificationIcon: {
    fontSize: 30,
    color: '#087A48',
  },

  verificationTitle: {
    color: '#173629',
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
  },

  verificationText: {
    textAlign: 'center',
    color: '#75847C',
    fontSize: 13,
    marginTop: 8,
  },

  emailPill: {
    alignSelf: 'center',
    backgroundColor: '#F3F8F4',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 9,
    marginBottom: 12,
  },

  emailText: {
    textAlign: 'center',
    color: '#087A48',
    fontSize: 13,
    fontWeight: '700',
  },

  backButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 19,
    paddingVertical: 8,
  },

  backArrow: {
    color: '#B18423',
    fontSize: 18,
    marginRight: 7,
  },

  backText: {
    color: '#087A48',
    fontSize: 13,
    fontWeight: '700',
  },

  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF8F1',
    borderWidth: 1,
    borderColor: '#D5EAD9',
    borderRadius: 17,
    padding: 14,
    marginBottom: 14,
  },

  successCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0A7045',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  successCheck: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  successTitle: {
    color: '#1C5A38',
    fontSize: 14,
    fontWeight: '800',
  },

  successText: {
    color: '#6E8778',
    fontSize: 11,
    marginTop: 2,
  },

  verifiedText: {
    color: '#15803D',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },

  agreement: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 17,
  },

  checkbox: {
    width: 23,
    height: 23,
    borderWidth: 1.5,
    borderColor: '#91A69A',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  checked: {
    backgroundColor: '#075C38',
    borderColor: '#075C38',
  },

  check: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },

  agreementText: {
    flex: 1,
    fontSize: 12,
    color: '#52655B',
    lineHeight: 18,
  },

  bottomJourney: {
    marginTop: 30,
    marginHorizontal: 25,
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },

  bottomRouteLine: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: 22,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B8C7BE',
  },

  bottomRouteItem: {
    alignItems: 'center',
    zIndex: 1,
  },

  bottomRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F2F6F1',
    borderWidth: 2,
    borderColor: '#8DA99A',
  },

  bottomRouteDotGold: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E9C46A',
    borderWidth: 2,
    borderColor: '#D1A846',
  },

  bottomRouteText: {
    color: '#87968D',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 9,
  },

  bottomPlane: {
    position: 'absolute',
    top: 10,
    left: '48%',
    zIndex: 2,
    color: '#087A48',
    fontSize: 18,
    backgroundColor: '#F2F6F1',
    paddingHorizontal: 5,
    transform: [{ rotate: '-18deg' }],
  },

  captcha: {
    width: '100%',
    height: 1,
  },
})
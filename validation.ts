import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { checkPasswordRules, getPasswordStrength } from '../utils/validation'

const STRENGTH_COLORS: Record<string, string> = {
  empty: '#D9E8DF',
  weak: '#E23D3D',
  medium: '#D6A419',
  strong: '#087A3E',
}

const STRENGTH_LABELS: Record<string, string> = {
  empty: '',
  weak: 'Weak',
  medium: 'Medium',
  strong: 'Strong',
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { strength, score } = getPasswordStrength(password)
  const rules = checkPasswordRules(password)
  const widthAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: (score / 4) * 100,
      duration: 250,
      useNativeDriver: false,
    }).start()
  }, [score])

  if (!password) return null

  return (
    <View style={styles.container}>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: widthAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: STRENGTH_COLORS[strength],
            },
          ]}
        />
      </View>

      <Text style={[styles.label, { color: STRENGTH_COLORS[strength] }]}>
        {STRENGTH_LABELS[strength]}
      </Text>

      <View style={styles.rules}>
        <RuleRow met={rules.minLength} text="8+ characters" />
        <RuleRow met={rules.hasUpper} text="Uppercase letter" />
        <RuleRow met={rules.hasLower} text="Lowercase letter" />
        <RuleRow met={rules.hasNumber} text="Number" />
        <RuleRow met={rules.hasSpecial} text="Special character" />
      </View>
    </View>
  )
}

function RuleRow({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleIcon, { color: met ? '#087A3E' : '#B8C4BD' }]}>
        {met ? '✓' : '○'}
      </Text>
      <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginTop: 6, marginBottom: 4 },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EEF3F0',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  rules: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 8,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  ruleIcon: { fontSize: 12, marginRight: 4 },
  ruleText: { fontSize: 11, color: '#8A968F' },
  ruleTextMet: { color: '#30483C' },
})

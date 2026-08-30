import { useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { WebView, WebViewMessageEvent } from 'react-native-webview'

/**
 * CaptchaChallenge
 *
 * Renders a real hCaptcha "I'm not a robot" widget inside a WebView.
 * hCaptcha (like reCAPTCHA) requires a browser context to run its
 * bot-detection JS, so on native mobile the standard approach is to
 * host a tiny static HTML page that loads the widget and postMessage()s
 * the resulting token back to React Native.
 *
 * SECURITY NOTE: the token produced here proves nothing by itself.
 * It MUST be sent to the backend and verified against hCaptcha's
 * /siteverify API (see backend/utils/hcaptcha.js) before the signup
 * is accepted. Never trust "captchaPassed" client-side state alone.
 *
 * Swap HCAPTCHA_SITE_KEY for your real site key, and swap the HTML
 * below for reCAPTCHA's markup if you prefer that provider instead —
 * the postMessage contract is the same.
 */

const HCAPTCHA_SITE_KEY = 'YOUR_HCAPTCHA_SITE_KEY' // public, safe to ship in-app

const CAPTCHA_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
    <style>
      html, body {
        margin: 0; padding: 0; background: transparent;
        display: flex; align-items: center; justify-content: center;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    <div
      class="h-captcha"
      data-sitekey="${HCAPTCHA_SITE_KEY}"
      data-callback="onCaptchaSuccess"
      data-expired-callback="onCaptchaExpired"
      data-error-callback="onCaptchaError"
      data-theme="light"
    ></div>
    <script>
      function onCaptchaSuccess(token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', token }));
      }
      function onCaptchaExpired() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'expired' }));
      }
      function onCaptchaError() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
      }
    </script>
  </body>
</html>
`

interface CaptchaChallengeProps {
  onVerified: (token: string) => void
  onExpiredOrError: () => void
}

export default function CaptchaChallenge({ onVerified, onExpiredOrError }: CaptchaChallengeProps) {
  const [loading, setLoading] = useState(true)
  const webviewRef = useRef<WebView>(null)

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'success' && data.token) {
        onVerified(data.token)
      } else {
        onExpiredOrError()
      }
    } catch {
      onExpiredOrError()
    }
  }

  return (
    <View
      style={styles.wrapper}
      accessible
      accessibilityLabel="Human verification challenge"
      accessibilityHint="Complete the checkbox challenge to prove you are not a robot"
    >
      <Text style={styles.label} accessibilityRole="header">
        Verify you're not a robot
      </Text>

      <View style={styles.webviewBox}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#087A3E" />
          </View>
        )}
        <WebView
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ html: CAPTCHA_HTML }}
          onMessage={handleMessage}
          onLoadEnd={() => setLoading(false)}
          style={styles.webview}
          scrollEnabled={false}
          javaScriptEnabled
          // Accessibility passthrough for screen readers navigating the
          // embedded checkbox (hCaptcha's own widget is WCAG 2.1 AA).
          accessibilityElementsHidden={false}
          importantForAccessibility="yes"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 10, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#30483C', marginBottom: 8 },
  webviewBox: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E8DF',
    overflow: 'hidden',
    backgroundColor: '#F8FBF9',
  },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FBF9',
    zIndex: 1,
  },
})

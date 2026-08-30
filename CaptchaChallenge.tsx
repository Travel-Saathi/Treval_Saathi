// Reuses the same BASE_URL convention as the rest of the app's client.js
// (swap localhost for your machine's LAN IP when testing on a physical
// device through Expo Go).
const BASE_URL = 'http://localhost:4000'

export interface SignUpPayload {
  fullName: string
  email: string
  password: string
  captchaToken: string
}

export interface SignUpResponse {
  ok: boolean
  message: string
  // Only present on success. Store via SecureStore, not AsyncStorage.
  accessToken?: string
}

/**
 * Calls the backend signup endpoint. All real validation, hashing,
 * rate limiting and CAPTCHA verification happens server-side — this
 * function is a thin, honest wrapper and does not pretend to secure
 * anything on its own.
 */
export async function signUpRequest(payload: SignUpPayload): Promise<SignUpResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  let data: SignUpResponse
  try {
    data = await response.json()
  } catch {
    return { ok: false, message: 'Unexpected server response. Please try again.' }
  }

  if (!response.ok) {
    // Deliberately generic — the backend never says "email already
    // registered" specifically, to avoid account enumeration. We just
    // surface whatever safe message it sent.
    return { ok: false, message: data.message || 'Something went wrong. Please try again.' }
  }

  return data
}

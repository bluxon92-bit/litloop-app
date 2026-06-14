import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { sb } from './supabase'

export function isNative() {
  return Capacitor.isNativePlatform()
}

// Store cold-start notification tap before React is ready
let pendingLaunchNotification = null
let onRouteCallback = null

export function initFcmEarly() {
  if (!isNative()) return
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const data = notification.data || {}
    if (onRouteCallback) {
      onRouteCallback(data)
    } else {
      pendingLaunchNotification = data
    }
  })
}

export async function registerFcmToken(userId) {
  if (!isNative()) return { ok: false, reason: 'not_native' }
  try {
    console.log('[FCM] Requesting permissions...')
    const permResult = await PushNotifications.requestPermissions()
    console.log('[FCM] Permission result:', JSON.stringify(permResult))
    if (permResult.receive !== 'granted') return { ok: false, reason: 'permission_denied' }
    console.log('[FCM] Calling register()...')
    await PushNotifications.register()
    console.log('[FCM] register() called successfully')
    return { ok: true }
  } catch (err) {
    console.log('[FCM] Error:', err.message)
    return { ok: false, reason: err.message }
  }
}

async function saveFcmToken(userId, token) {
  const platform = Capacitor.getPlatform()
  const { error } = await sb.from('fcm_tokens').upsert(
    { user_id: userId, token, platform, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,platform' }
  )
  if (error) {
    console.warn('[FCM] Error saving token to Supabase:', error.message)
  } else {
    console.log('[FCM] Token saved to Supabase for user:', userId)
  }
}

export async function unregisterFcmToken(userId) {
  if (!isNative()) return
  const platform = Capacitor.getPlatform()
  await sb.from('fcm_tokens').delete().eq('user_id', userId).eq('platform', platform)
}

let listenersAdded = false

export function setupFcmListeners(userId, onRoute, isReady) {
  if (!isNative() || listenersAdded) return
  listenersAdded = true
  onRouteCallback = onRoute

  PushNotifications.addListener('registration', async ({ value: token }) => {
    const platform = Capacitor.getPlatform()
    console.log('[FCM] registration event — platform:', platform, 'token prefix:', token?.substring(0, 30))

    if (platform === 'ios') {
      // On iOS, this event fires with the APNs device token, NOT the FCM token.
      // The real FCM token is captured by AppDelegate's MessagingDelegate and
      // saved to Supabase directly via native HTTP. Nothing to do here on iOS.
      console.log('[FCM] iOS: ignoring registration event (AppDelegate handles FCM token)')
      return
    }

    // Android: Capacitor registration event gives the real FCM token directly.
    console.log('[FCM] Android: saving FCM token from registration event')
    await saveFcmToken(userId, token)
  })

  PushNotifications.addListener('registrationError', (err) => {
    console.warn('[FCM] Registration error:', JSON.stringify(err))
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[FCM] Foreground notification:', notification.title)
  })

  // Background tap (app was open in background)
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const data = notification.data || {}
    if (onRoute) onRoute(data)
  })

  // Cold-start tap — wait until app is ready before routing
  if (pendingLaunchNotification) {
    const data = pendingLaunchNotification
    pendingLaunchNotification = null

    if (isReady && !isReady()) {
      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        if (isReady() || attempts > 20) {
          clearInterval(poll)
          if (onRoute) onRoute(data)
        }
      }, 250)
    } else {
      setTimeout(() => { if (onRoute) onRoute(data) }, 300)
    }
  }
}

export function removeFcmListeners() {
  if (!isNative()) return
  PushNotifications.removeAllListeners()
  listenersAdded = false
  onRouteCallback = null
  pendingLaunchNotification = null
}
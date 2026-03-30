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
      // Listeners already set up — route immediately
      onRouteCallback(data)
    } else {
      // Store for later consumption
      pendingLaunchNotification = data
    }
  })
}

export async function registerFcmToken(userId) {
  if (!isNative()) return { ok: false, reason: 'not_native' }
  try {
    const permResult = await PushNotifications.requestPermissions()
    if (permResult.receive !== 'granted') return { ok: false, reason: 'permission_denied' }
    await PushNotifications.register()
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

async function saveFcmToken(userId, token) {
  const platform = Capacitor.getPlatform()
  await sb.from('fcm_tokens').upsert(
    { user_id: userId, token, platform, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,platform' }
  )
}

export async function unregisterFcmToken(userId) {
  if (!isNative()) return
  const platform = Capacitor.getPlatform()
  await sb.from('fcm_tokens').delete().eq('user_id', userId).eq('platform', platform)
}

let listenersAdded = false

// isReady: optional function that returns true when app data is loaded
// Used to delay cold-start routing until chats/data are available
export function setupFcmListeners(userId, onRoute, isReady) {
  if (!isNative() || listenersAdded) return
  listenersAdded = true
  onRouteCallback = onRoute

  PushNotifications.addListener('registration', async ({ value: token }) => {
    await saveFcmToken(userId, token)
  })

  PushNotifications.addListener('registrationError', (err) => {
    console.warn('FCM registration error:', err)
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('FCM foreground notification:', notification.title)
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
      // Poll until ready, max 5 seconds
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
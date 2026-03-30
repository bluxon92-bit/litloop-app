// ─────────────────────────────────────────────────────────────
// src/lib/fcmManager.js
//
// Handles FCM push notification lifecycle for the native app:
//   - Requesting permission
//   - Registering FCM token with Supabase
//   - Routing notification taps to the correct screen
//
// Handles both foreground taps and cold-start taps (app opened
// from a closed state via notification).
// ─────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { sb } from './supabase'

export function isNative() {
  return Capacitor.isNativePlatform()
}

// ── Pending launch notification ───────────────────────────────
// When the app is opened from closed state by tapping a notification,
// the tap event fires before React is ready. We store it here and
// consume it once setupFcmListeners is called.

let pendingLaunchNotification = null

// Call this as early as possible — before React mounts — to catch
// cold-start notification taps.
export function initFcmEarly() {
  if (!isNative()) return

  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const data = notification.data || {}
    if (pendingLaunchNotification === null) {
      pendingLaunchNotification = data
    }
  })
}

// ── Token registration ────────────────────────────────────────

export async function registerFcmToken(userId) {
  if (!isNative()) return { ok: false, reason: 'not_native' }

  try {
    const permResult = await PushNotifications.requestPermissions()
    if (permResult.receive !== 'granted') {
      return { ok: false, reason: 'permission_denied' }
    }
    await PushNotifications.register()
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

async function saveFcmToken(userId, token) {
  const platform = Capacitor.getPlatform()
  await sb.from('fcm_tokens').upsert(
    {
      user_id:    userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,platform' }
  )
}

export async function unregisterFcmToken(userId) {
  if (!isNative()) return
  const platform = Capacitor.getPlatform()
  await sb.from('fcm_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('platform', platform)
}

// ── Listener setup ────────────────────────────────────────────

let listenersAdded = false

export function setupFcmListeners(userId, onRoute) {
  if (!isNative() || listenersAdded) return
  listenersAdded = true

  PushNotifications.addListener('registration', async ({ value: token }) => {
    await saveFcmToken(userId, token)
  })

  PushNotifications.addListener('registrationError', (err) => {
    console.warn('FCM registration error:', err)
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('FCM foreground notification:', notification.title)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const data = notification.data || {}
    if (onRoute) onRoute(data)
  })

  // Consume any cold-start notification that arrived before we were ready
  if (pendingLaunchNotification) {
    const data = pendingLaunchNotification
    pendingLaunchNotification = null
    setTimeout(() => { if (onRoute) onRoute(data) }, 500)
  }
}

export function removeFcmListeners() {
  if (!isNative()) return
  PushNotifications.removeAllListeners()
  listenersAdded = false
  pendingLaunchNotification = null
}
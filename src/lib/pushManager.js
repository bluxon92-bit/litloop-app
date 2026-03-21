// ─────────────────────────────────────────────────────────────
// src/lib/pushManager.js
//
// Handles Web Push subscription lifecycle on the client:
//   - Checking/requesting permission
//   - Subscribing via the browser PushManager
//   - Saving the subscription to Supabase
//   - Detecting PWA install state (needed for iOS guidance)
// ─────────────────────────────────────────────────────────────

import { sb } from './supabase'

// VAPID public key — must match the private key in your Edge Function secrets
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BJUjWcnQZmGlXV3vqj9e-aFyVoG9h0_lM2rAY33elksBDXfF5z6FaWVKGfq7qGcQ-FGSKboYaOdIdN7VOSvymlE'

// ── Helpers ───────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

/** True if the app is running as an installed PWA (not in a browser tab). */
export function isPwa() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  )
}

/** Current notification permission state: 'granted' | 'denied' | 'default' */
export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** True if this browser supports Web Push at all. */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// ── Core API ──────────────────────────────────────────────────

/**
 * Request notification permission, subscribe to push, and save to DB.
 * Returns { ok: true } on success or { ok: false, reason: string } on failure.
 */
export async function subscribeToPush(userId) {
  if (!isPushSupported()) {
    return { ok: false, reason: 'not_supported' }
  }

  // 1. Request permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission_denied' }
  }

  try {
    // 2. Get the active service worker registration
    const reg = await navigator.serviceWorker.ready

    // 3. Subscribe
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    // 4. Save to Supabase
    const { endpoint, keys } = subscription.toJSON()
    const { error } = await sb.from('push_subscriptions').upsert(
      {
        user_id:   userId,
        endpoint,
        p256dh:    keys.p256dh,
        auth:      keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'user_id,endpoint' }
    )

    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Unsubscribe the current browser from push and remove from DB.
 */
export async function unsubscribeFromPush(userId) {
  if (!isPushSupported()) return { ok: false, reason: 'not_supported' }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()

    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      // Remove from DB
      await sb.from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint)
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Check whether this browser is currently subscribed.
 * Returns true/false — does NOT check DB, just browser state.
 */
export async function isSubscribed() {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

/**
 * Save notification preference changes to the profiles table.
 */
export async function saveNotificationPrefs(userId, prefs) {
  const { error } = await sb
    .from('profiles')
    .update({ notification_prefs: prefs })
    .eq('id', userId)
  return { error }
}

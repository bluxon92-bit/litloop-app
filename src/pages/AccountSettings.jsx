import { useState, useEffect } from 'react'
import { useSocialContext } from '../context/SocialContext'
import { useAuthContext } from '../context/AuthContext'
import { clearCoverCache } from '../lib/coverCache'
import { sb } from '../lib/supabase'
import {
  isPushSupported, isPwa, getPermissionState,
  subscribeToPush, unsubscribeFromPush, isSubscribed,
  saveNotificationPrefs,
} from '../lib/pushManager'
import { isNative, registerFcmToken } from '../lib/fcmManager'

// ── Native Push Settings Card (Capacitor) ─────────────────────
function NativePushSettings({ user, notificationPrefs, setNotificationPrefs }) {
  const [status, setStatus]     = useState(null)
  const [saving, setSaving]     = useState(false)

  async function handleEnable() {
    setStatus(null)
    const { ok, reason } = await registerFcmToken(user.id)
    if (ok) setStatus({ type: 'ok', text: '✓ Push notifications enabled!' })
    else if (reason === 'permission_denied') setStatus({ type: 'err', text: 'Permission denied — enable notifications in your device Settings.' })
    else setStatus({ type: 'err', text: `Something went wrong: ${reason}` })
  }

  async function handlePrefChange(key, value) {
    const updated = { ...notificationPrefs, [key]: value }
    setNotificationPrefs(updated)
    setSaving(true)
    await saveNotificationPrefs(user.id, updated)
    setSaving(false)
  }

  const PREF_ITEMS = [
    { key: 'review_comments', label: 'Review comments & likes',  desc: 'When someone comments on or likes your review' },
    { key: 'friend_requests', label: 'Friend requests',          desc: 'When someone adds you or accepts your request' },
    { key: 'recommendations', label: 'Book recommendations',     desc: 'When a friend recommends a book to you' },
    { key: 'messages',        label: 'Chat messages',            desc: 'Direct messages and book club activity' },
  ]

  const labelStyle = { fontSize: '0.83rem', fontWeight: 600, color: 'var(--rt-navy)' }
  const descStyle  = { fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }

  return (
    <div className="rt-card" style={{ marginBottom: '1rem' }}>
      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.75rem' }}>
        Push notifications
      </div>
      <button
        onClick={handleEnable}
        style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.6rem 1.25rem', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer', marginBottom: '0.75rem' }}
      >
        Enable push notifications
      </button>
      {status && (
        <div style={{ fontSize: '0.78rem', color: status.type === 'ok' ? '#166534' : '#991b1b', background: status.type === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${status.type === 'ok' ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: '0.45rem 0.7rem', marginBottom: '0.85rem' }}>
          {status.text}
        </div>
      )}
      <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>
        Notify me about
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
        {PREF_ITEMS.map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '0.5px solid var(--rt-border)' }}>
            <div>
              <div style={labelStyle}>{item.label}</div>
              <div style={descStyle}>{item.desc}</div>
            </div>
            <button
              onClick={() => handlePrefChange(item.key, !notificationPrefs[item.key])}
              disabled={saving}
              style={{ flexShrink: 0, width: 40, height: 24, borderRadius: 12, background: notificationPrefs[item.key] !== false ? 'var(--rt-teal)' : 'var(--rt-border-md)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: saving ? 0.6 : 1, marginLeft: '1rem' }}>
              <span style={{ position: 'absolute', top: 2, left: notificationPrefs[item.key] !== false ? 18 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Notification Settings Card (PWA/web) ──────────────────────
function NotificationSettings({ user, notificationPrefs, setNotificationPrefs }) {
  const [pushSupported, setPushSupported]   = useState(false)
  const [pwaInstalled, setPwaInstalled]     = useState(false)
  const [subscribed, setSubscribed]         = useState(false)
  const [permState, setPermState]           = useState('default')
  const [toggling, setToggling]             = useState(false)
  const [savingPrefs, setSavingPrefs]       = useState(false)
  const [statusMsg, setStatusMsg]           = useState(null)
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    setPushSupported(isPushSupported())
    setPwaInstalled(isPwa())
    setPermState(getPermissionState())
    isSubscribed().then(setSubscribed)
  }, [])

  async function handleTogglePush() {
    setToggling(true); setStatusMsg(null)
    if (subscribed) {
      const { ok, reason } = await unsubscribeFromPush(user.id)
      if (ok) { setSubscribed(false); setStatusMsg({ type: 'ok', text: 'Push notifications disabled.' }) }
      else { setStatusMsg({ type: 'err', text: `Couldn't disable: ${reason}` }) }
    } else {
      const { ok, reason } = await subscribeToPush(user.id)
      if (ok) { setSubscribed(true); setPermState('granted'); setStatusMsg({ type: 'ok', text: '✓ Push notifications enabled!' }) }
      else if (reason === 'permission_denied') { setStatusMsg({ type: 'err', text: 'Permission denied — please enable notifications in your browser/phone settings.' }) }
      else if (reason === 'not_supported') { setStatusMsg({ type: 'err', text: 'Push notifications are not supported in this browser.' }) }
      else { setStatusMsg({ type: 'err', text: `Something went wrong: ${reason}` }) }
    }
    setToggling(false)
  }

  async function handlePrefChange(key, value) {
    const updated = { ...notificationPrefs, [key]: value }
    setNotificationPrefs(updated)
    setSavingPrefs(true)
    await saveNotificationPrefs(user.id, updated)
    setSavingPrefs(false)
  }

  const PREF_ITEMS = [
    { key: 'review_comments', label: 'Review comments & likes',  desc: 'When someone comments on or likes your review' },
    { key: 'friend_requests', label: 'Friend requests',          desc: 'When someone adds you or accepts your request' },
    { key: 'recommendations', label: 'Book recommendations',     desc: 'When a friend recommends a book to you' },
    { key: 'messages',        label: 'Chat messages',            desc: 'Direct messages and book club activity' },
  ]

  const labelStyle = { fontSize: '0.83rem', fontWeight: 600, color: 'var(--rt-navy)' }
  const descStyle  = { fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }

  return (
    <div className="rt-card" style={{ marginBottom: '1rem' }}>
      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>
        Push notifications
      </div>
      {!pwaInstalled && (
        <div style={{ background: 'var(--rt-amber-pale)', border: '1px solid var(--rt-border)', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--rt-amber-text)', marginBottom: '0.3rem' }}>
            {isIos ? '📱 Install LitLoop to enable notifications' : '📲 Add LitLoop to your home screen'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--rt-t2)', lineHeight: 1.55 }}>
            {isIos
              ? 'Push notifications on iOS require the app to be installed. Tap the Share button in Safari, then "Add to Home Screen", then open the app from there.'
              : 'For the best experience, add LitLoop to your home screen. In Chrome, tap the menu (⋮) and select "Add to Home screen" or "Install app".'}
          </div>
        </div>
      )}
      {pushSupported && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--rt-surface)', borderRadius: 'var(--rt-r3)' }}>
          <div>
            <div style={labelStyle}>Enable push notifications</div>
            <div style={descStyle}>
              {permState === 'denied' ? 'Blocked in browser settings — tap below for instructions'
               : subscribed ? 'Notifications are active on this device'
               : 'Get notified even when the app is closed'}
            </div>
          </div>
          <button
            onClick={handleTogglePush}
            disabled={toggling || permState === 'denied' || (!pwaInstalled && isIos)}
            style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 13, background: subscribed ? 'var(--rt-teal)' : 'var(--rt-border-md)', border: 'none', cursor: (toggling || permState === 'denied' || (!pwaInstalled && isIos)) ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: toggling ? 0.6 : 1 }}
            aria-label={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
          >
            <span style={{ position: 'absolute', top: 3, left: subscribed ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
          </button>
        </div>
      )}
      {permState === 'denied' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#991b1b', lineHeight: 1.55 }}>
          <strong>Notifications are blocked.</strong> To re-enable:
          {isIos ? ' Go to Settings → LitLoop → Notifications and turn on Allow Notifications.' : ' Click the lock icon in your browser address bar → Site settings → Notifications → Allow.'}
        </div>
      )}
      {statusMsg && (
        <div style={{ fontSize: '0.78rem', color: statusMsg.type === 'ok' ? '#166534' : '#991b1b', background: statusMsg.type === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statusMsg.type === 'ok' ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: '0.45rem 0.7rem', marginBottom: '0.85rem' }}>
          {statusMsg.text}
        </div>
      )}
      {subscribed && (
        <>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Notify me about</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            {PREF_ITEMS.map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '0.5px solid var(--rt-border)' }}>
                <div>
                  <div style={labelStyle}>{item.label}</div>
                  <div style={descStyle}>{item.desc}</div>
                </div>
                <button
                  onClick={() => handlePrefChange(item.key, !notificationPrefs[item.key])}
                  disabled={savingPrefs}
                  style={{ flexShrink: 0, width: 40, height: 24, borderRadius: 12, background: notificationPrefs[item.key] !== false ? 'var(--rt-teal)' : 'var(--rt-border-md)', border: 'none', cursor: savingPrefs ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: savingPrefs ? 0.6 : 1, marginLeft: '1rem' }}>
                  <span style={{ position: 'absolute', top: 2, left: notificationPrefs[item.key] !== false ? 18 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.75rem', lineHeight: 1.5 }}>
            Changes save automatically. Notifications are sent to all devices where you've enabled them.
          </div>
        </>
      )}
      {!pushSupported && (
        <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)', lineHeight: 1.5 }}>
          Push notifications aren't supported in this browser. Try opening LitLoop in Chrome or Safari and adding it to your home screen.
        </div>
      )}
    </div>
  )
}

// ── Delete Account Card ───────────────────────────────────────
const CONFIRM_PHRASE = 'delete my account'

function DeleteAccountCard({ user, signOut }) {
  const [open, setOpen]           = useState(false)
  const [confirmText, setConfirm] = useState('')
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState(null)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 640)

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const confirmed = confirmText.trim().toLowerCase() === CONFIRM_PHRASE

  async function handleDelete() {
    if (!confirmed || deleting) return
    setDeleting(true); setError(null)
    try {
      const { error: fnError } = await sb.functions.invoke('delete-account')
      if (fnError) { setError('Something went wrong. Please try again or contact help@litloop.co.'); setDeleting(false); return }
      await signOut()
    } catch (err) {
      setError('Network error — please check your connection and try again.')
      setDeleting(false)
    }
  }

  return (
    <>
      <div style={{ padding: '0.75rem 0 1.5rem', textAlign: 'center' }}>
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Delete account
        </button>
      </div>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) setOpen(false) }}>
          <div style={{ background: '#ffffff', borderRadius: isDesktop ? '1.25rem' : '1.25rem 1.25rem 0 0', padding: isDesktop ? '2rem' : '1.75rem 1.5rem 2.5rem', width: isDesktop ? '90%' : '100%', maxWidth: 480, boxShadow: isDesktop ? '0 8px 40px rgba(0,0,0,0.18)' : '0 -4px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>Delete account</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)' }}>This cannot be undone.</div>
              </div>
              {!deleting && <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--rt-t3)', lineHeight: 1, padding: '0 0 0 1rem' }}>×</button>}
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--rt-r3)', padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b', marginBottom: '0.4rem' }}>The following will be permanently deleted:</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.76rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                <li>Your profile, username, and bio</li>
                <li>Your entire reading list and progress</li>
                <li>All your reviews and ratings</li>
                <li>All friendships and friend requests</li>
                <li>Book recommendations sent and received</li>
                <li>Your notification settings and devices</li>
              </ul>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--rt-t2)', marginBottom: '0.4rem' }}>
                Type <strong>delete my account</strong> to confirm:
              </label>
              <input className="rt-input" style={{ width: '100%' }} placeholder="delete my account" value={confirmText} onChange={e => setConfirm(e.target.value)} disabled={deleting} autoCapitalize="none" autoCorrect="off" />
            </div>
            {error && <div style={{ fontSize: '0.78rem', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.85rem' }}>{error}</div>}
            <button
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--rt-r3)', border: 'none', fontWeight: 700, fontSize: '0.9rem', cursor: confirmed && !deleting ? 'pointer' : 'not-allowed', background: confirmed && !deleting ? '#dc2626' : 'var(--rt-border-md)', color: confirmed && !deleting ? '#fff' : 'var(--rt-t3)', transition: 'background 0.2s' }}>
              {deleting ? 'Deleting your account…' : 'Permanently delete my account'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Shared sub-page wrapper ───────────────────────────────────
function SubPage({ title, onBack, children }) {
  return (
    <div style={{ padding: '1.5rem', maxWidth: 600, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-navy)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.25rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
      >
        ← {title ? 'Settings' : 'Back'}
      </button>
      {title && (
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 1.25rem' }}>{title}</h2>
      )}
      {children}
    </div>
  )
}

// ── Settings index row ────────────────────────────────────────
function SettingsRow({ icon, label, sublabel, onPress, danger }) {
  return (
    <button
      onClick={onPress}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        width: '100%', padding: '0.85rem 0',
        background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: '0.5px solid var(--rt-border)',
        textAlign: 'left',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <span style={{ fontSize: '1.1rem', width: 28, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 500, color: danger ? '#dc2626' : 'var(--rt-navy)' }}>{label}</div>
        {sublabel && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }}>{sublabel}</div>}
      </div>
      <span style={{ fontSize: '0.85rem', color: 'var(--rt-t3)' }}>›</span>
    </button>
  )
}

function SettingsGroup({ heading, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {heading && (
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.25rem', paddingLeft: '0.1rem' }}>
          {heading}
        </div>
      )}
      <div className="rt-card" style={{ padding: '0 1rem' }}>
        {children}
      </div>
    </div>
  )
}

// ── Sub-page: Edit profile ────────────────────────────────────
function ProfileSubPage({ onBack }) {
  const { user }                             = useAuthContext()
  const { myUsername, myFirstName, myLastName, myBio, saveProfile } = useSocialContext()

  const [firstName, setFirstName]       = useState(myFirstName || '')
  const [lastName, setLastName]         = useState(myLastName  || '')
  const [bio, setBio]                   = useState(myBio       || '')
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState(null)
  const [saving, setSaving]             = useState(false)
  const [editingHandle, setEditingHandle] = useState(false)
  const [newHandle, setNewHandle]         = useState(myUsername || '')
  const [handleSaving, setHandleSaving]   = useState(false)
  const [handleError, setHandleError]     = useState(null)
  const [handleChanged, setHandleChanged] = useState(false)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    const { error } = await saveProfile(firstName, lastName, myUsername, bio)
    if (error) setError(error.message)
    else setSaved(true)
    setSaving(false)
  }

  async function handleSaveHandle() {
    setHandleError(null)
    const clean = newHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!clean || clean.length < 3) { setHandleError('Handle must be at least 3 characters'); return }
    if (clean === myUsername) { setEditingHandle(false); return }
    setHandleSaving(true)
    const { data: existing } = await sb.from('profiles').select('id').eq('username', clean).single()
    if (existing) { setHandleError('That handle is already taken'); setHandleSaving(false); return }
    const { error } = await sb.from('profiles').update({ username: clean, handle_changed: true }).eq('id', user.id)
    if (error) { setHandleError(error.message); setHandleSaving(false); return }
    setHandleChanged(true)
    setEditingHandle(false)
    setHandleSaving(false)
    window.location.reload()
  }

  return (
    <SubPage title="Edit profile" onBack={onBack}>
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div>
            <label className="rt-field-label">First name</label>
            <input className="rt-input" style={{ width: '100%' }} placeholder="James" value={firstName}
              onChange={e => setFirstName(e.target.value.slice(0, 30))} maxLength={30} />
          </div>
          <div>
            <label className="rt-field-label">Last name</label>
            <input className="rt-input" style={{ width: '100%' }} placeholder="Johnson" value={lastName}
              onChange={e => setLastName(e.target.value.slice(0, 30))} maxLength={30} />
          </div>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', marginBottom: '1rem' }}>
          Shown as <strong>{firstName && lastName ? `${firstName}${lastName.charAt(0)}` : firstName || '—'}</strong> on friends' feeds.
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label className="rt-field-label">Public handle</label>
          {editingHandle ? (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--rt-t3)', fontSize: '0.9rem', pointerEvents: 'none' }}>@</span>
                  <input className="rt-input" style={{ width: '100%', paddingLeft: '1.85rem' }} value={newHandle}
                    onChange={e => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    maxLength={20} autoFocus autoComplete="off" autoCapitalize="none" />
                </div>
                <button onClick={handleSaveHandle} disabled={handleSaving}
                  style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.6rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: handleSaving ? 'default' : 'pointer', flexShrink: 0 }}>
                  {handleSaving ? '…' : 'Save'}
                </button>
                <button onClick={() => { setEditingHandle(false); setNewHandle(myUsername || ''); setHandleError(null) }}
                  style={{ background: 'none', border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.6rem 0.75rem', fontSize: '0.82rem', color: 'var(--rt-t3)', cursor: 'pointer', flexShrink: 0 }}>
                  Cancel
                </button>
              </div>
              {handleError && <p style={{ fontSize: '0.78rem', color: '#991b1b', margin: '0.2rem 0 0' }}>{handleError}</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input className="rt-input" style={{ flex: 1, background: 'var(--rt-surface)', cursor: 'not-allowed' }} value={`@${myUsername || ''}`} disabled />
              {!handleChanged && (
                <button onClick={() => setEditingHandle(true)}
                  style={{ background: 'none', border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 0.85rem', fontSize: '0.78rem', color: 'var(--rt-amber)', fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  Change
                </button>
              )}
            </div>
          )}
          <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', marginTop: '0.3rem' }}>
            {handleChanged ? 'Handle locked — can only be changed once.' : 'Appears on public reviews. Can be changed once.'}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label className="rt-field-label">Bio</label>
          <textarea className="rt-textarea" rows={4} placeholder="Tell people a little about your reading tastes…"
            value={bio} onChange={e => setBio(e.target.value.slice(0, 200))} style={{ width: '100%', resize: 'none' }} />
          <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', textAlign: 'right', marginTop: '0.2rem' }}>{bio.length}/200</div>
        </div>

        {error && <p style={{ fontSize: '0.82rem', color: '#991b1b', marginBottom: '0.5rem' }}>{error}</p>}
        {saved && <p style={{ fontSize: '0.82rem', color: '#166534', marginBottom: '0.5rem' }}>✓ Profile updated!</p>}

        <button className="rt-submit-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </SubPage>
  )
}

// ── Sub-page: Social & privacy ────────────────────────────────
function SocialSubPage({ onBack }) {
  const { user } = useAuthContext()
  const [defaultVisibility, setDefaultVisibility] = useState('public')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [followerCount, setFollowerCount]   = useState(null)
  const [followingCount, setFollowingCount] = useState(null)

  useEffect(() => {
    if (!user) return
    // Load default visibility preference from profile
    sb.from('profiles').select('default_post_visibility').eq('id', user.id).single()
      .then(({ data }) => { if (data?.default_post_visibility) setDefaultVisibility(data.default_post_visibility) })
    // Load follower/following counts
    sb.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', user.id)
      .then(({ count }) => setFollowerCount(count || 0))
    sb.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id)
      .then(({ count }) => setFollowingCount(count || 0))
  }, [user])

  async function saveVisibility(val) {
    setDefaultVisibility(val)
    setSaving(true); setSaved(false)
    await sb.from('profiles').update({ default_post_visibility: val }).eq('id', user.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const visOptions = [
    { value: 'public',  label: 'Public',  desc: 'Visible to everyone on Litloop' },
    { value: 'friends', label: 'Friends', desc: 'Only visible to your mutual friends' },
  ]

  return (
    <SubPage title="Social & privacy" onBack={onBack}>
      {/* Follower / following counts */}
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>Connections</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {[['Followers', followerCount], ['Following', followingCount]].map(([label, count]) => (
            <div key={label} style={{ background: 'var(--rt-surface)', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem' }}>
              <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--rt-navy)' }}>
                {count === null ? '—' : count}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Default post visibility */}
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>Default post visibility</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
          Applied to new reviews, quotes, and moments. You can always change visibility on individual posts.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {visOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => saveVisibility(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 0.85rem', borderRadius: 'var(--rt-r3)',
                border: `1.5px solid ${defaultVisibility === opt.value ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
                background: defaultVisibility === opt.value ? 'rgba(26,39,68,0.03)' : 'var(--rt-white)',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${defaultVisibility === opt.value ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, background: defaultVisibility === opt.value ? 'var(--rt-navy)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                {defaultVisibility === opt.value && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', display: 'block' }} />}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{opt.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
        {saving && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.5rem' }}>Saving…</div>}
        {saved  && <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: '0.5rem' }}>✓ Saved</div>}
      </div>
    </SubPage>
  )
}

// ── Sub-page: Notifications ───────────────────────────────────
function NotificationsSubPage({ onBack, user, notificationPrefs, setNotificationPrefs }) {
  return (
    <SubPage title="Notifications" onBack={onBack}>
      {isNative()
        ? <NativePushSettings user={user} notificationPrefs={notificationPrefs} setNotificationPrefs={setNotificationPrefs} />
        : <NotificationSettings user={user} notificationPrefs={notificationPrefs} setNotificationPrefs={setNotificationPrefs} />
      }
    </SubPage>
  )
}

// ── Sub-page: App ─────────────────────────────────────────────
function AppSubPage({ onBack }) {
  const [cacheCleared, setCacheCleared] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)

  async function handleClearCache() {
    setClearingCache(true)
    await clearCoverCache()
    setCacheCleared(true)
    setClearingCache(false)
    setTimeout(() => setCacheCleared(false), 3000)
  }

  return (
    <SubPage title="App" onBack={onBack}>
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>Image cache</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
          Book covers are cached on your device for fast, offline access. Clear the cache if covers look outdated.
        </div>
        {cacheCleared && <p style={{ fontSize: '0.82rem', color: '#166534', marginBottom: '0.5rem' }}>✓ Image cache cleared.</p>}
        <button
          onClick={handleClearCache}
          disabled={clearingCache}
          style={{ background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 1.25rem', fontSize: '0.83rem', color: 'var(--rt-t2)', cursor: clearingCache ? 'not-allowed' : 'pointer' }}>
          {clearingCache ? 'Clearing…' : 'Clear image cache'}
        </button>
      </div>
    </SubPage>
  )
}

// ── Sub-page: Account ─────────────────────────────────────────
function AccountSubPage({ onBack, user, signOut }) {
  return (
    <SubPage title="Account" onBack={onBack}>
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Signed in as</div>
        <div style={{ fontSize: '0.88rem', color: 'var(--rt-navy)', marginBottom: '1rem', fontWeight: 500 }}>{user?.email}</div>
        <button
          onClick={signOut}
          style={{ background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 1.25rem', fontSize: '0.83rem', color: 'var(--rt-t2)', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
      <DeleteAccountCard user={user} signOut={signOut} />
    </SubPage>
  )
}

// ── Main AccountSettings (index page) ─────────────────────────
export default function AccountSettings({ onNavigate }) {
  const { user, signOut }    = useAuthContext()
  const { myUsername, myDisplayName, myBio, notificationPrefs, setNotificationPrefs } = useSocialContext()
  const [subPage, setSubPage] = useState(null) // null = index

  const displayName = myDisplayName || myUsername || user?.email?.split('@')[0] || 'Reader'

  // Sub-page routing
  if (subPage === 'profile')       return <ProfileSubPage       onBack={() => setSubPage(null)} />
  if (subPage === 'social')        return <SocialSubPage         onBack={() => setSubPage(null)} />
  if (subPage === 'notifications') return <NotificationsSubPage  onBack={() => setSubPage(null)} user={user} notificationPrefs={notificationPrefs} setNotificationPrefs={setNotificationPrefs} />
  if (subPage === 'app')           return <AppSubPage            onBack={() => setSubPage(null)} />
  if (subPage === 'account')       return <AccountSubPage        onBack={() => setSubPage(null)} user={user} signOut={signOut} />

  // ── Index page ──────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem', maxWidth: 600, margin: '0 auto' }}>
      <button
        onClick={() => onNavigate('feed')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-navy)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.25rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
      >
        ← Feed
      </button>

      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 1.5rem' }}>Settings</h2>

      <SettingsGroup heading="Your profile">
        <SettingsRow icon="👤" label="Edit profile" sublabel={myBio ? myBio.slice(0, 40) + (myBio.length > 40 ? '…' : '') : `@${myUsername || ''}`} onPress={() => setSubPage('profile')} />
      </SettingsGroup>

      <SettingsGroup heading="Social & privacy">
        <SettingsRow icon="👥" label="Social & privacy" sublabel="Default visibility, followers" onPress={() => setSubPage('social')} />
      </SettingsGroup>

      <SettingsGroup heading="App">
        <SettingsRow icon="🔔" label="Notifications"    sublabel="Push notifications and preferences" onPress={() => setSubPage('notifications')} />
        <SettingsRow icon="📦" label="App"              sublabel="Image cache and other settings"     onPress={() => setSubPage('app')} />
      </SettingsGroup>

      <SettingsGroup heading="Account">
        <SettingsRow icon="🔑" label="Account"          sublabel={user?.email}                        onPress={() => setSubPage('account')} />
      </SettingsGroup>

      {/* Legal — inline, no sub-page */}
      <div className="rt-card" style={{ marginBottom: '1rem', padding: '0 1rem' }}>
        {[
          { label: 'Privacy & Cookie Policy', href: 'https://www.litloop.co/cookie-policy/' },
          { label: 'Terms & Conditions',      href: 'https://www.litloop.co/terms/' },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 0', borderBottom: '0.5px solid var(--rt-border)', fontSize: '0.85rem', color: 'var(--rt-navy)', textDecoration: 'none' }}
          >
            {label}
            <span style={{ fontSize: '0.75rem', color: 'var(--rt-t3)' }}>↗</span>
          </a>
        ))}
        <div style={{ padding: '0.75rem 0', fontSize: '0.72rem', color: 'var(--rt-t3)' }}>
          Questions? <a href="mailto:help@litloop.co" style={{ color: 'var(--rt-navy)', textDecoration: 'underline', textUnderlineOffset: 2 }}>help@litloop.co</a>
        </div>
      </div>
    </div>
  )
}

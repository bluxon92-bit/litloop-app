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

// ── Notification Settings Card ────────────────────────────────
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
    setToggling(true)
    setStatusMsg(null)
    if (subscribed) {
      const { ok, reason } = await unsubscribeFromPush(user.id)
      if (ok) {
        setSubscribed(false)
        setStatusMsg({ type: 'ok', text: 'Push notifications disabled.' })
      } else {
        setStatusMsg({ type: 'err', text: `Couldn't disable: ${reason}` })
      }
    } else {
      const { ok, reason } = await subscribeToPush(user.id)
      if (ok) {
        setSubscribed(true)
        setPermState('granted')
        setStatusMsg({ type: 'ok', text: '✓ Push notifications enabled!' })
      } else if (reason === 'permission_denied') {
        setStatusMsg({ type: 'err', text: 'Permission denied — please enable notifications in your browser/phone settings.' })
      } else if (reason === 'not_supported') {
        setStatusMsg({ type: 'err', text: 'Push notifications are not supported in this browser.' })
      } else {
        setStatusMsg({ type: 'err', text: `Something went wrong: ${reason}` })
      }
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
      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>
        Push notifications
      </div>

      {/* Not installed as PWA */}
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

      {/* Main enable/disable toggle */}
      {pushSupported && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--rt-surface)', borderRadius: 'var(--rt-r3)' }}>
          <div>
            <div style={labelStyle}>Enable push notifications</div>
            <div style={descStyle}>
              {permState === 'denied'
                ? 'Blocked in browser settings — tap below for instructions'
                : subscribed ? 'Notifications are active on this device' : 'Get notified even when the app is closed'}
            </div>
          </div>
          <button
            onClick={handleTogglePush}
            disabled={toggling || permState === 'denied' || (!pwaInstalled && isIos)}
            style={{
              flexShrink: 0,
              width: 44, height: 26,
              borderRadius: 13,
              background: subscribed ? 'var(--rt-teal)' : 'var(--rt-border-md)',
              border: 'none',
              cursor: (toggling || permState === 'denied' || (!pwaInstalled && isIos)) ? 'not-allowed' : 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              opacity: toggling ? 0.6 : 1,
            }}
            aria-label={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
          >
            <span style={{
              position: 'absolute',
              top: 3, left: subscribed ? 21 : 3,
              width: 20, height: 20,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
      )}

      {/* Permission denied instructions */}
      {permState === 'denied' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#991b1b', lineHeight: 1.55 }}>
          <strong>Notifications are blocked.</strong> To re-enable:
          {isIos
            ? ' Go to Settings → LitLoop → Notifications and turn on Allow Notifications.'
            : ' Click the lock icon in your browser address bar → Site settings → Notifications → Allow.'}
        </div>
      )}

      {statusMsg && (
        <div style={{ fontSize: '0.78rem', color: statusMsg.type === 'ok' ? '#166534' : '#991b1b', background: statusMsg.type === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statusMsg.type === 'ok' ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: '0.45rem 0.7rem', marginBottom: '0.85rem' }}>
          {statusMsg.text}
        </div>
      )}

      {/* Per-type preference toggles — only show when subscribed */}
      {subscribed && (
        <>
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
                  disabled={savingPrefs}
                  style={{
                    flexShrink: 0,
                    width: 40, height: 24,
                    borderRadius: 12,
                    background: notificationPrefs[item.key] !== false ? 'var(--rt-teal)' : 'var(--rt-border-md)',
                    border: 'none',
                    cursor: savingPrefs ? 'not-allowed' : 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    opacity: savingPrefs ? 0.6 : 1,
                    marginLeft: '1rem',
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    left: notificationPrefs[item.key] !== false ? 18 : 2,
                    width: 20, height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s',
                  }} />
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

export default function AccountSettings({ onNavigate }) {
  const { user, signOut } = useAuthContext()
  const { myUsername, myFirstName, myLastName, myBio, saveProfile, notificationPrefs, setNotificationPrefs } = useSocialContext()

  const [firstName, setFirstName] = useState(myFirstName || '')
  const [lastName, setLastName]   = useState(myLastName || '')
  const [bio, setBio]             = useState(myBio || '')
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState(null)
  const [saving, setSaving]           = useState(false)

  const [editingHandle, setEditingHandle]   = useState(false)
  const [newHandle, setNewHandle]           = useState(myUsername || '')
  const [handleSaving, setHandleSaving]     = useState(false)
  const [handleError, setHandleError]       = useState(null)
  const [handleChanged, setHandleChanged]   = useState(false)

  const [cacheCleared, setCacheCleared]     = useState(false)
  const [clearingCache, setClearingCache]   = useState(false)

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
    const { error } = await sb.from('profiles')
      .update({ username: clean, handle_changed: true })
      .eq('id', user.id)
    if (error) { setHandleError(error.message); setHandleSaving(false); return }
    setHandleChanged(true)
    setEditingHandle(false)
    setHandleSaving(false)
    window.location.reload()
  }

  async function handleClearCache() {
    setClearingCache(true)
    await clearCoverCache()
    setCacheCleared(true)
    setClearingCache(false)
    setTimeout(() => setCacheCleared(false), 3000)
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 600, margin: '0 auto' }}>
      <button
        onClick={() => onNavigate('profile')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-navy)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.25rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
      >
        ← Profile
      </button>

      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 1.5rem' }}>Account settings</h2>

      {/* Profile card */}
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
          Shown as <strong>{firstName && lastName ? `${firstName}${lastName.charAt(0)}` : firstName || '—'}</strong> on friends' feeds. Full name is searchable.
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label className="rt-field-label">Public handle</label>
          {editingHandle ? (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--rt-t3)', fontSize: '0.9rem', pointerEvents: 'none' }}>@</span>
                  <input
                    className="rt-input"
                    style={{ width: '100%', paddingLeft: '1.85rem' }}
                    value={newHandle}
                    onChange={e => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    maxLength={20}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                </div>
                <button
                  onClick={handleSaveHandle}
                  disabled={handleSaving}
                  style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.6rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: handleSaving ? 'default' : 'pointer', flexShrink: 0 }}>
                  {handleSaving ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditingHandle(false); setNewHandle(myUsername || ''); setHandleError(null) }}
                  style={{ background: 'none', border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.6rem 0.75rem', fontSize: '0.82rem', color: 'var(--rt-t3)', cursor: 'pointer', flexShrink: 0 }}>
                  Cancel
                </button>
              </div>
              {handleError && <p style={{ fontSize: '0.78rem', color: '#991b1b', margin: '0.2rem 0 0' }}>{handleError}</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                className="rt-input"
                style={{ flex: 1, background: 'var(--rt-surface)', cursor: 'not-allowed' }}
                value={`@${myUsername || ''}`}
                disabled
              />
              {!handleChanged && (
                <button
                  onClick={() => setEditingHandle(true)}
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
          <textarea
            className="rt-textarea"
            rows={4}
            placeholder="Tell people a little about your reading tastes…"
            value={bio}
            onChange={e => setBio(e.target.value.slice(0, 200))}
            style={{ width: '100%', resize: 'none' }}
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', textAlign: 'right', marginTop: '0.2rem' }}>{bio.length}/200</div>
        </div>

        {error && <p style={{ fontSize: '0.82rem', color: '#991b1b', marginBottom: '0.5rem' }}>{error}</p>}
        {saved && <p style={{ fontSize: '0.82rem', color: '#166534', marginBottom: '0.5rem' }}>✓ Profile updated!</p>}

        <button className="rt-submit-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Notifications */}
      <NotificationSettings
        user={user}
        notificationPrefs={notificationPrefs}
        setNotificationPrefs={setNotificationPrefs}
      />

      {/* Image cache */}
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>Image cache</div>
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

      {/* Account */}
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>Account</div>
        <div style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', marginBottom: '0.85rem' }}>{user?.email}</div>
        <button
          onClick={signOut}
          style={{ background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 1.25rem', fontSize: '0.83rem', color: 'var(--rt-t2)', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}

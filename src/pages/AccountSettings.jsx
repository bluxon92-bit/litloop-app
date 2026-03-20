import { useState } from 'react'
import { useSocialContext } from '../context/SocialContext'
import { useAuthContext } from '../context/AuthContext'
import { clearCoverCache } from '../lib/coverCache'
import { sb } from '../lib/supabase'

export default function AccountSettings({ onNavigate }) {
  const { user, signOut } = useAuthContext()
  const { myUsername, myFirstName, myLastName, myBio, saveProfile } = useSocialContext()

  const [firstName, setFirstName] = useState(myFirstName || '')
  const [lastName, setLastName]   = useState(myLastName || '')
  const [bio, setBio]             = useState(myBio || '')
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState(null)
  const [saving, setSaving]           = useState(false)

  // Handle (username) — one-time change
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
    // Check uniqueness
    const { data: existing } = await sb.from('profiles').select('id').eq('username', clean).single()
    if (existing) { setHandleError('That handle is already taken'); setHandleSaving(false); return }
    // Save + mark handle_changed so they can't change again
    const { error } = await sb.from('profiles')
      .update({ username: clean, handle_changed: true })
      .eq('id', user.id)
    if (error) { setHandleError(error.message); setHandleSaving(false); return }
    setHandleChanged(true)
    setEditingHandle(false)
    setHandleSaving(false)
    // Reload page to refresh context
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

        {/* First + last name */}
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

        {/* Public handle */}
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

        {/* Bio */}
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
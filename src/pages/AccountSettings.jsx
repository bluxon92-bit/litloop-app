import { useState } from 'react'
import { useSocialContext } from '../context/SocialContext'
import { useAuthContext } from '../context/AuthContext'

export default function AccountSettings({ onNavigate }) {
  const { user, signOut } = useAuthContext()
  const { myUsername, myDisplayName, myBio, saveProfile } = useSocialContext()

  const [name, setName]   = useState(myDisplayName || '')
  const [bio, setBio]     = useState(myBio || '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    const { error } = await saveProfile(name, bio)
    if (error) setError(error.message)
    else setSaved(true)
    setSaving(false)
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 600, margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={() => onNavigate('profile')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-navy)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.25rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
      >
        ← Profile
      </button>

      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 1.5rem' }}>Account settings</h2>

      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label className="rt-field-label">Username</label>
          <input
            className="rt-input"
            style={{ width: '100%', background: 'var(--rt-surface)', cursor: 'not-allowed' }}
            value={myUsername || ''}
            disabled
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', marginTop: '0.3rem' }}>Username cannot be changed.</div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label className="rt-field-label">Display name</label>
          <input
            className="rt-input"
            style={{ width: '100%' }}
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value.slice(0, 50))}
            maxLength={50}
          />
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
        {saved && <p style={{ fontSize: '0.82rem', color: '#166534', marginBottom: '0.5rem' }}>Profile updated!</p>}

        <button className="rt-submit-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>Account</div>
        <div style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', marginBottom: '0.85rem' }}>{user?.email}</div>
        <button
          onClick={signOut}
          style={{ background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 1.25rem', fontSize: '0.83rem', color: 'var(--rt-t2)', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

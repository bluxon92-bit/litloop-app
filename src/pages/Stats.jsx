import { useState } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { GENRE_COLOURS, loadGoal, saveGoal } from '../lib/utils'
import { IcoBook, IcoPen } from '../components/icons'

export default function Stats() {
  const { books } = useBooksContext()
  const [goal, setGoal]   = useState(loadGoal)
  const [scope, setScope] = useState('year') // 'year' | 'alltime'

  const year     = new Date().getFullYear()
  const read     = books.filter(b => b.status === 'read')
  const thisYear = read.filter(b => b.dateRead && b.dateRead.startsWith(String(year)))

  // Scope-reactive dataset
  const scopeBooks = scope === 'year' ? thisYear : read

  // KPI values — all scope-reactive
  const rated     = scopeBooks.filter(b => b.rating)
  const avgRating = rated.length
    ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)
    : '—'
  const fiveStars = scopeBooks.filter(b => b.rating === 5).length
  const goalPct   = Math.min(100, Math.round((thisYear.length / Math.max(goal, 1)) * 100))

  // Genre pie
  const genreMap = {}
  scopeBooks.forEach(b => { if (b.genre) genreMap[b.genre] = (genreMap[b.genre] || 0) + 1 })
  const genres     = Object.entries(genreMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const genreTotal = genres.reduce((s, [, n]) => s + n, 0)

  // Authors bar
  const authMap = {}
  scopeBooks.forEach(b => { if (b.author) authMap[b.author] = (authMap[b.author] || 0) + 1 })
  const authors = Object.entries(authMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const authMax = authors[0]?.[1] || 1

  function buildPieSlices() {
    const R = 46, CX = 60, CY = 60
    let angle = -Math.PI / 2
    return genres.map(([, count], i) => {
      const slice = (count / genreTotal) * 2 * Math.PI
      const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle)
      angle += slice
      const x2 = CX + R * Math.cos(angle), y2 = CY + R * Math.sin(angle)
      const large = slice > Math.PI ? 1 : 0
      const colour = GENRE_COLOURS[i % GENRE_COLOURS.length]
      if (genres.length === 1) return <circle key={i} cx={CX} cy={CY} r={R} fill={colour} />
      return <path key={i} d={`M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`} fill={colour} />
    })
  }

  function handleGoalChange(e) {
    const v = parseInt(e.target.value) || 12
    setGoal(v); saveGoal(v)
  }

  const scopeLabel = scope === 'year' ? `in ${year}` : 'all time'

  return (
    <div className="rt-page" style={{ maxWidth: 720, margin: '0 auto' }}>

      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 1rem' }}>Stats</h2>

      {/* Reading goal card */}
      <div className="rt-card" style={{ background: 'linear-gradient(135deg, #111C35 0%, var(--rt-navy) 100%)', marginBottom: '0.6rem', padding: '1.5rem' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: '0.5rem' }}>
          Reading goal {year}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '2.25rem', fontWeight: 700, color: 'var(--rt-amber-lt)', lineHeight: 1 }}>{thisYear.length}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem' }}>/</span>
          <input
            type="number" value={goal} min="1" max="365"
            onChange={handleGoalChange}
            style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', outline: 'none', width: 48, padding: 0 }}
          />
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>books</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: goalPct + '%', background: 'var(--rt-amber-lt)', borderRadius: 99, transition: 'width 0.5s' }} />
          </div>
          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', minWidth: '2.5rem', textAlign: 'right' }}>{goalPct}%</span>
        </div>
      </div>

      {/* Toggle — beneath goal card, right-aligned */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', background: 'rgba(26,39,68,0.08)', borderRadius: 99, padding: '0.2rem', gap: '0.15rem' }}>
          {[['year', `${year}`], ['alltime', 'All time']].map(([val, label]) => (
            <button key={val} onClick={() => setScope(val)} style={{
              background: scope === val ? '#fff' : 'transparent',
              border: 'none', borderRadius: 99,
              padding: '0.3rem 0.85rem',
              fontSize: '0.72rem', fontWeight: 700,
              color: scope === val ? 'var(--rt-navy)' : 'var(--rt-t3)',
              cursor: 'pointer',
              boxShadow: scope === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* KPI cards — all scope-reactive */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', marginBottom: '0.85rem' }}>
        {[
          { label: 'Books read', value: scopeBooks.length, sub: scopeLabel },
          { label: 'Avg rating', value: avgRating,         sub: '★ per book' },
          { label: '5★ picks',   value: fiveStars,         sub: 'favourites' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: 'var(--rt-white)', border: '0.5px solid var(--rt-border)', borderRadius: 12, padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--rt-navy)', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', marginTop: '0.25rem' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Genre pie */}
      <div className="rt-card" style={{ marginBottom: '0.85rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Genres</div>
        {genres.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}><IcoBook size={36} color="var(--rt-t3)" /></div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>No genre data yet</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>Log books with genres to see your breakdown.</div>
          </div>
        ) : (
          <div className="rt-stats-pie-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }} aria-hidden="true">
              {buildPieSlices()}
              <circle cx="60" cy="60" r="22" fill="white" />
              <text x="60" y="58" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#1a2744">{genreTotal}</text>
              <text x="60" y="68" textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="#9ca3af">books</text>
            </svg>
            <div className="rt-stats-pie-legend">
              {genres.map(([genre, count], i) => (
                <div key={genre} className="rt-stats-pie-legend-item">
                  <div className="rt-stats-pie-legend-dot" style={{ background: GENRE_COLOURS[i % GENRE_COLOURS.length] }} />
                  <span className="rt-stats-pie-legend-name" title={genre}>{genre}</span>
                  <span className="rt-stats-pie-legend-pct">{Math.round((count / genreTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Authors bar chart */}
      <div className="rt-card">
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Top authors</div>
        {authors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}><IcoPen size={36} color="var(--rt-t3)" /></div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>No author data yet</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>Finish some books to see your favourite authors.</div>
          </div>
        ) : (
          <div className="rt-stats-bar-list">
            {authors.map(([author, count], i) => (
              <div key={author} className="rt-stats-bar-row">
                <div className="rt-stats-bar-label" title={author}>{author}</div>
                <div className="rt-stats-bar-track">
                  <div className="rt-stats-bar-fill" style={{ width: Math.round((count / authMax) * 100) + '%', background: GENRE_COLOURS[i % GENRE_COLOURS.length] }} />
                </div>
                <div className="rt-stats-bar-count">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
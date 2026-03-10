import { useState } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { GENRE_COLOURS, loadGoal, saveGoal } from '../lib/utils'

export default function Stats() {
  const { books } = useBooksContext()
  const [goal, setGoal] = useState(loadGoal)

  const year      = new Date().getFullYear()
  const read      = books.filter(b => b.status === 'read')
  const thisYear  = read.filter(b => b.dateRead && b.dateRead.startsWith(String(year)))
  const rated     = read.filter(b => b.rating)
  const avgRating = rated.length
    ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)
    : '—'
  const goalPct   = Math.min(100, Math.round((thisYear.length / Math.max(goal, 1)) * 100))

  // Genre pie
  const genreMap = {}
  read.forEach(b => { if (b.genre) genreMap[b.genre] = (genreMap[b.genre] || 0) + 1 })
  const genres     = Object.entries(genreMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const genreTotal = genres.reduce((s, [, n]) => s + n, 0)

  // Authors bar
  const authMap = {}
  read.forEach(b => { if (b.author) authMap[b.author] = (authMap[b.author] || 0) + 1 })
  const authors = Object.entries(authMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const authMax = authors[0]?.[1] || 1

  function buildPieSlices() {
    const SIZE = 120, R = 46, CX = 60, CY = 60
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

  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 1.5rem' }}>Stats</h2>

      {/* Reading goal card */}
      <div className="rt-card" style={{
        background: 'linear-gradient(135deg, var(--rt-navy) 0%, var(--rt-navy-mid) 100%)',
        marginBottom: '1rem', padding: '1.5rem'
      }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: '0.5rem' }}>
          Reading goal {year}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '2.5rem', fontWeight: 700, color: 'var(--rt-amber-lt)', lineHeight: 1 }}>{thisYear.length}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem' }}>/</span>
          <input
            type="number" value={goal} min="1" max="365"
            onChange={handleGoalChange}
            style={{
              fontFamily: 'var(--rt-font-display)', fontSize: '1.5rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none',
              outline: 'none', width: 48, padding: 0
            }}
          />
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>books</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: goalPct + '%', background: 'var(--rt-amber-lt)', borderRadius: 99, transition: 'width 0.5s' }}></div>
          </div>
          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', minWidth: '2.5rem', textAlign: 'right' }}>{goalPct}%</span>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: `Books in ${year}`, value: thisYear.length },
          { label: 'All time',         value: read.length     },
          { label: 'Avg rating',       value: avgRating       },
          { label: '5★ favourites',    value: read.filter(b => b.rating === 5).length },
        ].map(({ label, value }) => (
          <div key={label} className="rt-stat-card">
            <div className="rt-stat-label">{label}</div>
            <div className="rt-stat-number">{value}</div>
          </div>
        ))}
      </div>

      {/* Genre pie chart */}
      <div className="rt-card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Genres (all time)</div>
        {genres.length === 0 ? (
          <div className="rt-stats-empty">
            <div className="rt-stats-empty-icon">📚</div>
            <p>Log books with genres to see your breakdown.</p>
          </div>
        ) : (
          <div className="rt-stats-pie-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }} aria-hidden="true">
              {buildPieSlices()}
              <circle cx="60" cy="60" r="22" fill="white" />
              <text x="60" y="61" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#1a2744">{genreTotal}</text>
              <text x="60" y="70" textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="#7a84a0">books</text>
            </svg>
            <div className="rt-stats-pie-legend">
              {genres.map(([genre, count], i) => (
                <div key={genre} className="rt-stats-pie-legend-item">
                  <div className="rt-stats-pie-legend-dot" style={{ background: GENRE_COLOURS[i % GENRE_COLOURS.length] }}></div>
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
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Top authors</div>
        {authors.length === 0 ? (
          <div className="rt-stats-empty">
            <div className="rt-stats-empty-icon">✍️</div>
            <p>Finish some books to see your favourite authors.</p>
          </div>
        ) : (
          <div className="rt-stats-bar-list">
            {authors.map(([author, count], i) => (
              <div key={author} className="rt-stats-bar-row">
                <div className="rt-stats-bar-label" title={author}>{author}</div>
                <div className="rt-stats-bar-track">
                  <div className="rt-stats-bar-fill" style={{ width: Math.round((count / authMax) * 100) + '%', background: GENRE_COLOURS[i] }}></div>
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

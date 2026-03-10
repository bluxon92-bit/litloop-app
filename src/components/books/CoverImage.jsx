export default function CoverImage({ coverId, olKey, title, size = 'M', style = {} }) {
  const sizes = { S: [38, 54], M: [56, 82], L: [80, 116] }
  const [w, h] = sizes[size] || sizes.M

  const gradients = [
    'linear-gradient(135deg, #1a2744 0%, #2A6E69 100%)',
    'linear-gradient(135deg, #c8891a 0%, #b43a3a 100%)',
    'linear-gradient(135deg, #2A6E69 0%, #5c6bc0 100%)',
    'linear-gradient(135deg, #7b3fa0 0%, #1a2744 100%)',
    'linear-gradient(135deg, #2e7d52 0%, #5c6bc0 100%)',
    'linear-gradient(135deg, #b43a3a 0%, #7a5c2e 100%)',
  ]

  const gradientIndex = (title || '').charCodeAt(0) % gradients.length
  const initial = (title || '?').charAt(0).toUpperCase()

  const baseStyle = {
    width: w,
    height: h,
    borderRadius: 6,
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(26,39,68,0.15)',
    ...style
  }

  const placeholder = (
    <div style={{
      ...baseStyle,
      background: gradients[gradientIndex],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.8)',
      fontSize: w * 0.4,
      fontFamily: 'var(--rt-font-display)',
      fontWeight: 700,
    }}>
      {initial}
    </div>
  )

  if (!coverId) return placeholder

  return (
    <img
      src={`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`}
      alt={title}
      style={{ ...baseStyle, objectFit: 'cover' }}
      onError={e => {
        e.target.replaceWith(e.target.nextSibling)
      }}
    />
  )
}
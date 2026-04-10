// PersonAvatar.jsx — SVG military-style avatar

const RANK_COLORS = {
  'พล.อ.':   { bg: '#7c5c00', light: '#ffd700', star: 5 },
  'พล.ท.':   { bg: '#8b6914', light: '#ffd700', star: 4 },
  'พล.ต.':   { bg: '#3d3d3d', light: '#c0c0c0', star: 3 },
  'พล.อ.ต.': { bg: '#3d3d3d', light: '#c0c0c0', star: 3 },
  'พล.ร.ต.': { bg: '#2c3e6b', light: '#c0c0c0', star: 3 },
  'พล.อ.ท.': { bg: '#3d3d3d', light: '#c0c0c0', star: 2 },
  'พล.ร.ท.': { bg: '#2c3e6b', light: '#c0c0c0', star: 2 },
  'พล.อ.อ.': { bg: '#3d3d3d', light: '#c0c0c0', star: 1 },
  'พล.ร.อ.': { bg: '#2c3e6b', light: '#c0c0c0', star: 1 },
  'พ.อ.':    { bg: '#1a237e', light: '#90caf9', star: 3 },
  'พ.อ.(พ)': { bg: '#1a237e', light: '#90caf9', star: 3 },
  'พ.ท.':    { bg: '#283593', light: '#90caf9', star: 2 },
  'พ.ต.':    { bg: '#1565c0', light: '#bbdefb', star: 1 },
  'ร.อ.':    { bg: '#00695c', light: '#b2dfdb', star: 3 },
  'ร.ท.':    { bg: '#2e7d32', light: '#c8e6c9', star: 2 },
  'ร.ต.':    { bg: '#388e3c', light: '#dcedc8', star: 1 },
  'จ.ส.อ.':  { bg: '#4e342e', light: '#d7ccc8', star: 3 },
  'จ.ส.ท.':  { bg: '#5d4037', light: '#d7ccc8', star: 2 },
  'จ.ส.ต.':  { bg: '#6d4c41', light: '#d7ccc8', star: 1 },
}

const DEFAULT_COLOR = { bg: '#37474f', light: '#b0bec5', star: 0 }

function getInitials(name) {
  if (!name) return '?'
  // Remove rank prefix (e.g. "พล.ท. ") and get first 2 chars
  const cleaned = name.replace(/^(พล\.[อทต]\.|พล\.[รน]\.[อทต]\.|พ\.[อทต]\.|พ\.[อ]\.\([พ]\)|ร\.[อทต]\.|จ\.ส\.[อทต]\.|จ\.ส\.[อ]\.|น\.ต\.|น\.ท\.|น\.อ\.)\s*/, '').trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2)
  return words[0].slice(0, 1) + words[1].slice(0, 1)
}

function hashColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 45%, 35%)`
}

function Stars({ count, color, size = 6 }) {
  if (!count) return null
  const stars = []
  const total = count
  const spacing = size + 3
  const totalWidth = total * spacing - 3
  const startX = (30 - totalWidth) / 2

  for (let i = 0; i < total; i++) {
    const x = startX + i * spacing
    stars.push(
      <polygon
        key={i}
        points={`${x},${2} ${x+1.8},${6.5} ${x+6},${6.5} ${x+2.5},${9} ${x+3.8},${13.5} ${x},${11} ${x-3.8},${13.5} ${x-2.5},${9} ${x-6},${6.5} ${x-1.8},${6.5}`}
        fill={color}
        transform={`scale(0.5) translate(${x},0)`}
      />
    )
  }
  return null // simplified — use circles instead
}

export default function PersonAvatar({ name, rankReq, size = 56, showRing = false, proposed = false, violation = false }) {
  const color = RANK_COLORS[rankReq] || { bg: hashColor(name || ''), light: '#e0e0e0', star: 0 }
  const initials = getInitials(name)
  const fontSize = size > 50 ? 14 : size > 36 ? 12 : 10
  const ringColor = violation ? '#ef4444' : proposed ? '#f59e0b' : color.light

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, filter: violation ? 'drop-shadow(0 0 4px #ef4444)' : proposed ? 'drop-shadow(0 0 4px #f59e0b)' : 'none' }}
    >
      <defs>
        <radialGradient id={`grad-${initials}-${size}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={lighten(color.bg, 40)} />
          <stop offset="100%" stopColor={color.bg} />
        </radialGradient>
        <clipPath id={`clip-${initials}-${size}`}>
          <circle cx="28" cy="28" r="26" />
        </clipPath>
      </defs>

      {/* Ring (if proposed or violation) */}
      {(showRing || proposed || violation) && (
        <circle cx="28" cy="28" r="27" fill="none" stroke={ringColor} strokeWidth="2.5" strokeDasharray={proposed ? "4 2" : "none"} />
      )}

      {/* Background circle */}
      <circle cx="28" cy="28" r="26" fill={`url(#grad-${initials}-${size})`} />

      {/* Silhouette body */}
      <g clipPath={`url(#clip-${initials}-${size})`}>
        {/* Head */}
        <circle cx="28" cy="20" r="9" fill={lighten(color.bg, 60)} opacity="0.35" />
        {/* Body */}
        <ellipse cx="28" cy="46" rx="14" ry="10" fill={lighten(color.bg, 60)} opacity="0.25" />
      </g>

      {/* Initials */}
      <text
        x="28"
        y="32"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize + 2}
        fontWeight="700"
        fontFamily="Sarabun, sans-serif"
        fill="white"
        letterSpacing="0.5"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
      >
        {initials}
      </text>

      {/* Rank dots at bottom */}
      {color.star > 0 && (
        <g>
          {Array.from({ length: Math.min(color.star, 5) }).map((_, i) => {
            const total = Math.min(color.star, 5)
            const spacing = 6
            const startX = 28 - ((total - 1) * spacing) / 2
            return (
              <circle
                key={i}
                cx={startX + i * spacing}
                cy="50"
                r="2.2"
                fill={color.light}
                opacity="0.9"
              />
            )
          })}
        </g>
      )}

      {/* Border */}
      <circle cx="28" cy="28" r="26" fill="none" stroke={color.light} strokeWidth="1.5" opacity="0.5" />
    </svg>
  )
}

function lighten(hex, amount) {
  if (hex.startsWith('hsl')) return hex
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0xff) + amount)
  const b = Math.min(255, (num & 0xff) + amount)
  return `rgb(${r},${g},${b})`
}

const FALLBACK_COLORS = [
  '#1d4ed8',
  '#4338ca',
  '#7c3aed',
  '#c026d3',
  '#be185d',
  '#c2410c',
  '#0f766e',
  '#0369a1',
  '#475569',
  '#6d28d9',
  '#0e7490',
  '#9d174d',
]

const CSS_COLOR_VARIABLES = FALLBACK_COLORS.map((fallback, index) => (
  `var(--dashboard-chart-series-${index + 1}, ${fallback})`
))

const STROKE_DASHES = [
  undefined,
  '8 4',
  '3 3',
  '12 4 2 4',
  '2 5',
  '16 3 2 3',
]

const MARKER_SHAPES = ['circle', 'triangle', 'square', 'diamond', 'cross', 'star']
const STYLE_CAPACITY = CSS_COLOR_VARIABLES.length * STROKE_DASHES.length

function getSeriesHash(key) {
  const normalizedKey = String(key ?? '')
  let hash = 0

  for (let index = 0; index < normalizedKey.length; index += 1) {
    hash = ((hash << 5) - hash + normalizedKey.charCodeAt(index)) | 0
  }

  return Math.abs(hash)
}

function createStyleFromSlot(slot) {
  const colorIndex = slot % CSS_COLOR_VARIABLES.length
  const patternIndex = Math.floor(slot / CSS_COLOR_VARIABLES.length)

  return {
    color: CSS_COLOR_VARIABLES[colorIndex],
    strokeDasharray: STROKE_DASHES[patternIndex],
    markerShape: MARKER_SHAPES[patternIndex],
  }
}

/**
 * Keeps the same station/locality tied to the same visual style in every compare
 * chart. The color, line pattern and marker shape form one stable identity.
 */
/**
 * Resolves collisions among the series visible in one chart while keeping the
 * preferred hash-based slot for each key whenever it is available.
 */
export function getCompareSeriesStyles(keys = []) {
  const styles = new Map()
  const occupiedSlots = new Set()

  keys.forEach(key => {
    const normalizedKey = String(key ?? '')
    if (styles.has(normalizedKey)) return

    let slot = getSeriesHash(normalizedKey) % STYLE_CAPACITY
    while (occupiedSlots.has(slot) && occupiedSlots.size < STYLE_CAPACITY) {
      slot = (slot + 1) % STYLE_CAPACITY
    }

    styles.set(normalizedKey, createStyleFromSlot(slot))
    occupiedSlots.add(slot)
  })

  return styles
}

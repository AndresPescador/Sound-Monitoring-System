import { format, isSameDay, isValid, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const DEFAULT_MAX_TICKS = 10
export const AUTO_FOCUS_THRESHOLD = 0.55

export const ACTIVE_DOT = {
  r: 4,
  strokeWidth: 2,
  fill: '#f8fbff',
}

export function isObservedValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

export function getObservedIndexBounds(data, valueKeys = ['value']) {
  const observedIndices = data
    .map((point, index) => (
      valueKeys.some(key => isObservedValue(point[key])) ? index : null
    ))
    .filter(index => index !== null)

  if (!observedIndices.length) return null

  return {
    firstIndex: observedIndices[0],
    lastIndex: observedIndices[observedIndices.length - 1],
  }
}

function getObservedTimeBounds(data, timeKey, valueKeys) {
  const observed = data
    .map((point, index) => ({
      index,
      timestamp: Date.parse(point[timeKey]),
      hasValue: valueKeys.some(key => isObservedValue(point[key])),
    }))
    .filter(point => point.hasValue && Number.isFinite(point.timestamp))

  if (!observed.length) return null

  return {
    first: Math.min(...observed.map(point => point.timestamp)),
    last: Math.max(...observed.map(point => point.timestamp)),
  }
}

// Calculates how much of the requested temporal range is covered by real data.
// Empty generated buckets are deliberately ignored.
export function getCoverageRatio(seriesList = [], range) {
  const from = Date.parse(range?.from)
  const to = Date.parse(range?.to)
  const requestedDuration = to - from
  if (!Number.isFinite(from) || !Number.isFinite(to) || requestedDuration <= 0) return null

  const bounds = seriesList
    .map(series => getObservedTimeBounds(series.data ?? [], series.timeKey ?? 't', series.valueKeys ?? ['value']))
    .filter(Boolean)

  if (!bounds.length) return null

  const observedFrom = Math.min(...bounds.map(bound => bound.first))
  const observedTo = Math.max(...bounds.map(bound => bound.last))
  const observedDuration = Math.max(0, Math.min(to, observedTo) - Math.max(from, observedFrom))
  return Math.min(1, observedDuration / requestedDuration)
}

export function getChartDataWindow(data, axisMode = 'range', valueKeys = ['value']) {
  if (axisMode !== 'data') return data

  const bounds = getObservedIndexBounds(data, valueKeys)
  if (!bounds) return data

  // Keep one surrounding bucket so the focused line/bar does not touch the plot edge.
  const padding = data.length > 1 ? 1 : 0
  const start = Math.max(0, bounds.firstIndex - padding)
  const end = Math.min(data.length, bounds.lastIndex + padding + 1)
  return data.slice(start, end)
}

// Keeps the first and last point visible while avoiding a label for every sample.
export function getEvenlySpacedTicks(values, maxTicks = DEFAULT_MAX_TICKS) {
  const uniqueValues = [...new Set(values.filter(value => value != null && value !== ''))]

  if (uniqueValues.length <= maxTicks || maxTicks < 2) return uniqueValues

  const lastIndex = uniqueValues.length - 1
  return Array.from({ length: maxTicks }, (_, index) => (
    uniqueValues[Math.round((index * lastIndex) / (maxTicks - 1))]
  ))
}

export function getTimeAxis(data, dataKey = 't', { maxTicks = DEFAULT_MAX_TICKS } = {}) {
  const values = data.map(item => item[dataKey]).filter(value => value != null && value !== '')
  const dates = values.map(value => parseISO(value)).filter(isValid)
  const spansMultipleDays = dates.length > 1 && dates.some(date => !isSameDay(date, dates[0]))
  const visibleTickCount = spansMultipleDays ? Math.min(maxTicks, 8) : maxTicks

  return {
    ticks: getEvenlySpacedTicks(values, visibleTickCount),
    tickFormatter: value => formatTimeTick(value, { includeDate: spansMultipleDays }),
  }
}

export function formatTimeTick(value, { includeDate = false } = {}) {
  try {
    return format(parseISO(value), includeDate ? 'dd/MM HH:mm' : 'HH:mm', { locale: es })
  } catch {
    return value
  }
}

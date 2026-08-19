import { format, isSameDay, isValid, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const DEFAULT_MAX_TICKS = 10

export const ACTIVE_DOT = {
  r: 4,
  strokeWidth: 2,
  fill: '#f8fbff',
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
  const spansMultipleDays = dates.some(date => !isSameDay(date, dates[0]))
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

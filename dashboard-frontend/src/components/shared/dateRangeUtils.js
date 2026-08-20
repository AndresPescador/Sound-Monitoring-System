import { format, isValid, subHours } from 'date-fns'
import { es } from 'date-fns/locale'

export const DEFAULT_RANGE_HOURS = 24

function toDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value ?? '')
  return isValid(date) ? date : null
}

export function buildPresetRange(hours, anchorTimestamp = new Date()) {
  const to = toDate(anchorTimestamp) ?? new Date()
  return {
    from: subHours(to, hours).toISOString(),
    to: to.toISOString(),
  }
}

export function hasRecentData(latestTimestamp, hours = DEFAULT_RANGE_HOURS, now = new Date()) {
  const latest = toDate(latestTimestamp)
  const current = toDate(now)
  if (!latest || !current) return false
  return latest >= subHours(current, hours) && latest <= current
}

export function getLatestTimestamp(values = []) {
  return values
    .map(toDate)
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())
    .at(0)?.toISOString() ?? null
}

export function getStationLatestTimestamp(station) {
  return station?.latest_recorded_at
    ?? station?.latest_measurement_at
    ?? station?.last_seen_at
    ?? null
}

export function formatDateTime(value) {
  const date = toDate(value)
  return date ? format(date, "d MMM yyyy HH:mm", { locale: es }) : 'Sin registro'
}

export function formatRangeLabel(range) {
  const from = toDate(range?.from)
  const to = toDate(range?.to)
  if (!from || !to) return 'el último período disponible'

  const sameDay = format(from, 'yyyy-MM-dd') === format(to, 'yyyy-MM-dd')
  return sameDay
    ? format(to, "d MMM yyyy", { locale: es })
    : `${format(from, "d MMM", { locale: es })}–${format(to, "d MMM yyyy", { locale: es })}`
}

export function toDatetimeLocalValue(value) {
  const date = toDate(value)
  if (!date) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

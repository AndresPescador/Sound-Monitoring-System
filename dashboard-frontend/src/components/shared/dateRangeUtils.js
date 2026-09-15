import { defaultT } from '../../i18n/core.mjs'
import { format, isValid, subHours } from 'date-fns'

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

export function formatDateTime(value, t = defaultT) { return bogotaTime(value, t) }
export function formatRangeLabel(range, t = defaultT) {
  return `${bogotaTime(range?.from, t)} – ${bogotaTime(range?.to, t)}`
}
export function toDatetimeLocalValue(value) {
  const date = toDate(value)
  if (!date) return ''
  return new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 16)
}

export function bogotaDay(value) {
  const date = toDate(value)
  if (!date) return ''
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function bogotaTime(value, t = defaultT, { date = true, seconds = false } = {}) {
  const parsed = toDate(value)
  if (!parsed) return '—'
  return new Intl.DateTimeFormat(t.locale, { timeZone: 'America/Bogota', ...(date ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(parsed)
}
export function validPublicRange(from, to) {
  const start = Date.parse(from), end = Date.parse(to)
  return Number.isFinite(start) && Number.isFinite(end) && start <= end && end - start <= 31 * 86400000
}

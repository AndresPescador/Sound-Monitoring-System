import { useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildPresetRange, validPublicRange } from '../components/shared/dateRangeUtils'

export default function usePublicQuery(prefix = '') {
  const [params, setParams] = useSearchParams()
  const current = useRef(params)
  current.current = params
  const setQuery = useCallback((patch, replace = false) => {
    // A ref also composes updates made by separate controls in the same event.
    const next = new URLSearchParams(current.current)
    Object.entries(patch).forEach(([key, value]) => {
      if (value == null || value === '') next.delete(prefix + key)
      else next.set(prefix + key, String(value))
    })
    current.current = next
    setParams(next, { replace, preventScrollReset: true })
  }, [setParams, prefix])
  const get = (key, fallback = '') => params.get(prefix + key) ?? fallback
  return { get, setQuery, params }
}
export function queryRange(get, fallback) {
  const from = get('from'), to = get('to')
  return validPublicRange(from, to) ? { from: new Date(from).toISOString(), to: new Date(to).toISOString() } : fallback
}
export function defaultRange() { return buildPresetRange(24) }

export function historicalAnchor(get, latest) {
  const value = get('historical', latest)
  return value && Number.isFinite(Date.parse(value)) ? value : null
}

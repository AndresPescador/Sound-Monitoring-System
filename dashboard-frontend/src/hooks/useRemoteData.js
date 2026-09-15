import { useEffect, useRef, useState, useCallback } from 'react'

// Keyed results prevent old data flashing during a route/filter change.
export default function useRemoteData(key, fetcher, enabled = true) {
  const [state, setState] = useState({ key: null, loading: true, data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const latestFetcher = useRef(fetcher)
  latestFetcher.current = fetcher
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setState({ key, loading: true, data: null, error: null })
    Promise.resolve().then(() => latestFetcher.current(controller.signal))
      .then(data => { if (!controller.signal.aborted) setState({ key, loading: false, data, error: null }) })
      .catch(error => { if (!controller.signal.aborted) setState({ key, loading: false, data: null, error }) })
    return () => controller.abort()
  }, [key, enabled, attempt])
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  return { ...(state.key === key ? state : { data: null, error: null, loading: true }), retry }
}

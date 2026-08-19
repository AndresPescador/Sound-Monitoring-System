import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getStationSummary, getStations } from '../api/stations'
import { ROUTES, map3DStationPath } from '../routes'

const POLL_INTERVAL_MS = 60_000
const SUMMARY_CACHE_LIMIT = 12
const stationSummaryCache = new Map()

const Map3DContext = createContext(null)

function cacheSummary(code, value) {
  stationSummaryCache.delete(code)
  stationSummaryCache.set(code, value)
  while (stationSummaryCache.size > SUMMARY_CACHE_LIMIT) {
    stationSummaryCache.delete(stationSummaryCache.keys().next().value)
  }
}

function stationCodeFromPath(pathname) {
  const prefix = `${ROUTES.map3D}/stations/`
  if (!pathname.startsWith(prefix)) return null
  const value = pathname.slice(prefix.length).split('/')[0]
  return value ? decodeURIComponent(value) : null
}

export function Map3DProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [stations, setStations] = useState([])
  const [selectedStationCode, setSelectedStationCode] = useState(() => stationCodeFromPath(location.pathname))
  const [highlightedStationCodes, setHighlightedStationCodes] = useState(() => {
    const code = stationCodeFromPath(location.pathname)
    return code ? [code] : []
  })
  const [hoveredStationCode, setHoveredStationCode] = useState(null)
  const [selectedSummary, setSelectedSummary] = useState(null)
  const [summaryError, setSummaryError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loadingStations, setLoadingStations] = useState(true)
  const [refreshingStations, setRefreshingStations] = useState(false)
  const [stationsError, setStationsError] = useState(null)

  const refreshStations = useCallback(async ({ signal } = {}) => {
    setRefreshingStations(true)
    try {
      const response = await getStations(signal ? { signal } : {})
      const nextStations = Array.isArray(response.data) ? response.data : []
      setStations(nextStations)
      setHoveredStationCode(current => (
        current && nextStations.some(station => station.station_code === current) ? current : null
      ))
      setUpdatedAt(new Date())
      setStationsError(null)
      return nextStations
    } catch (error) {
      if (error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') {
        setStationsError('No fue posible actualizar el snapshot de estaciones.')
      }
      return null
    } finally {
      if (!signal?.aborted) {
        setLoadingStations(false)
        setRefreshingStations(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    refreshStations({ signal: controller.signal })
    const intervalId = window.setInterval(() => refreshStations(), POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [refreshStations])

  useEffect(() => {
    const routeCode = stationCodeFromPath(location.pathname)
    if (routeCode) {
      setSelectedStationCode(routeCode)
      setHighlightedStationCodes([routeCode])
      return
    }
    if (location.pathname === ROUTES.map3D) {
      setSelectedStationCode(null)
      setHighlightedStationCodes([])
    }
  }, [location.pathname])

  useEffect(() => {
    if (!selectedStationCode) {
      setSelectedSummary(null)
      setSummaryError(null)
      return undefined
    }

    const cached = stationSummaryCache.get(selectedStationCode)
    if (cached) {
      setSelectedSummary(cached)
      setSummaryError(null)
      return undefined
    }

    const controller = new AbortController()
    setSelectedSummary(null)
    setSummaryError(null)
    getStationSummary(selectedStationCode, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        cacheSummary(selectedStationCode, response.data)
        setSelectedSummary(response.data)
      })
      .catch(error => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return
        setSummaryError('No fue posible cargar el resumen de esta estación.')
      })
    return () => controller.abort()
  }, [selectedStationCode])

  const selectedStation = useMemo(() => (
    stations.find(station => station.station_code === selectedStationCode) ?? null
  ), [selectedStationCode, stations])

  const selectStation = useCallback((code) => {
    if (!code) return
    setSelectedStationCode(code)
    setHighlightedStationCodes([code])
    navigate(map3DStationPath(code), { state: { openAnalysis: false } })
  }, [navigate])

  const focusStation = useCallback((code) => {
    if (!code) return
    setSelectedStationCode(code)
    setHighlightedStationCodes([code])
  }, [])

  const focusStations = useCallback((codes = []) => {
    const nextCodes = [...new Set(codes.filter(Boolean))]
    setHighlightedStationCodes(nextCodes)
    if (nextCodes.length === 1) setSelectedStationCode(nextCodes[0])
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedStationCode(null)
    setHighlightedStationCodes([])
    setSelectedSummary(null)
    navigate(ROUTES.map3D)
  }, [navigate])

  const value = useMemo(() => ({
    stations,
    selectedStation,
    selectedStationCode,
    selectedSummary,
    highlightedStationCodes,
    hoveredStationCode,
    loadingStations,
    refreshingStations,
    stationsError,
    summaryError,
    updatedAt,
    refreshStations,
    selectStation,
    focusStation,
    focusStations,
    clearSelection,
    setHoveredStationCode,
  }), [
    stations,
    selectedStation,
    selectedStationCode,
    selectedSummary,
    highlightedStationCodes,
    hoveredStationCode,
    loadingStations,
    refreshingStations,
    stationsError,
    summaryError,
    updatedAt,
    refreshStations,
    selectStation,
    focusStation,
    focusStations,
    clearSelection,
  ])

  return <Map3DContext.Provider value={value}>{children}</Map3DContext.Provider>
}

export function useMap3DContext() {
  const value = useContext(Map3DContext)
  if (!value) throw new Error('useMap3DContext debe usarse dentro de Map3DProvider')
  return value
}

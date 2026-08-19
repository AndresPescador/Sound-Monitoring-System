import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getStations, getStationSummary } from '../api/stations'
import { getRawMeasurements } from '../api/measurements'
import NoiseTwinMap from '../components/map/NoiseTwinMap'
import TimeSeriesChart from '../components/charts/TimeSeriesChart'
import LoadingSpinner from '../components/shared/LoadingSpinner'

const POLL_INTERVAL_MS = 60_000
const CHART_WINDOW_HOURS = 6
const CHART_POINT_COUNT = 24

const toEnergy = (leq) => Math.pow(10, leq / 10)
const toDbfs = (energy) => energy > 0 ? 10 * Math.log10(energy) : null

function relativeTime(value) {
  if (!value) return 'sin datos'
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true, locale: es })
  } catch {
    return 'fecha no disponible'
  }
}

function downsample(points, maxPoints = CHART_POINT_COUNT) {
  if (points.length <= maxPoints) return points
  const step = (points.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)])
}

function toChartSeries(points, metric) {
  const validPoints = points
    .filter(point => Number.isFinite(Number(point[metric])))
    .map(point => ({
      recorded_at: point.recorded_at,
      value: Number(point[metric]),
    }))
  return downsample(validPoints)
}

function toBinauralSeries(points) {
  const validPoints = points
    .filter(point => (
      Number.isFinite(Number(point.ch_left_dbfs)) &&
      Number.isFinite(Number(point.ch_right_dbfs))
    ))
    .map(point => ({
      recorded_at: point.recorded_at,
      left: Number(point.ch_left_dbfs),
      right: Number(point.ch_right_dbfs),
    }))
  return downsample(validPoints)
}

function SideMetric({ label, value, detail }) {
  return (
    <div className="border-b border-slate-200 py-3 last:border-b-0">
      <p className="text-[10px] font-display font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 font-display text-lg font-bold tabular-nums text-slate-800">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

export default function UrbanTwin() {
  const [stations, setStations] = useState([])
  const [selectedStationCode, setSelectedStationCode] = useState(null)
  const [selectedSummary, setSelectedSummary] = useState(null)
  const [timeseries, setTimeseries] = useState([])
  const [binauralTimeseries, setBinauralTimeseries] = useState([])
  const [leftStationFilter, setLeftStationFilter] = useState('')
  const [stationMenuOpen, setStationMenuOpen] = useState(false)
  const [hoveredStationCode, setHoveredStationCode] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refreshStations = useCallback(async () => {
    try {
      const response = await getStations()
      setStations(response.data)
      setSelectedStationCode(current => (
        current && response.data.some(s => s.station_code === current)
          ? current
          : null
      ))
      setHoveredStationCode(current => (
        current && response.data.some(s => s.station_code === current)
          ? current
          : null
      ))
      setUpdatedAt(new Date())
      setError(null)
    } catch (requestError) {
      setError('No fue posible actualizar el snapshot de estaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshStations()
    const intervalId = window.setInterval(refreshStations, POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [refreshStations])

  useEffect(() => {
    if (!selectedStationCode) {
      setSelectedSummary(null)
      setTimeseries([])
      setBinauralTimeseries([])
      return
    }

    let active = true
    setSelectedSummary(null)
    setTimeseries([])
    setBinauralTimeseries([])
    const to = new Date()
    const from = new Date(to.getTime() - CHART_WINDOW_HOURS * 60 * 60 * 1000)

    Promise.all([
      getStationSummary(selectedStationCode),
      getRawMeasurements(selectedStationCode, {
        from: from.toISOString(),
        to: to.toISOString(),
        limit: 600,
      }),
    ])
      .then(([summaryResponse, measurementsResponse]) => {
        if (!active) return
        const measurements = measurementsResponse.data.data ?? []
        setSelectedSummary(summaryResponse.data)
        setTimeseries(toChartSeries(measurements, 'leq_dbfs'))
        setBinauralTimeseries(toBinauralSeries(measurements))
      })
      .catch(() => {
        if (!active) return
        setSelectedSummary(null)
        setTimeseries([])
        setBinauralTimeseries([])
      })

    return () => { active = false }
  }, [selectedStationCode])

  const observedStations = useMemo(() => (
    stations.filter(s => Number.isFinite(s.current_leq_dbfs))
  ), [stations])

  const cityLeq = useMemo(() => {
    if (!observedStations.length) return null
    const meanEnergy = observedStations.reduce((total, station) => (
      total + toEnergy(station.current_leq_dbfs)
    ), 0) / observedStations.length
    return toDbfs(meanEnergy)
  }, [observedStations])

  const selectedStation = stations.find(s => s.station_code === selectedStationCode)

  const leftFilteredStations = useMemo(() => {
    const query = leftStationFilter.trim().toLocaleLowerCase()
    if (!query) return stations
    return stations.filter(station => (
      station.name.toLocaleLowerCase().includes(query) ||
      station.locality.toLocaleLowerCase().includes(query)
    ))
  }, [leftStationFilter, stations])

  const stationMenuExpanded = stationMenuOpen

  if (loading) return <LoadingSpinner label="Cargando mapa 3D..." />

  return (
    <div className="relative h-[100dvh] min-h-[620px] overflow-hidden bg-slate-950">
      <NoiseTwinMap
        stations={stations}
        selectedStationCode={selectedStationCode}
        hoveredStationCode={hoveredStationCode}
        onSelectStation={setSelectedStationCode}
      />

      <aside className={`absolute left-3 top-4 z-20 flex w-[min(320px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md md:left-5 md:top-5 ${stationMenuExpanded ? 'bottom-64 max-sm:bottom-[53dvh]' : 'bottom-auto max-sm:bottom-auto md:bottom-auto'}`}>
        {stationMenuOpen ? (
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-primary">Mapa 3D</p>
                <h2 className="mt-1 font-display text-xl font-bold text-slate-800">Buscar estación</h2>
              </div>
              <button type="button" onClick={() => { setStationMenuOpen(false); setHoveredStationCode(null) }} className="grid min-h-11 min-w-11 place-items-center rounded p-1 text-lg leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label="Replegar selector de estaciones">×</button>
            </div>
            <label className="relative mt-3 block">
              <span className="sr-only">Buscar estaciones por nombre</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-slate-400" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={leftStationFilter}
                onChange={event => setLeftStationFilter(event.target.value)}
                placeholder="Buscar por nombre..."
                autoFocus
                className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <p className="mt-2 text-[10px] text-slate-500">{leftFilteredStations.length} de {stations.length} estaciones</p>
          </div>
        ) : (
          <button type="button" onClick={() => setStationMenuOpen(true)} className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-[background-color,transform] hover:bg-slate-50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30" aria-expanded={stationMenuOpen} aria-controls="station-selector-content" aria-label="Abrir selector de estaciones">
          <span>
              <span className="block text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-primary">Mapa 3D</span>
              <span className="mt-1 block font-display text-base font-bold text-slate-800">Buscar estación</span>
            </span>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-lg text-slate-500" aria-hidden="true">⌄</span>
          </button>
        )}

        <div id="station-selector-content" className={`min-h-0 flex-1 overflow-y-auto px-3 pb-4 ${stationMenuExpanded ? '' : 'hidden'}`}>
          <section className="py-4">
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="font-display text-sm font-bold text-slate-800">Estaciones</h3>
              <span className="text-[10px] text-slate-500">clic para hacer zoom</span>
            </div>
            <div className="mt-2 space-y-1">
              {leftFilteredStations.map(station => (
                <button
                  key={station.station_code}
                  type="button"
                  onClick={() => setSelectedStationCode(station.station_code)}
                  onMouseEnter={() => setHoveredStationCode(station.station_code)}
                  onMouseLeave={() => setHoveredStationCode(current => current === station.station_code ? null : current)}
                  onFocus={() => setHoveredStationCode(station.station_code)}
                  onBlur={() => setHoveredStationCode(current => current === station.station_code ? null : current)}
                  className={`flex min-h-11 w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-sm transition-[background-color,border-color,transform] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/30 ${station.station_code === selectedStationCode ? 'border-primary bg-primary text-white' : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className="min-w-0"><span className="block truncate font-display text-xs font-semibold">{station.name}</span><span className={`block truncate text-[11px] ${station.station_code === selectedStationCode ? 'text-blue-100' : 'text-slate-500'}`}>{station.locality}</span></span>
                  <span className="ml-2 shrink-0 font-mono text-[11px]">{station.current_leq_dbfs?.toFixed(1) ?? 'Sin dato'}</span>
                </button>
              ))}
              {!leftFilteredStations.length && <p className="px-2 py-4 text-center text-xs text-slate-500">No hay estaciones que coincidan.</p>}
            </div>
          </section>
        </div>
      </aside>

      {error && <p className="absolute bottom-5 left-4 z-10 max-w-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-lg sm:left-6">{error}</p>}

      <aside className="absolute right-4 top-4 z-20 flex max-h-[calc(100dvh-2rem)] w-[380px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md max-sm:bottom-3 max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:w-auto sm:right-5 sm:top-5">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-primary">Resumen acústico</p>
              <h2 className="mt-1 font-display text-xl font-bold text-slate-800">Estado de la ciudad</h2>
            </div>
            <button type="button" onClick={refreshStations} className="min-h-11 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-display font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30">Actualizar</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-5">
            <SideMetric label="Leq ciudad" value={cityLeq?.toFixed(1) ?? 'Sin dato'} detail="dBFS · promedio energético" />
            <SideMetric label="Lecturas activas" value={`${observedStations.length}/${stations.length}`} detail={updatedAt ? relativeTime(updatedAt.toISOString()) : 'sin snapshot'} />
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 pb-5">
          <section className="border-b border-slate-200 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-display font-semibold uppercase tracking-[0.12em] text-slate-500">Estación seleccionada</p>
                {selectedStation ? (
                  <>
                    <h3 className="mt-1 truncate font-display text-base font-bold text-slate-800">{selectedStation.name}</h3>
                    <p className="truncate text-xs text-slate-500">{selectedStation.locality} · {selectedStation.station_code}</p>
                  </>
                ) : (
                  <h3 className="mt-1 font-display text-base font-bold text-slate-800">Sin selección</h3>
                )}
              </div>
              {selectedStation && <Link className="shrink-0 text-[11px] font-display font-semibold text-primary hover:text-primary-dark" to={`/stations/${selectedStation.station_code}`}>Detalle →</Link>}
            </div>

            {selectedStation ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-x-3 rounded-md bg-slate-50 px-3">
                  <SideMetric label="Leq actual" value={selectedStation.current_leq_dbfs?.toFixed(1) ?? 'Sin dato'} detail="dBFS" />
                  <SideMetric label="Última hora" value={selectedSummary?.last_hour_leq?.toFixed(1) ?? 'Sin dato'} detail="Leq dBFS" />
                  <SideMetric label="L10 / L90" value={`${selectedSummary?.last_hour_l10?.toFixed(1) ?? 'Sin dato'} / ${selectedSummary?.last_hour_l90?.toFixed(1) ?? 'Sin dato'}`} detail="dBFS" />
                  <SideMetric label="Estado" value={selectedStation.is_active ? 'Activa' : 'Inactiva'} detail={relativeTime(selectedStation.last_seen_at)} />
                </div>

                <p className="mt-3 truncate text-xs text-slate-500" title={selectedStation.address ?? undefined}>{selectedStation.address ?? 'Dirección no registrada'}</p>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <h4 className="font-display text-sm font-bold text-slate-800">Tendencia de ruido</h4>
                  <span className="text-[10px] text-slate-500">últimas {CHART_WINDOW_HOURS} h · {CHART_POINT_COUNT} puntos</span>
                </div>
                <div className="mt-1 rounded-md border border-slate-200 bg-white px-1 py-1">
                  <TimeSeriesChart data={timeseries} metricLabel="Leq" unit="dBFS" compact height={112} />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <h4 className="font-display text-sm font-bold text-slate-800">Canales binaurales</h4>
                  <div className="flex gap-2 text-[10px] text-slate-700"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-700" aria-hidden="true" />L</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-600" aria-hidden="true" />R</span></div>
                </div>
                <div className="mt-1 rounded-md border border-slate-200 bg-white px-1 py-1">
                  <TimeSeriesChart
                    data={binauralTimeseries}
                    unit="dBFS"
                    compact
                    height={112}
                    series={[
                      { dataKey: 'left', label: 'Canal L', color: '#0e7490' },
                      { dataKey: 'right', label: 'Canal R', color: '#7c3aed' },
                    ]}
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-slate-500">Selecciona una estación desde el buscador de la izquierda o directamente en el mapa.</p>
            )}
          </section>
        </div>

      </aside>
    </div>
  )
}

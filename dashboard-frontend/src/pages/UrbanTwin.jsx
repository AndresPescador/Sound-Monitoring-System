import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getStations, getStationSummary } from '../api/stations'
import { getMeasurements } from '../api/measurements'
import NoiseTwinMap from '../components/map/NoiseTwinMap'
import TimeSeriesChart from '../components/charts/TimeSeriesChart'
import LoadingSpinner from '../components/shared/LoadingSpinner'

const POLL_INTERVAL_MS = 60_000

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
  const [selectedColumn, setSelectedColumn] = useState(null)
  const [columnRadius, setColumnRadius] = useState(35)
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
      return
    }

    let active = true
    const to = new Date()
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)

    Promise.all([
      getStationSummary(selectedStationCode),
      getMeasurements(selectedStationCode, {
        metric: 'leq_dbfs',
        from: from.toISOString(),
        to: to.toISOString(),
        limit: 800,
      }),
    ])
      .then(([summaryResponse, measurementsResponse]) => {
        if (!active) return
        setSelectedSummary(summaryResponse.data)
        setTimeseries(measurementsResponse.data.data)
      })
      .catch(() => {
        if (!active) return
        setSelectedSummary(null)
        setTimeseries([])
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

  const staleStations = useMemo(() => {
    const maxAgeMs = 3 * 60 * 1000
    const now = Date.now()
    return stations.filter(s => !s.last_seen_at || now - new Date(s.last_seen_at).getTime() > maxAgeMs).length
  }, [stations, updatedAt])

  const selectedStation = stations.find(s => s.station_code === selectedStationCode)

  if (loading) return <LoadingSpinner label="Cargando gemelo urbano 3D..." />

  return (
    <div className="relative h-[100dvh] min-h-[620px] overflow-hidden bg-slate-950">
      <NoiseTwinMap
        stations={stations}
        selectedStationCode={selectedStationCode}
        onSelectStation={setSelectedStationCode}
        columnRadius={columnRadius}
        onSelectColumn={setSelectedColumn}
      />

      <header className="absolute left-4 top-4 z-10 max-w-[calc(100%-2rem)] rounded-lg border border-white/30 bg-slate-950/85 px-4 py-3 text-white shadow-xl backdrop-blur-sm sm:left-6 sm:top-6">
        <div className="flex items-start gap-3">
          <Link to="/" className="grid h-8 w-8 shrink-0 place-items-center rounded bg-primary text-sm font-bold hover:bg-primary-dark" aria-label="Volver al panel principal">←</Link>
          <div>
            <p className="text-[10px] font-mono font-semibold tracking-[0.16em] text-cyan-300">DECK.GL / MAPLIBRE</p>
            <h1 className="mt-0.5 font-display text-lg font-bold">Gemelo acústico urbano</h1>
            <p className="mt-0.5 text-xs text-slate-300">Bogotá D.C. · Leq energético en tiempo casi real</p>
          </div>
        </div>
      </header>

      {error && <p className="absolute bottom-5 left-4 z-10 max-w-sm rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-lg sm:left-6">{error}</p>}

      <aside className="absolute bottom-0 right-0 top-0 z-20 flex w-full max-w-[400px] flex-col border-l border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md sm:w-[380px]">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-display font-semibold uppercase tracking-[0.15em] text-primary">Resumen acústico</p>
              <h2 className="mt-1 font-display text-xl font-bold text-slate-800">Estado de la ciudad</h2>
            </div>
            <button onClick={refreshStations} className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-display font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary">Actualizar</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-5">
            <SideMetric label="Leq ciudad" value={cityLeq?.toFixed(1) ?? '—'} detail="dBFS · promedio energético" />
            <SideMetric label="Lecturas activas" value={`${observedStations.length}/${stations.length}`} detail={updatedAt ? relativeTime(updatedAt.toISOString()) : 'sin snapshot'} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <section className="border-b border-slate-200 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-display font-semibold uppercase tracking-[0.12em] text-slate-500">Estación seleccionada</p>
                <h3 className="mt-1 truncate font-display text-lg font-bold text-slate-800">{selectedStation?.name ?? 'Selecciona una estación'}</h3>
                <p className="truncate text-sm text-slate-500">{selectedStation?.locality ?? 'Haz clic en una columna o punto del mapa.'}</p>
              </div>
              {selectedStation && <Link className="shrink-0 text-xs font-display font-semibold text-primary hover:text-primary-dark" to={`/stations/${selectedStation.station_code}`}>Detalle →</Link>}
            </div>
            {selectedStation && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-slate-50 px-3">
                <SideMetric label="Leq actual" value={selectedStation.current_leq_dbfs?.toFixed(1) ?? '—'} detail="dBFS" />
                <SideMetric label="Conexión" value={relativeTime(selectedStation.last_seen_at)} detail={selectedStation.is_active ? 'estación activa' : 'estación inactiva'} />
              </div>
            )}
          </section>

          <section className="border-b border-slate-200 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-display font-semibold uppercase tracking-[0.12em] text-slate-500">Visualización espacial</p>
                <h3 className="mt-1 font-display text-base font-bold text-slate-800">Columnas acústicas 3D</h3>
              </div>
              <select id="column-radius" value={columnRadius} onChange={event => setColumnRadius(Number(event.target.value))} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary" aria-label="Ancho de columnas">
                <option value={25}>Ancho 25 m</option>
                <option value={35}>Ancho 35 m</option>
                <option value={45}>Ancho 45 m</option>
              </select>
            </div>
            {selectedColumn ? (
              <p className="mt-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-slate-700"><span className="font-semibold text-cyan-800">Columna seleccionada:</span> Leq {selectedColumn.leqDbfs?.toFixed(1) ?? '—'} dBFS · altura relativa {selectedColumn.elevationValue?.toFixed(0) ?? '—'} m</p>
            ) : <p className="mt-3 text-xs leading-relaxed text-slate-500">Cada columna se centra en su estación. La altura compara la intensidad de Leq relativa a -60 dBFS.</p>}
          </section>

          <section className="border-b border-slate-200 py-4">
            <h3 className="font-display text-base font-bold text-slate-800">Leq — últimas 24 horas</h3>
            <div className="mt-2 h-[190px] rounded-md border border-slate-200 bg-white p-1"><TimeSeriesChart data={timeseries} metricLabel="Leq" unit="dBFS" /></div>
          </section>

          <section className="py-4">
            <div className="flex items-center justify-between"><h3 className="font-display text-base font-bold text-slate-800">Estaciones</h3><span className="text-xs text-slate-500">{staleStations} sin dato reciente</span></div>
            <div className="mt-2 space-y-1">
              {stations.map(station => (
                <button key={station.station_code} onClick={() => setSelectedStationCode(station.station_code)} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors ${station.station_code === selectedStationCode ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <span className="min-w-0"><span className="block truncate font-display font-semibold">{station.name}</span><span className={`block truncate text-xs ${station.station_code === selectedStationCode ? 'text-blue-100' : 'text-slate-500'}`}>{station.locality}</span></span>
                  <span className="ml-2 font-mono text-xs">{station.current_leq_dbfs?.toFixed(1) ?? '—'}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <p className="border-t border-slate-200 px-5 py-2 text-[10px] leading-relaxed text-slate-400">Valores actuales en dBFS; altura como intensidad media provisional.</p>
      </aside>
    </div>
  )
}

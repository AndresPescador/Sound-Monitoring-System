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

function MetricCard({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <p className="text-xs font-display font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-text">{value}</p>
      {detail && <p className="mt-1 text-xs text-text-light">{detail}</p>}
    </div>
  )
}

export default function UrbanTwin() {
  const [stations, setStations] = useState([])
  const [selectedStationCode, setSelectedStationCode] = useState(null)
  const [selectedSummary, setSelectedSummary] = useState(null)
  const [timeseries, setTimeseries] = useState([])
  const [selectedHex, setSelectedHex] = useState(null)
  const [hexRadius, setHexRadius] = useState(75)
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
          : response.data.find(s => s.current_leq_dbfs != null)?.station_code ?? null
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-mono text-primary">MVP · DECK.GL / WEBGL</p>
          <h1 className="text-2xl font-display font-bold text-text">Gemelo acústico urbano 3D</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Agregación espacial de las últimas lecturas disponibles. El color usa Leq energético; la altura es una representación provisional de intensidad, no de picos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-display font-medium text-text-muted" htmlFor="hex-radius">Radio</label>
          <select
            id="hex-radius"
            value={hexRadius}
            onChange={event => setHexRadius(Number(event.target.value))}
            className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value={50}>50 m</option>
            <option value={75}>75 m</option>
            <option value={100}>100 m</option>
          </select>
          <button
            onClick={refreshStations}
            className="rounded bg-primary px-3 py-1.5 text-sm font-display font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error && <p className="rounded border border-noise-high/30 bg-red-50 px-3 py-2 text-sm text-noise-high">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Leq ciudad" value={cityLeq?.toFixed(1) ?? '—'} detail="dBFS · promedio energético" />
        <MetricCard label="Con lectura" value={`${observedStations.length}/${stations.length}`} detail="estaciones con Leq actual" />
        <MetricCard label="Sin dato reciente" value={staleStations} detail="más de 3 minutos" />
        <MetricCard label="Snapshot" value={updatedAt ? relativeTime(updatedAt.toISOString()) : '—'} detail="polling cada 60 segundos" />
      </div>

      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-bg shadow-sm xl:grid-cols-[minmax(0,1fr)_360px]">
        <NoiseTwinMap
          stations={stations}
          selectedStationCode={selectedStationCode}
          onSelectStation={setSelectedStationCode}
          hexRadius={hexRadius}
          onSelectHex={setSelectedHex}
        />

        <aside className="max-h-[540px] overflow-y-auto border-t border-border bg-surface p-4 xl:border-l xl:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-display font-semibold uppercase tracking-wide text-text-muted">Analítica de estación</p>
              <h2 className="mt-1 text-lg font-display font-bold text-text">{selectedStation?.name ?? 'Selecciona una estación'}</h2>
              <p className="text-sm text-text-muted">{selectedStation?.locality ?? 'Haz clic en un punto del mapa o en la lista.'}</p>
            </div>
            {selectedStation && (
              <Link className="text-xs font-display font-medium text-primary hover:text-primary-dark" to={`/stations/${selectedStation.station_code}`}>
                Ver detalle →
              </Link>
            )}
          </div>

          {selectedStation && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MetricCard label="Leq actual" value={selectedStation.current_leq_dbfs?.toFixed(1) ?? '—'} detail="dBFS" />
              <MetricCard label="Última conexión" value={relativeTime(selectedStation.last_seen_at)} detail={selectedStation.is_active ? 'activa' : 'inactiva'} />
            </div>
          )}

          {selectedHex && (
            <div className="mt-4 rounded-lg border border-primary/20 bg-blue-50 p-3">
              <p className="text-xs font-display font-semibold uppercase tracking-wide text-primary">Hexágono seleccionado</p>
              <p className="mt-1 text-sm text-text">
                {selectedHex.count} estación{selectedHex.count === 1 ? '' : 'es'} · Leq energético {selectedHex.leqDbfs?.toFixed(1) ?? '—'} dBFS
              </p>
            </div>
          )}

          <section className="mt-5">
            <h3 className="text-sm font-display font-semibold text-text">Leq — últimas 24 horas</h3>
            <div className="mt-2 h-[220px] rounded-lg border border-border bg-bg p-1">
              <TimeSeriesChart data={timeseries} metricLabel="Leq" unit="dBFS" />
            </div>
          </section>

          <section className="mt-5">
            <h3 className="text-sm font-display font-semibold text-text">Estaciones</h3>
            <div className="mt-2 space-y-1">
              {stations.map(station => (
                <button
                  key={station.station_code}
                  onClick={() => setSelectedStationCode(station.station_code)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors ${
                    station.station_code === selectedStationCode
                      ? 'bg-primary text-white'
                      : 'bg-bg text-text hover:bg-slate-100'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display font-medium">{station.name}</span>
                    <span className={`block truncate text-xs ${station.station_code === selectedStationCode ? 'text-blue-100' : 'text-text-muted'}`}>{station.locality}</span>
                  </span>
                  <span className="ml-2 font-mono text-xs">{station.current_leq_dbfs?.toFixed(1) ?? '—'}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <p className="text-xs text-text-light">
        Nota metodológica: los valores actuales son dBFS, no dB(A) calibrados. Los eventos de pico aún no se registran en el modelo de datos; por ello no se presentan como una altura de incidencia.
      </p>
    </div>
  )
}

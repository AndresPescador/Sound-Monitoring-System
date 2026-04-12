import { useEffect, useState, useMemo } from 'react'
import { subHours }       from 'date-fns'
import { getCompare }     from '../api/compare'
import { getStations }    from '../api/stations'
import CompareChart       from '../components/charts/CompareChart'
import DateRangePicker    from '../components/shared/DateRangePicker'
import LoadingSpinner     from '../components/shared/LoadingSpinner'
import ChartInfo          from '../components/shared/ChartInfo'
import { getMetricDescription } from '../components/shared/metricDescriptions'

// ─── Métricas disponibles en /compare ────────────────────────────────────────
const COMPARE_METRICS = [
  { value: 'leq_hour',              label: 'Leq horario' },
  { value: 'l10',                   label: 'L10 (picos)' },
  { value: 'l50',                   label: 'L50 (típico)' },
  { value: 'l90',                   label: 'L90 (fondo)' },
  { value: 'dbfs_avg',              label: 'dBFS promedio' },
  { value: 'dbfs_max',              label: 'dBFS máximo' },
  { value: 'avg_spectral_centroid', label: 'Centroide espectral' },
  { value: 'avg_ild_db',            label: 'ILD promedio' },
  { value: 'avg_interaural_corr',   label: 'Correlación interaural' },
]

// ─── Subcomponente: selector de tags con scroll ───────────────────────────────
function TagSelector({ items, selected, onToggle, onSelectAll, onClearAll, getKey, getLabel, getSubLabel }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={onSelectAll}
          className="text-xs font-display font-medium text-primary hover:text-primary-dark transition-colors"
        >
          Todas
        </button>
        <span className="text-text-light text-xs">·</span>
        <button
          onClick={onClearAll}
          className="text-xs font-display font-medium text-text-muted hover:text-text transition-colors"
        >
          Ninguna
        </button>
        <span className="text-xs text-text-light ml-auto">
          {selected.size} / {items.length} seleccionadas
        </span>
      </div>
      {/* Contenedor con scroll + wrap limitado */}
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 scrollbar-thin">
        {items.map(item => {
          const key = getKey(item)
          const active = selected.has(key)
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`
                inline-flex flex-col items-start px-2.5 py-1 rounded-md border text-left
                transition-all duration-150 leading-tight
                ${active
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-bg text-text-muted border-border hover:border-primary-light hover:text-text'
                }
              `}
            >
              <span className="text-xs font-display font-semibold">{getLabel(item)}</span>
              {getSubLabel && (
                <span className={`text-[10px] font-mono ${active ? 'text-blue-200' : 'text-text-light'}`}>
                  {getSubLabel(item)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Subcomponente: tarjeta de sección ───────────────────────────────────────
function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-bg border border-border rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-base font-display font-bold text-text">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Compare() {
  // Datos cargados una vez
  const [allStations, setAllStations] = useState([])

  // ── Sección 1: comparación por localidades ──
  const [localityMetric,   setLocalityMetric]   = useState('leq_hour')
  const [localityRange,    setLocalityRange]    = useState({
    from: subHours(new Date(), 24).toISOString(),
    to:   new Date().toISOString(),
  })
  const [localitySeries,   setLocalitySeries]   = useState([])
  const [loadingLocality,  setLoadingLocality]  = useState(true)
  const [selectedLocalities, setSelectedLocalities] = useState(new Set()) // vacío = todas

  // ── Sección 2: comparación por estaciones ──
  const [stationMetric,    setStationMetric]    = useState('leq_hour')
  const [stationRange,     setStationRange]     = useState({
    from: subHours(new Date(), 24).toISOString(),
    to:   new Date().toISOString(),
  })
  const [stationSeries,    setStationSeries]    = useState([])
  const [loadingStation,   setLoadingStation]   = useState(true)
  const [selectedStations, setSelectedStations] = useState(new Set()) // vacío = todas

  // ── Derivados ──
  const localities = useMemo(() => {
    const map = new Map()
    allStations.forEach(s => {
      if (!map.has(s.locality)) map.set(s.locality, { locality: s.locality, codes: [] })
      map.get(s.locality).codes.push(s.station_code)
    })
    return [...map.values()]
  }, [allStations])

  // ── Cargar estaciones una sola vez ──
  useEffect(() => {
    getStations()
      .then(r => {
        setAllStations(r.data)
        // Por defecto: todas seleccionadas
        setSelectedLocalities(new Set(r.data.map(s => s.locality)))
        setSelectedStations(new Set(r.data.map(s => s.station_code)))
      })
      .catch(() => {})
  }, [])

  // ── Fetch sección 1: localidades ──
  useEffect(() => {
    if (allStations.length === 0) return
    setLoadingLocality(true)

    // Si están todas las localidades, no mandamos filtro de estaciones
    const allLocCodes = localities.flatMap(l => l.codes)
    const filtered = selectedLocalities.size === localities.length
      ? allLocCodes
      : localities
          .filter(l => selectedLocalities.has(l.locality))
          .flatMap(l => l.codes)

    const stationsParam = filtered.length > 0 ? filtered.join(',') : null

    getCompare({
      metric: localityMetric,
      from:   localityRange.from,
      to:     localityRange.to,
      ...(stationsParam ? { stations: stationsParam } : {}),
    })
      .then(r => setLocalitySeries(r.data.series))
      .catch(() => {})
      .finally(() => setLoadingLocality(false))
  }, [localityMetric, localityRange, selectedLocalities, allStations])

  // ── Fetch sección 2: estaciones ──
  useEffect(() => {
    if (allStations.length === 0) return
    setLoadingStation(true)

    const filtered = selectedStations.size === allStations.length
      ? null
      : [...selectedStations].join(',')

    getCompare({
      metric: stationMetric,
      from:   stationRange.from,
      to:     stationRange.to,
      ...(filtered ? { stations: filtered } : {}),
    })
      .then(r => setStationSeries(r.data.series))
      .catch(() => {})
      .finally(() => setLoadingStation(false))
  }, [stationMetric, stationRange, selectedStations, allStations])

  // ── Helpers tags localidades ──
  const toggleLocality = (loc) => {
    setSelectedLocalities(prev => {
      const next = new Set(prev)
      next.has(loc) ? next.delete(loc) : next.add(loc)
      return next
    })
  }
  const selectAllLocalities = () => setSelectedLocalities(new Set(localities.map(l => l.locality)))
  const clearAllLocalities  = () => setSelectedLocalities(new Set())

  // ── Helpers tags estaciones ──
  const toggleStation = (code) => {
    setSelectedStations(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }
  const selectAllStations = () => setSelectedStations(new Set(allStations.map(s => s.station_code)))
  const clearAllStations  = () => setSelectedStations(new Set())

  return (
    <div className="space-y-6">

      {/* ── Título de página ── */}
      <div>
        <h1 className="text-xl font-display font-bold text-text">Comparación entre estaciones</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Análisis comparativo por localidad y por estación individual
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECCIÓN 1 — Comparación por localidades
      ══════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Comparación por localidad"
        subtitle="Agrega las estaciones de cada localidad y compara su evolución en el tiempo"
      >
        {/* Controles */}
        <div className="flex flex-wrap items-end gap-4">
          <DateRangePicker onChange={setLocalityRange} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-display font-medium text-text-muted">Métrica</label>
            <select
              value={localityMetric}
              onChange={e => setLocalityMetric(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg
                         focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {COMPARE_METRICS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Selector de localidades */}
        {localities.length > 0 && (
          <div className="border border-border rounded-md p-3 bg-surface">
            <p className="text-xs font-display font-semibold text-text-muted mb-2 uppercase tracking-wide">
              Localidades
            </p>
            <TagSelector
              items={localities}
              selected={selectedLocalities}
              onToggle={toggleLocality}
              onSelectAll={selectAllLocalities}
              onClearAll={clearAllLocalities}
              getKey={l => l.locality}
              getLabel={l => l.locality}
              getSubLabel={l => `${l.codes.length} estación${l.codes.length !== 1 ? 'es' : ''}`}
            />
          </div>
        )}

        {/* Gráfica */}
        <div>
          <div className="mb-3 flex items-center">
            <h3 className="text-sm font-display font-semibold text-text">
              {COMPARE_METRICS.find(m => m.value === localityMetric)?.label}
            </h3>
            <ChartInfo text={getMetricDescription(localityMetric)} />
          </div>
          {loadingLocality
            ? <LoadingSpinner />
            : localitySeries.length === 0
              ? <p className="text-sm text-text-muted py-8 text-center">Sin datos para el rango y localidades seleccionadas</p>
              : <CompareChart series={localitySeries} metricLabel={COMPARE_METRICS.find(m => m.value === localityMetric)?.label} />
          }
        </div>

        {/* Tarjetas resumen */}
        {!loadingLocality && localitySeries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {localitySeries.map(s => (
              <div key={s.station_code} className="bg-bg border border-border rounded-lg p-3">
                <p className="text-xs font-mono text-text-muted">{s.station_code}</p>
                <p className="text-sm font-display font-semibold text-text">{s.locality}</p>
                <p className="text-xs text-text-light">{s.data.length} puntos</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════
          SECCIÓN 2 — Comparación por estación individual
      ══════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Comparación por estación"
        subtitle="Selecciona estaciones específicas para comparar su comportamiento en detalle"
      >
        {/* Controles */}
        <div className="flex flex-wrap items-end gap-4">
          <DateRangePicker onChange={setStationRange} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-display font-medium text-text-muted">Métrica</label>
            <select
              value={stationMetric}
              onChange={e => setStationMetric(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg
                         focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {COMPARE_METRICS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Selector de estaciones (tags con scroll) */}
        {allStations.length > 0 && (
          <div className="border border-border rounded-md p-3 bg-surface">
            <p className="text-xs font-display font-semibold text-text-muted mb-2 uppercase tracking-wide">
              Estaciones
            </p>
            <TagSelector
              items={allStations}
              selected={selectedStations}
              onToggle={toggleStation}
              onSelectAll={selectAllStations}
              onClearAll={clearAllStations}
              getKey={s => s.station_code}
              getLabel={s => s.name ?? s.station_code}
              getSubLabel={s => s.locality}
            />
          </div>
        )}

        {/* Gráfica */}
        <div>
          <div className="mb-3 flex items-center">
            <h3 className="text-sm font-display font-semibold text-text">
              {COMPARE_METRICS.find(m => m.value === stationMetric)?.label}
            </h3>
            <ChartInfo text={getMetricDescription(stationMetric)} />
          </div>
          {loadingStation
            ? <LoadingSpinner />
            : stationSeries.length === 0
              ? <p className="text-sm text-text-muted py-8 text-center">Sin datos para el rango y estaciones seleccionadas</p>
              : <CompareChart series={stationSeries} metricLabel={COMPARE_METRICS.find(m => m.value === stationMetric)?.label} />
          }
        </div>

        {/* Tarjetas resumen */}
        {!loadingStation && stationSeries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {stationSeries.map(s => (
              <div key={s.station_code} className="bg-bg border border-border rounded-lg p-3">
                <p className="text-xs font-mono text-text-muted">{s.station_code}</p>
                <p className="text-sm font-display font-semibold text-text">{s.locality}</p>
                <p className="text-xs text-text-light">{s.data.length} puntos</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

    </div>
  )
}
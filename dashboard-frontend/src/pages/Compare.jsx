import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { subHours }       from 'date-fns'
import { getCompare }      from '../api/compare'
import { getStations }     from '../api/stations'
import { getMeasurements } from '../api/measurements'
import CompareChart       from '../components/charts/CompareChart'
import DateRangePicker    from '../components/shared/DateRangePicker'
import LoadingSpinner     from '../components/shared/LoadingSpinner'
import ChartInfo          from '../components/shared/ChartInfo'
import ChartDownloadMenu  from '../components/shared/ChartDownloadMenu'
import { getMetricDescription } from '../components/shared/metricDescriptions'
import { useChartDownload } from '../hooks/useChartDownload'

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

// ─── Métricas crudas disponibles en /measurements (sección 2) ────────────────
const RAW_METRICS = [
  { value: 'leq_dbfs',               label: 'Leq (ponderación A)' },
  { value: 'dbfs_level',             label: 'Nivel dBFS' },
  { value: 'rms_energy',             label: 'Energía RMS' },
  { value: 'ild_db',                 label: 'ILD (diferencia interaural)' },
  { value: 'interaural_correlation', label: 'Correlación interaural' },
  { value: 'dominant_frequency',     label: 'Frecuencia dominante (Hz)' },
  { value: 'spectral_centroid',      label: 'Centroide espectral (Hz)' },
  { value: 'spectral_rolloff',       label: 'Rolloff espectral (Hz)' },
  { value: 'zero_crossing_rate',     label: 'Tasa de cruces por cero' },
  { value: 'ch_left_dbfs',           label: 'Canal izquierdo (dBFS)' },
  { value: 'ch_right_dbfs',          label: 'Canal derecho (dBFS)' },
]

// ─── Subcomponente: selector de tags con scroll ───────────────────────────────
function TagSelector({ items, selected, onToggle, onSelectAll, onClearAll, getKey, getLabel, getSubLabel }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button onClick={onSelectAll} className="text-xs font-display font-medium text-primary hover:text-primary-dark transition-colors">Todas</button>
        <span className="text-text-light text-xs">·</span>
        <button onClick={onClearAll} className="text-xs font-display font-medium text-text-muted hover:text-text transition-colors">Ninguna</button>
        <span className="text-xs text-text-light ml-auto">{selected.size} / {items.length} seleccionadas</span>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 scrollbar-thin">
        {items.map(item => {
          const key = getKey(item)
          const active = selected.has(key)
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`inline-flex flex-col items-start px-2.5 py-1 rounded-md border text-left transition-all duration-150 leading-tight ${
                active
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-bg text-text-muted border-border hover:border-primary-light hover:text-text'
              }`}
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

// ─── SectionCard con soporte de descarga ──────────────────────────────────────
function SectionCard({ title, subtitle, downloadData, children }) {
  const cardRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const { downloadPNG, downloadSVG, downloadCSV } = useChartDownload(cardRef, title, downloadData)

  const handlePNG = useCallback(async () => {
    setDownloading(true)
    await downloadPNG()
    setDownloading(false)
  }, [downloadPNG])

  return (
    <div ref={cardRef} className="bg-bg border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-display font-bold text-text">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        <ChartDownloadMenu
          onPNG={handlePNG}
          onSVG={downloadSVG}
          onCSV={downloadData?.length ? downloadCSV : undefined}
          downloading={downloading}
        />
      </div>
      {children}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Compare() {
  const [allStations, setAllStations] = useState([])

  // ── Sección 1: comparación por localidades ──
  const [localityMetric,     setLocalityMetric]     = useState('leq_hour')
  const [localityRange,      setLocalityRange]      = useState({ from: subHours(new Date(), 24).toISOString(), to: new Date().toISOString() })
  const [localitySeries,     setLocalitySeries]     = useState([])
  const [loadingLocality,    setLoadingLocality]    = useState(true)
  const [selectedLocalities, setSelectedLocalities] = useState(new Set())

  // ── Sección 2: comparación por estaciones ──
  const [stationMetric,    setStationMetric]    = useState('leq_dbfs')
  const [stationRange,     setStationRange]     = useState({ from: subHours(new Date(), 24).toISOString(), to: new Date().toISOString() })
  const [stationSeries,    setStationSeries]    = useState([])
  const [loadingStation,   setLoadingStation]   = useState(true)
  const [selectedStations, setSelectedStations] = useState(new Set())

  // ── Derivados ──
  const localities = useMemo(() => {
    const map = new Map()
    allStations.forEach(s => {
      if (!map.has(s.locality)) map.set(s.locality, { locality: s.locality, codes: [] })
      map.get(s.locality).codes.push(s.station_code)
    })
    return [...map.values()]
  }, [allStations])

  // ── CSV aplanado para series (pivot inverso) ──────────────────────────────
  // Genera filas { timestamp, station_code, locality, value } para exportar
  const localityCSV = useMemo(() =>
    localitySeries.flatMap(s =>
      s.data.map(pt => ({ timestamp: pt.hour_start, station_code: s.station_code, locality: s.locality, [localityMetric]: pt.value }))
    ), [localitySeries, localityMetric])

  const stationCSV = useMemo(() =>
    stationSeries.flatMap(s =>
      s.data.map(pt => ({ timestamp: pt.hour_start, station_code: s.station_code, locality: s.locality, [stationMetric]: pt.value }))
    ), [stationSeries, stationMetric])

  // ── Cargar estaciones ──
  useEffect(() => {
    getStations()
      .then(r => {
        setAllStations(r.data)
        setSelectedLocalities(new Set(r.data.map(s => s.locality)))
        setSelectedStations(new Set(r.data.map(s => s.station_code)))
      })
      .catch(() => {})
  }, [])

  // ── Fetch sección 1: localidades ──
  useEffect(() => {
    if (allStations.length === 0) return
    setLoadingLocality(true)
    const allLocCodes = localities.flatMap(l => l.codes)
    const filtered = selectedLocalities.size === localities.length
      ? allLocCodes
      : localities.filter(l => selectedLocalities.has(l.locality)).flatMap(l => l.codes)
    const stationsParam = filtered.length > 0 ? filtered.join(',') : null
    getCompare({ metric: localityMetric, from: localityRange.from, to: localityRange.to, ...(stationsParam ? { stations: stationsParam } : {}) })
      .then(r => setLocalitySeries(r.data.series))
      .catch(() => {})
      .finally(() => setLoadingLocality(false))
  }, [localityMetric, localityRange, selectedLocalities, allStations])

  // ── Fetch sección 2: mediciones crudas por estación en paralelo ──
  useEffect(() => {
    if (allStations.length === 0) return
    setLoadingStation(true)
    const targetStations = allStations.filter(s => selectedStations.has(s.station_code))
    if (targetStations.length === 0) { setStationSeries([]); setLoadingStation(false); return }
    const params = { from: stationRange.from, to: stationRange.to, metric: stationMetric }
    Promise.all(
      targetStations.map(s =>
        getMeasurements(s.station_code, params)
          .then(r => ({ station_code: s.station_code, locality: s.locality, data: (r.data.data ?? []).map(d => ({ hour_start: d.recorded_at, value: d.value })) }))
          .catch(() => ({ station_code: s.station_code, locality: s.locality, data: [] }))
      )
    )
      .then(results => setStationSeries(results.filter(r => r.data.length > 0)))
      .finally(() => setLoadingStation(false))
  }, [stationMetric, stationRange, selectedStations, allStations])

  // ── Helpers tags ──
  const toggleLocality   = loc  => setSelectedLocalities(prev => { const n = new Set(prev); n.has(loc)  ? n.delete(loc)  : n.add(loc);  return n })
  const selectAllLocalities = () => setSelectedLocalities(new Set(localities.map(l => l.locality)))
  const clearAllLocalities  = () => setSelectedLocalities(new Set())
  const toggleStation    = code => setSelectedStations(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
  const selectAllStations   = () => setSelectedStations(new Set(allStations.map(s => s.station_code)))
  const clearAllStations    = () => setSelectedStations(new Set())

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-display font-bold text-text">Comparación entre estaciones</h1>
        <p className="text-sm text-text-muted mt-0.5">Análisis comparativo por localidad y por estación individual</p>
      </div>

      {/* ══ SECCIÓN 1 — Localidades ══ */}
      <SectionCard
        title={`Comparación por localidad — ${localityMetric}`}
        subtitle="Agrega las estaciones de cada localidad y compara su evolución en el tiempo"
        downloadData={localityCSV}
      >
        <div className="flex flex-wrap items-end gap-4">
          <DateRangePicker onChange={setLocalityRange} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-display font-medium text-text-muted">Métrica</label>
            <select value={localityMetric} onChange={e => setLocalityMetric(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg focus:outline-none focus:ring-2 focus:ring-primary">
              {COMPARE_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {localities.length > 0 && (
          <div className="border border-border rounded-md p-3 bg-surface">
            <p className="text-xs font-display font-semibold text-text-muted mb-2 uppercase tracking-wide">Localidades</p>
            <TagSelector
              items={localities} selected={selectedLocalities}
              onToggle={toggleLocality} onSelectAll={selectAllLocalities} onClearAll={clearAllLocalities}
              getKey={l => l.locality} getLabel={l => l.locality}
              getSubLabel={l => `${l.codes.length} estación${l.codes.length !== 1 ? 'es' : ''}`}
            />
          </div>
        )}

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

      {/* ══ SECCIÓN 2 — Estaciones individuales ══ */}
      <SectionCard
        title={`Comparación por estación — ${stationMetric}`}
        subtitle="Selecciona estaciones específicas para comparar su comportamiento en detalle"
        downloadData={stationCSV}
      >
        <div className="flex flex-wrap items-end gap-4">
          <DateRangePicker onChange={setStationRange} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-display font-medium text-text-muted">Métrica</label>
            <select value={stationMetric} onChange={e => setStationMetric(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg focus:outline-none focus:ring-2 focus:ring-primary">
              {RAW_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {allStations.length > 0 && (
          <div className="border border-border rounded-md p-3 bg-surface">
            <p className="text-xs font-display font-semibold text-text-muted mb-2 uppercase tracking-wide">Estaciones</p>
            <TagSelector
              items={allStations} selected={selectedStations}
              onToggle={toggleStation} onSelectAll={selectAllStations} onClearAll={clearAllStations}
              getKey={s => s.station_code} getLabel={s => s.name ?? s.station_code}
              getSubLabel={s => s.locality}
            />
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center">
            <h3 className="text-sm font-display font-semibold text-text">
              {RAW_METRICS.find(m => m.value === stationMetric)?.label}
            </h3>
            <ChartInfo text={getMetricDescription(stationMetric)} />
          </div>
          {loadingStation
            ? <LoadingSpinner />
            : stationSeries.length === 0
              ? <p className="text-sm text-text-muted py-8 text-center">Sin datos para el rango y estaciones seleccionadas</p>
              : <CompareChart series={stationSeries} metricLabel={RAW_METRICS.find(m => m.value === stationMetric)?.label} />
          }
        </div>

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
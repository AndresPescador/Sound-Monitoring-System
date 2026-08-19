import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { subHours } from 'date-fns'
import { getStationSummary } from '../../api/stations'
import { getMeasurements, getBinaural, getSpectral } from '../../api/measurements'
import { getHourly, getDailyProfile } from '../../api/aggregations'
import { useMap3DContext } from '../../context/Map3DContext'
import { ROUTES } from '../../routes'
import DateRangePicker from '../shared/DateRangePicker'
import MetricSelector from '../shared/MetricSelector'
import ChartInfo from '../shared/ChartInfo'
import ChartDownloadMenu from '../shared/ChartDownloadMenu'
import ChartAxisModeControl from '../shared/ChartAxisModeControl'
import ChartSkeleton from '../shared/ChartSkeleton'
import ResolutionNotice from '../shared/ResolutionNotice'
import LevelBandChart from '../charts/LevelBandChart'
import TimeSeriesChart from '../charts/TimeSeriesChart'
import DailyBarChart from '../charts/DailyBarChart'
import ILDChart from '../charts/ILDChart'
import { AUTO_FOCUS_THRESHOLD, getCoverageRatio } from '../charts/timeAxis'
import { getMetricDescription } from '../shared/metricDescriptions'
import { useChartDownload } from '../../hooks/useChartDownload'

const DETAIL_CACHE_LIMIT = 20
const detailCache = new Map()
const METRIC_LABELS = {
  leq_dbfs: 'Leq (ponderación A)',
  dbfs_level: 'Nivel dBFS',
  rms_energy: 'Energía RMS',
  ild_db: 'ILD (diferencia interaural)',
  interaural_correlation: 'Correlación interaural',
  dominant_frequency: 'Frecuencia dominante',
  spectral_centroid: 'Centroide espectral',
  spectral_rolloff: 'Rolloff espectral',
  zero_crossing_rate: 'Tasa de cruces por cero',
}

function cacheGet(key) { return detailCache.get(key) }
function cacheSet(key, value) {
  detailCache.delete(key)
  detailCache.set(key, value)
  while (detailCache.size > DETAIL_CACHE_LIMIT) detailCache.delete(detailCache.keys().next().value)
}

function cacheKey(type, code, from, to, metric = '') { return [type, code, from, to, metric].join('|') }

function bogotaDate(iso) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return String(iso).slice(0, 10)
  }
}

function relativeTime(value) {
  if (!value) return 'sin comunicación registrada'
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000)
  try { return new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(minutes, 'minute') } catch { return 'fecha no disponible' }
}

function formatValue(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : 'Sin dato'
}

function Map3DChartSection({ title, info, data, fileLabel, svgTitle, stationCode, children }) {
  const cardRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const { downloadPNG, downloadSVG, downloadCSV } = useChartDownload(cardRef, title, data, fileLabel, svgTitle, stationCode)
  const handlePNG = useCallback(async () => {
    setDownloading(true)
    await downloadPNG()
    setDownloading(false)
  }, [downloadPNG])

  return (
    <section ref={cardRef} className="map3d-chart-card">
      <div className="map3d-chart-card__heading">
        <h3>{title}{info && <ChartInfo text={info} />}</h3>
        <ChartDownloadMenu onPNG={handlePNG} onSVG={downloadSVG} onCSV={data?.length ? downloadCSV : undefined} downloading={downloading} />
      </div>
      {children}
    </section>
  )
}

function DetailLoading({ label }) {
  return <ChartSkeleton height={220} showLegend={false} label={label} />
}

export default function Map3DStationDetail() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { stations, selectedStation, selectedStationCode, selectedSummary: contextSummary, summaryError, loadingStations, focusStation } = useMap3DContext()
  const [summary, setSummary] = useState(contextSummary)
  const [summaryLoading, setSummaryLoading] = useState(!contextSummary)
  const [activeTab, setActiveTab] = useState('summary')
  const [range, setRange] = useState({ from: subHours(new Date(), 24).toISOString(), to: new Date().toISOString() })
  const [profileDate, setProfileDate] = useState(() => bogotaDate(new Date().toISOString()))
  const [metric, setMetric] = useState('leq_dbfs')
  const [axisMode, setAxisMode] = useState('auto')
  const [levelState, setLevelState] = useState({ hourly: [], daily: [], timeseries: [], timeseriesMeta: null, loading: false, error: null })
  const [binauralState, setBinauralState] = useState({ data: [], meta: null, loading: false, error: null })
  const [spectralState, setSpectralState] = useState({ data: [], meta: null, loading: false, error: null })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    focusStation(code)
    setActiveTab('summary')
  }, [code, focusStation])

  useEffect(() => {
    if (contextSummary && selectedStationCode === code) {
      setSummary(contextSummary)
      setSummaryLoading(false)
    }
  }, [code, contextSummary, selectedStationCode])

  useEffect(() => {
    if (contextSummary || !code) return undefined
    const cached = cacheGet(cacheKey('summary', code, '', ''))
    if (cached) {
      setSummary(cached)
      setSummaryLoading(false)
      return undefined
    }
    const controller = new AbortController()
    setSummaryLoading(true)
    getStationSummary(code, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        cacheSet(cacheKey('summary', code, '', ''), response.data)
        setSummary(response.data)
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setSummaryLoading(false) })
    return () => controller.abort()
  }, [code, contextSummary])

  useEffect(() => setProfileDate(bogotaDate(range.to)), [range.to])
  useEffect(() => setAxisMode('auto'), [range.from, range.to])

  useEffect(() => {
    if (activeTab !== 'level') return undefined
    const keyBase = [code, range.from, range.to, metric].join('|')
    const cached = cacheGet(cacheKey('level', keyBase, '', ''))
    if (cached) {
      setLevelState({ ...cached, loading: false, error: null })
      return undefined
    }
    const controller = new AbortController()
    setLevelState(current => ({ ...current, loading: true, error: null }))
    Promise.all([
      getHourly(code, { from: range.from, to: range.to }, { signal: controller.signal }),
      getDailyProfile(code, { date: profileDate }, { signal: controller.signal }),
      getMeasurements(code, { from: range.from, to: range.to, metric }, { signal: controller.signal }),
    ])
      .then(([hourlyResponse, dailyResponse, metricResponse]) => {
        if (controller.signal.aborted) return
        const next = {
          hourly: hourlyResponse.data.data ?? [],
          daily: dailyResponse.data.data ?? [],
          timeseries: metricResponse.data.data ?? [],
          timeseriesMeta: metricResponse.data,
        }
        cacheSet(cacheKey('level', keyBase, '', ''), next)
        setLevelState({ ...next, loading: false, error: null })
      })
      .catch(error => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return
        setLevelState(current => ({ ...current, loading: false, error: 'No fue posible cargar el nivel para este rango.' }))
      })
    return () => controller.abort()
  }, [activeTab, code, metric, profileDate, range.from, range.to, retryKey])

  useEffect(() => {
    if (activeTab !== 'binaural') return undefined
    const key = cacheKey('binaural', code, range.from, range.to)
    const cached = cacheGet(key)
    if (cached) {
      setBinauralState({ ...cached, loading: false, error: null })
      return undefined
    }
    const controller = new AbortController()
    setBinauralState(current => ({ ...current, loading: true, error: null }))
    getBinaural(code, { from: range.from, to: range.to }, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        const next = { data: response.data.data ?? [], meta: response.data }
        cacheSet(key, next)
        setBinauralState({ ...next, loading: false, error: null })
      })
      .catch(error => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return
        setBinauralState(current => ({ ...current, loading: false, error: 'No fue posible cargar las métricas binaurales.' }))
      })
    return () => controller.abort()
  }, [activeTab, code, range.from, range.to, retryKey])

  useEffect(() => {
    if (activeTab !== 'spectral') return undefined
    const key = cacheKey('spectral', code, range.from, range.to)
    const cached = cacheGet(key)
    if (cached) {
      setSpectralState({ ...cached, loading: false, error: null })
      return undefined
    }
    const controller = new AbortController()
    setSpectralState(current => ({ ...current, loading: true, error: null }))
    getSpectral(code, { from: range.from, to: range.to }, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        const next = { data: response.data.data ?? [], meta: response.data }
        cacheSet(key, next)
        setSpectralState({ ...next, loading: false, error: null })
      })
      .catch(error => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return
        setSpectralState(current => ({ ...current, loading: false, error: 'No fue posible cargar las métricas espectrales.' }))
      })
    return () => controller.abort()
  }, [activeTab, code, range.from, range.to, retryKey])

  const coverageRatio = getCoverageRatio([
    { data: levelState.hourly, timeKey: 'hour_start', valueKeys: ['leq_hour', 'l10', 'l50', 'l90'] },
    { data: levelState.timeseries, timeKey: 'recorded_at', valueKeys: ['value'] },
    { data: binauralState.data, timeKey: 'recorded_at', valueKeys: ['ild_db', 'interaural_correlation'] },
    { data: spectralState.data, timeKey: 'recorded_at', valueKeys: ['dominant_frequency', 'spectral_centroid', 'spectral_rolloff', 'zero_crossing_rate'] },
  ], range)
  const automaticAxisMode = coverageRatio !== null && coverageRatio < AUTO_FOCUS_THRESHOLD ? 'data' : 'range'
  const activeAxisMode = axisMode === 'auto' ? automaticAxisMode : axisMode
  const station = selectedStation ?? stations.find(item => item.station_code === code)
  const hasStation = Boolean(station || summary)

  if (!loadingStations && !hasStation && (summaryError || !summaryLoading)) {
    return (
      <div className="map3d-error-panel" role="alert">
        <h2>Estación no encontrada</h2>
        <p>El código <span className="map3d-code">{code}</span> no corresponde a una estación disponible.</p>
        <button type="button" className="map3d-primary-button" onClick={() => navigate(ROUTES.map3D)}>Volver a explorar</button>
      </div>
    )
  }

  const tabs = [
    { id: 'summary', label: 'Resumen' },
    { id: 'level', label: 'Nivel' },
    { id: 'binaural', label: 'Binaural' },
    { id: 'spectral', label: 'Espectro' },
  ]

  const handleTabKeyDown = (event, index) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]
    setActiveTab(nextTab.id)
    window.requestAnimationFrame(() => document.getElementById(`map3d-tab-${nextTab.id}`)?.focus())
  }

  return (
    <div className="map3d-station-detail">
      <div className="map3d-station-detail__toolbar">
        <div>
          <p className="map3d-overline">{station?.locality ?? 'Cargando localidad'}</p>
          <h2>{summary?.name ?? station?.name ?? code}</h2>
          <p className="map3d-muted">{station?.address ?? summary?.address ?? 'Dirección no registrada'} · <span className="map3d-code">{code}</span></p>
        </div>
        <span className={`map3d-status ${summary?.is_active ?? station?.is_active ? 'is-active' : 'is-inactive'}`}>
          {summary?.is_active ?? station?.is_active ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      <div className="map3d-tabs" role="tablist" aria-label="Análisis de estación">
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`map3d-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`map3d-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={event => handleTabKeyDown(event, tabs.indexOf(tab))}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`map3d-panel-${activeTab}`} role="tabpanel" aria-labelledby={`map3d-tab-${activeTab}`} className="map3d-tab-panel">
        {activeTab === 'summary' && <SummaryPanel summary={summary} station={station} loading={summaryLoading} />}
        {activeTab === 'level' && (
          <LevelPanel
            code={code}
            profileDate={profileDate}
            range={range}
            metric={metric}
            state={levelState}
            axisMode={activeAxisMode}
            automaticAxisMode={automaticAxisMode}
            axisIsAutomatic={axisMode === 'auto'}
            onRangeChange={setRange}
            onProfileDateChange={setProfileDate}
            onMetricChange={setMetric}
            onAxisModeChange={setAxisMode}
            onRetry={() => setRetryKey(value => value + 1)}
          />
        )}
        {activeTab === 'binaural' && <BinauralPanel code={code} state={binauralState} axisMode={activeAxisMode} onRetry={() => setRetryKey(value => value + 1)} />}
        {activeTab === 'spectral' && <SpectralPanel code={code} state={spectralState} axisMode={activeAxisMode} onRetry={() => setRetryKey(value => value + 1)} />}
      </div>
    </div>
  )
}

function SummaryPanel({ summary, station, loading }) {
  const metrics = [
    ['Último Leq', formatValue(summary?.latest_leq_dbfs ?? station?.current_leq_dbfs), 'dBFS'],
    ['Total de mediciones', summary?.total_measurements?.toLocaleString('es-CO') ?? 'Sin dato', 'registros'],
    ['Última hora', formatValue(summary?.last_hour_leq), 'Leq dBFS'],
    ['L10 / L50 / L90', `${formatValue(summary?.last_hour_l10)} / ${formatValue(summary?.last_hour_l50)} / ${formatValue(summary?.last_hour_l90)}`, 'dBFS'],
  ]
  if (loading) return <DetailLoading label="Cargando resumen de estación…" />
  return (
    <div className="map3d-summary-panel">
      <div className="map3d-summary-grid map3d-summary-grid--station">
        {metrics.map(([label, value, detail]) => <div className="map3d-summary-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}
      </div>
      <dl className="map3d-detail-list">
        <div><dt>Localidad</dt><dd>{summary?.locality ?? station?.locality ?? 'Sin dato'}</dd></div>
        <div><dt>Dirección</dt><dd>{summary?.address ?? station?.address ?? 'Dirección no registrada'}</dd></div>
        <div><dt>Última comunicación</dt><dd>{relativeTime(summary?.last_seen_at ?? station?.last_seen_at)}</dd></div>
      </dl>
      <p className="map3d-panel-note">El resumen se actualiza con el snapshot de estaciones. Abre Nivel, Binaural o Espectro cuando necesites una serie detallada.</p>
    </div>
  )
}

function DetailControls({ range, profileDate, metric, onRangeChange, onProfileDateChange, onMetricChange, onAxisModeChange, axisMode, automaticAxisMode, axisIsAutomatic }) {
  return (
    <>
      <div className="map3d-control-grid">
        <div className="map3d-field"><label>Rango temporal</label><DateRangePicker onChange={onRangeChange} /></div>
        <div className="map3d-field"><label htmlFor="map3d-metric">Métrica</label><MetricSelector id="map3d-metric" value={metric} onChange={onMetricChange} className="dashboard-select" /></div>
        <div className="map3d-field"><label htmlFor="map3d-profile-date">Día del perfil (hora Bogotá)</label><input id="map3d-profile-date" type="date" value={profileDate} onChange={event => onProfileDateChange(event.target.value)} className="dashboard-input" /></div>
      </div>
      <ChartAxisModeControl mode={axisMode} automaticMode={automaticAxisMode} isAutomatic={axisIsAutomatic} onChange={onAxisModeChange} range={range} />
    </>
  )
}

function LevelPanel({ code, range, profileDate, metric, state, axisMode, automaticAxisMode, axisIsAutomatic, onRangeChange, onProfileDateChange, onMetricChange, onAxisModeChange, onRetry }) {
  if (state.error) return <ErrorPanel message={state.error} onRetry={onRetry} />
  const seriesData = state.timeseries.map(item => ({ timestamp: item.recorded_at, [metric]: item.value }))
  return (
    <div className="map3d-detail-content">
      <DetailControls range={range} profileDate={profileDate} metric={metric} onRangeChange={onRangeChange} onProfileDateChange={onProfileDateChange} onMetricChange={onMetricChange} onAxisModeChange={onAxisModeChange} axisMode={axisMode} automaticAxisMode={automaticAxisMode} axisIsAutomatic={axisIsAutomatic} />
      {state.loading ? <DetailLoading label="Cargando niveles, perfil y serie temporal…" /> : (
        <div className="map3d-chart-stack">
          <Map3DChartSection title="Niveles horarios: Leq / L10 / L90" info="L90 representa el ruido de fondo; Leq el nivel equivalente y L10 los picos ocasionales." data={state.hourly} stationCode={code}>
            <LevelBandChart data={state.hourly} axisMode={axisMode} />
            <p className="map3d-chart-note">L90 = fondo · Leq = nivel equivalente · L10 = picos</p>
          </Map3DChartSection>
          <Map3DChartSection title={`Perfil diario: ${profileDate}`} info="Nivel equivalente promedio para cada hora del día." data={state.daily} stationCode={code}>
            <DailyBarChart data={state.daily} />
            <p className="map3d-chart-note">Leq por hora del día · el color indica nivel acústico</p>
          </Map3DChartSection>
          <Map3DChartSection title={`Serie temporal · ${METRIC_LABELS[metric] ?? metric}`} info={getMetricDescription(metric)} data={seriesData} fileLabel={metric} svgTitle={METRIC_LABELS[metric] ?? metric} stationCode={code}>
            <TimeSeriesChart data={state.timeseries} metricLabel={metric} unit="dBFS" axisMode={axisMode} />
            <ResolutionNotice meta={state.timeseriesMeta} />
          </Map3DChartSection>
        </div>
      )}
    </div>
  )
}

function BinauralPanel({ code, state, axisMode, onRetry }) {
  if (state.error) return <ErrorPanel message={state.error} onRetry={onRetry} />
  if (state.loading) return <DetailLoading label="Cargando métricas binaurales…" />
  if (!state.data.length) return <EmptyPanel title="Sin datos binaurales" message="No hay ILD ni correlación interaural para el rango seleccionado." />
  const channelData = state.data.some(item => item.ch_left_dbfs != null || item.ch_right_dbfs != null)
  return (
    <div className="map3d-detail-content">
      <ResolutionNotice meta={state.meta} />
      <div className="map3d-chart-grid">
        <Map3DChartSection title="ILD: diferencia interaural" info={getMetricDescription('ild_db')} data={state.data.map(item => ({ timestamp: item.recorded_at, ild_db: item.ild_db }))} fileLabel="ild_db" stationCode={code}>
          <ILDChart data={state.data} axisMode={axisMode} />
          <p className="map3d-chart-note">El signo indica predominio relativo entre los canales.</p>
        </Map3DChartSection>
        <Map3DChartSection title="Correlación interaural" info={getMetricDescription('interaural_correlation')} data={state.data.map(item => ({ timestamp: item.recorded_at, interaural_correlation: item.interaural_correlation }))} fileLabel="correlacion" stationCode={code}>
          <TimeSeriesChart data={state.data.map(item => ({ recorded_at: item.recorded_at, value: item.interaural_correlation, value_min: item.interaural_correlation_min, value_max: item.interaural_correlation_max, source_count: item.source_count }))} metricLabel="Correlación" axisMode={axisMode} />
        </Map3DChartSection>
        {channelData && <Map3DChartSection title="Canales izquierdo y derecho" data={state.data} fileLabel="canales" stationCode={code}>
          <TimeSeriesChart data={state.data} unit="dBFS" axisMode={axisMode} series={[{ dataKey: 'ch_left_dbfs', label: 'Canal L', color: '#1d4ed8' }, { dataKey: 'ch_right_dbfs', label: 'Canal R', color: '#52637c' }]} />
        </Map3DChartSection>}
      </div>
    </div>
  )
}

function SpectralPanel({ code, state, axisMode, onRetry }) {
  if (state.error) return <ErrorPanel message={state.error} onRetry={onRetry} />
  if (state.loading) return <DetailLoading label="Cargando métricas espectrales…" />
  if (!state.data.length) return <EmptyPanel title="Sin datos espectrales" message="No hay frecuencia dominante, centroide ni rolloff para el rango seleccionado." />
  const series = [
    ['spectral_centroid', 'Centroide espectral', 'Hz'],
    ['dominant_frequency', 'Frecuencia dominante', 'Hz'],
    ['spectral_rolloff', 'Rolloff espectral', 'Hz'],
    ['zero_crossing_rate', 'Tasa de cruces por cero', ''],
  ]
  return (
    <div className="map3d-detail-content">
      <ResolutionNotice meta={state.meta} />
      <div className="map3d-chart-grid">
        {series.map(([key, label, unit]) => (
          <Map3DChartSection key={key} title={label} info={getMetricDescription(key)} data={state.data.map(item => ({ timestamp: item.recorded_at, [key]: item[key] }))} fileLabel={key} stationCode={code}>
            <TimeSeriesChart data={state.data.map(item => ({ recorded_at: item.recorded_at, value: item[key], value_min: item[`${key}_min`], value_max: item[`${key}_max`], source_count: item.source_count }))} metricLabel={label} unit={unit} axisMode={axisMode} />
          </Map3DChartSection>
        ))}
      </div>
    </div>
  )
}

function ErrorPanel({ message, onRetry }) {
  return <div className="map3d-inline-error" role="alert"><strong>No se pudo cargar este análisis.</strong><p>{message}</p><button type="button" className="map3d-secondary-button" onClick={onRetry}>Reintentar</button></div>
}

function EmptyPanel({ title, message }) {
  return <div className="map3d-empty-panel"><strong>{title}</strong><p>{message}</p><span>Prueba otro rango temporal o vuelve más tarde.</span></div>
}

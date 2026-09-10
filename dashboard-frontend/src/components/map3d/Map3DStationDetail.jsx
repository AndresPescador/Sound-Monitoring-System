import { defaultT, message as localizedMessage } from '../../i18n/core.mjs'
import { useLanguage } from '../../context/LanguageContext'
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
const METRIC_LABELS = (t = defaultT) => ({
  leq_dbfs: t('maps.leq_a_weighted'),
  dbfs_level: t('maps.dbfs_level'),
  rms_energy: t('maps.rms_energy'),
  ild_db: t('maps.ild_interaural_difference'),
  interaural_correlation: t('maps.interaural_correlation'),
  dominant_frequency: t('maps.dominant_frequency'),
  spectral_centroid: t('maps.spectral_centroid'),
  spectral_rolloff: t('maps.spectral_rolloff'),
  zero_crossing_rate: t('maps.zero_crossing_rate'),
})

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

function relativeTime(value, t = defaultT) {
  if (!value) return t('maps.no_communication_recorded')
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000)
  try { return new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(minutes, 'minute') } catch { return t('maps.date_unavailable') }
}

function formatValue(value, digits = 1, t = defaultT) {
  return Number.isFinite(Number(value)) ? t.fixed(Number(value), digits) : t('common.no_reading')
}

function Map3DChartSection({ title, info, data, fileLabel, svgTitle, stationCode, children }) {
  const { t } = useLanguage()
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
  const { t } = useLanguage()
  return <ChartSkeleton height={220} showLegend={false} label={t(label)} />
}

export default function Map3DStationDetail() {
  const { t } = useLanguage()
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
        setLevelState(current => ({ ...current, loading: false, error: localizedMessage('maps.could_not_load_the_level_for_this_range') }))
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
        setBinauralState(current => ({ ...current, loading: false, error: localizedMessage('maps.could_not_load_binaural_metrics') }))
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
        setSpectralState(current => ({ ...current, loading: false, error: localizedMessage('maps.could_not_load_spectral_metrics') }))
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
        <h2>{t('maps.station_not_found')}</h2>
        <p>{t('maps.the_code') + ' '}<span className="map3d-code">{code}</span>{' ' + t('maps.does_not_match_an_available_station')}</p>
        <button type="button" className="map3d-primary-button" onClick={() => navigate(ROUTES.map3D)}>{t('maps.back_to_exploration')}</button>
      </div>
    )
  }

  const tabs = [
    { id: 'summary', label: t('maps.summary') },
    { id: 'level', label: t('maps.level') },
    { id: 'binaural', label: 'Binaural' },
    { id: 'spectral', label: t('maps.spectrum') },
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
          <p className="map3d-overline">{station?.locality ?? t('maps.loading_locality')}</p>
          <h2>{summary?.name ?? station?.name ?? code}</h2>
          <p className="map3d-muted">{station?.address ?? summary?.address ?? t('maps.address_not_recorded')} · <span className="map3d-code">{code}</span></p>
        </div>
        <span className={`map3d-status ${summary?.is_active ?? station?.is_active ? 'is-active' : 'is-inactive'}`}>
          {summary?.is_active ?? station?.is_active ? t('maps.active_2') : t('common.inactive')}
        </span>
      </div>

      <div className="map3d-tabs" role="tablist" aria-label={t('maps.station_analysis')}>
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
  const { t } = useLanguage()
  const metrics = [
    [t('maps.latest_leq'), formatValue(summary?.latest_leq_dbfs ?? station?.current_leq_dbfs, undefined, t), 'dBFS'],
    [t('maps.total_measurements'), summary?.total_measurements?.toLocaleString(t.locale) ?? t('common.no_reading'), 'registros'],
    [t('maps.last_hour'), formatValue(summary?.last_hour_leq, undefined, t), 'Leq dBFS'],
    ['L10 / L50 / L90', `${formatValue(summary?.last_hour_l10, undefined, t)} / ${formatValue(summary?.last_hour_l50, undefined, t)} / ${formatValue(summary?.last_hour_l90, undefined, t)}`, 'dBFS'],
  ]
  if (loading) return <DetailLoading label={t('maps.loading_station_summary')} />
  return (
    <div className="map3d-summary-panel">
      <div className="map3d-summary-grid map3d-summary-grid--station">
        {metrics.map(([label, value, detail]) => <div className="map3d-summary-stat" key={label}><span>{t(label)}</span><strong>{value}</strong><small>{detail}</small></div>)}
      </div>
      <dl className="map3d-detail-list">
        <div><dt>{t('admin.locality_2')}</dt><dd>{summary?.locality ?? station?.locality ?? t('common.no_reading')}</dd></div>
        <div><dt>{t('admin.address')}</dt><dd>{summary?.address ?? station?.address ?? t('maps.address_not_recorded')}</dd></div>
        <div><dt>{t('maps.last_communication')}</dt><dd>{relativeTime(summary?.last_seen_at ?? station?.last_seen_at, t)}</dd></div>
      </dl>
      <p className="map3d-panel-note">{t('maps.the_summary_updates_with_the_station_snapshot_open_level')}</p>
    </div>
  )
}

function DetailControls({ range, profileDate, metric, onRangeChange, onProfileDateChange, onMetricChange, onAxisModeChange, axisMode, automaticAxisMode, axisIsAutomatic }) {
  const { t } = useLanguage()
  return (
    <>
      <div className="map3d-control-grid">
        <div className="map3d-field"><label>{t('maps.time_range')}</label><DateRangePicker onChange={onRangeChange} /></div>
        <div className="map3d-field"><label htmlFor="map3d-metric">{t('maps.metric')}</label><MetricSelector id="map3d-metric" value={metric} onChange={onMetricChange} className="dashboard-select" /></div>
        <div className="map3d-field"><label htmlFor="map3d-profile-date">{t('maps.profile_day_bogota_time')}</label><input id="map3d-profile-date" type="date" value={profileDate} onChange={event => onProfileDateChange(event.target.value)} className="dashboard-input" /></div>
      </div>
      <ChartAxisModeControl mode={axisMode} automaticMode={automaticAxisMode} isAutomatic={axisIsAutomatic} onChange={onAxisModeChange} range={range} />
    </>
  )
}

function LevelPanel({ code, range, profileDate, metric, state, axisMode, automaticAxisMode, axisIsAutomatic, onRangeChange, onProfileDateChange, onMetricChange, onAxisModeChange, onRetry }) {
  const { t } = useLanguage()
  if (state.error) return <ErrorPanel message={state.error} onRetry={onRetry} />
  const seriesData = state.timeseries.map(item => ({ timestamp: item.recorded_at, [metric]: item.value }))
  return (
    <div className="map3d-detail-content">
      <DetailControls range={range} profileDate={profileDate} metric={metric} onRangeChange={onRangeChange} onProfileDateChange={onProfileDateChange} onMetricChange={onMetricChange} onAxisModeChange={onAxisModeChange} axisMode={axisMode} automaticAxisMode={automaticAxisMode} axisIsAutomatic={axisIsAutomatic} />
      {state.loading ? <DetailLoading label={t('maps.loading_levels_profile_and_time_series')} /> : (
        <div className="map3d-chart-stack">
          <Map3DChartSection title={t('maps.hourly_levels_leq_l10_l90')} info="L90 representa el ruido de fondo; Leq el nivel equivalente y L10 los picos ocasionales." data={state.hourly} stationCode={code}>
            <LevelBandChart data={state.hourly} axisMode={axisMode} />
            <p className="map3d-chart-note">{t('maps.l90_background_leq_equivalent_level_l10_peaks')}</p>
          </Map3DChartSection>
          <Map3DChartSection title={t('maps.daily_profile', { p0: profileDate })} info={t('common.daily_profile_help')} data={state.daily} stationCode={code}>
            <DailyBarChart data={state.daily} />
            <p className="map3d-chart-note">{t('maps.leq_by_hour_of_day_color_indicates_acoustic_level')}</p>
          </Map3DChartSection>
          <Map3DChartSection title={t('maps.time_series', { p0: METRIC_LABELS(t)[metric] ?? metric })} info={getMetricDescription(metric, t)} data={seriesData} fileLabel={metric} svgTitle={METRIC_LABELS(t)[metric] ?? metric} stationCode={code}>
            <TimeSeriesChart data={state.timeseries} metricLabel={metric} unit="dBFS" axisMode={axisMode} />
            <ResolutionNotice meta={state.timeseriesMeta} />
          </Map3DChartSection>
        </div>
      )}
    </div>
  )
}

function BinauralPanel({ code, state, axisMode, onRetry }) {
  const { t } = useLanguage()
  if (state.error) return <ErrorPanel message={state.error} onRetry={onRetry} />
  if (state.loading) return <DetailLoading label={t('maps.loading_binaural_metrics')} />
  if (!state.data.length) return <EmptyPanel title={t('maps.no_binaural_data')} message={t('common.missing_binaural_help')} />
  const channelData = state.data.some(item => item.ch_left_dbfs != null || item.ch_right_dbfs != null)
  return (
    <div className="map3d-detail-content">
      <ResolutionNotice meta={state.meta} />
      <div className="map3d-chart-grid">
        <Map3DChartSection title={t('maps.ild_interaural_difference_2')} info={getMetricDescription('ild_db', t)} data={state.data.map(item => ({ timestamp: item.recorded_at, ild_db: item.ild_db }))} fileLabel="ild_db" stationCode={code}>
          <ILDChart data={state.data} axisMode={axisMode} />
          <p className="map3d-chart-note">{t('maps.the_sign_indicates_relative_dominance_between_channels')}</p>
        </Map3DChartSection>
        <Map3DChartSection title={t('maps.interaural_correlation')} info={getMetricDescription('interaural_correlation', t)} data={state.data.map(item => ({ timestamp: item.recorded_at, interaural_correlation: item.interaural_correlation }))} fileLabel="correlacion" stationCode={code}>
          <TimeSeriesChart data={state.data.map(item => ({ recorded_at: item.recorded_at, value: item.interaural_correlation, value_min: item.interaural_correlation_min, value_max: item.interaural_correlation_max, source_count: item.source_count }))} metricLabel={t('landing.correlation')} axisMode={axisMode} />
        </Map3DChartSection>
        {channelData && <Map3DChartSection title={t('maps.left_and_right_channels')} data={state.data} fileLabel="canales" stationCode={code}>
          <TimeSeriesChart data={state.data} unit="dBFS" axisMode={axisMode} series={[{ dataKey: 'ch_left_dbfs', label: t('maps.l_channel'), color: '#1d4ed8' }, { dataKey: 'ch_right_dbfs', label: t('maps.r_channel'), color: '#52637c' }]} />
        </Map3DChartSection>}
      </div>
    </div>
  )
}

function SpectralPanel({ code, state, axisMode, onRetry }) {
  const { t } = useLanguage()
  if (state.error) return <ErrorPanel message={state.error} onRetry={onRetry} />
  if (state.loading) return <DetailLoading label={t('maps.loading_spectral_metrics')} />
  if (!state.data.length) return <EmptyPanel title={t('maps.no_spectral_data')} message="No hay frecuencia dominante, centroide ni rolloff para el rango seleccionado." />
  const series = [
    ['spectral_centroid', t('maps.spectral_centroid'), 'Hz'],
    ['dominant_frequency', t('maps.dominant_frequency'), 'Hz'],
    ['spectral_rolloff', t('maps.spectral_rolloff'), 'Hz'],
    ['zero_crossing_rate', t('maps.zero_crossing_rate'), ''],
  ]
  return (
    <div className="map3d-detail-content">
      <ResolutionNotice meta={state.meta} />
      <div className="map3d-chart-grid">
        {series.map(([key, label, unit]) => (
          <Map3DChartSection key={key} title={t(label)} info={getMetricDescription(key, t)} data={state.data.map(item => ({ timestamp: item.recorded_at, [key]: item[key] }))} fileLabel={key} stationCode={code}>
            <TimeSeriesChart data={state.data.map(item => ({ recorded_at: item.recorded_at, value: item[key], value_min: item[`${key}_min`], value_max: item[`${key}_max`], source_count: item.source_count }))} metricLabel={label} unit={unit} axisMode={axisMode} />
          </Map3DChartSection>
        ))}
      </div>
    </div>
  )
}

function ErrorPanel({ message, onRetry }) {
  const { t } = useLanguage()
  return <div className="map3d-inline-error" role="alert"><strong>{t('maps.could_not_load_this_analysis')}</strong><p>{t(message)}</p><button type="button" className="map3d-secondary-button" onClick={onRetry}>{t('maps.retry')}</button></div>
}

function EmptyPanel({ title, message }) {
  const { t } = useLanguage()
  return <div className="map3d-empty-panel"><strong>{title}</strong><p>{t(message)}</p><span>{t('maps.try_another_time_range_or_come_back_later')}</span></div>
}

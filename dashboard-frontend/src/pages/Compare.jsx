import { defaultT } from '../i18n/core.mjs'
import { useLanguage } from '../context/LanguageContext'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { getCompare }      from '../api/compare'
import { getStationSummary, getStations }     from '../api/stations'
import { getCompareMeasurements, getCompareMeasurementsRaw } from '../api/measurements'
import CompareChart       from '../components/charts/CompareChart'
import ScatterCompareChart from '../components/charts/ScatterCompareChart'
import DateRangePicker    from '../components/shared/DateRangePicker'
import ChartSkeleton       from '../components/shared/ChartSkeleton'
import ChartInfo          from '../components/shared/ChartInfo'
import ChartDownloadMenu  from '../components/shared/ChartDownloadMenu'
import ChartAxisModeControl from '../components/shared/ChartAxisModeControl'
import ResolutionNotice   from '../components/shared/ResolutionNotice'
import { AUTO_FOCUS_THRESHOLD, getCoverageRatio } from '../components/charts/timeAxis'
import { getMetricDescription } from '../components/shared/metricDescriptions'
import { useChartDownload } from '../hooks/useChartDownload'
import { buildPresetRange, DEFAULT_RANGE_HOURS, getLatestTimestamp, getStationLatestTimestamp, hasRecentData } from '../components/shared/dateRangeUtils'
import { HistoricalRangeNotice, NoMeasurementsNotice } from '../components/shared/RangeAvailabilityNotice'

// ─── Métricas disponibles en /compare ────────────────────────────────────────
const COMPARE_METRICS = (t = defaultT) => ([
  { value: 'leq_hour',              label: t('common.hourly_leq') },
  { value: 'l10',                   label: t('common.noise_peaks') },
  { value: 'l50',                   label: t('common.l50_typical') },
  { value: 'l90',                   label: t('common.noise_background') },
  { value: 'dbfs_avg',              label: t('common.average_dbfs') },
  { value: 'dbfs_max',              label: t('common.maximum_dbfs') },
  { value: 'avg_spectral_centroid', label: t('maps.spectral_centroid') },
  { value: 'avg_ild_db',            label: t('common.average_ild') },
  { value: 'avg_interaural_corr',   label: t('maps.interaural_correlation') },
])

// ─── Métricas crudas disponibles en /measurements (sección 2) ────────────────
const RAW_METRICS = (t = defaultT) => ([
  { value: 'leq_dbfs',               label: t('maps.leq_a_weighted') },
  { value: 'dbfs_level',             label: t('maps.dbfs_level') },
  { value: 'rms_energy',             label: t('maps.rms_energy') },
  { value: 'ild_db',                 label: t('maps.ild_interaural_difference') },
  { value: 'interaural_correlation', label: t('maps.interaural_correlation') },
  { value: 'dominant_frequency',     label: t('common.dominant_frequency_hz') },
  { value: 'spectral_centroid',      label: t('common.spectral_centroid_hz') },
  { value: 'spectral_rolloff',       label: t('common.spectral_rolloff_hz') },
  { value: 'zero_crossing_rate',     label: t('maps.zero_crossing_rate') },
  { value: 'ch_left_dbfs',           label: t('common.left_channel_dbfs') },
  { value: 'ch_right_dbfs',          label: t('common.right_channel_dbfs') },
])

const EXACT_PREVIEW_LIMIT = 3000
const EXACT_MAX_LIMIT = 10000
const PRESET_HOURS = Object.freeze({
  '6h': 6,
  '24h': 24,
  '7d': 7 * 24,
  '30d': 30 * 24,
})

function getAutomaticRange(hours, latestTimestamp) {
  const historical = Boolean(latestTimestamp && !hasRecentData(latestTimestamp, hours))
  return {
    range: buildPresetRange(hours, historical ? latestTimestamp : undefined),
    historical,
    anchorTimestamp: historical ? latestTimestamp : null,
  }
}

function formatCount(count, singular, plural, t = defaultT) {
  const value = Number(count ?? 0)
  return `${value.toLocaleString(t.locale)} ${value === 1 ? singular : plural}`
}

function formatStationCount(count, t = defaultT) {
  return formatCount(count, t('common.station'), t('maps.stations'), t)
}

// ─── Subcomponente: selector de tags con scroll ───────────────────────────────
function TagSelector({ items, selected, onToggle, onSelectAll, onClearAll, getKey, getLabel, getSubLabel }) {
  const { t } = useLanguage()
  return (
    <div className="dashboard-tag-selector">
      <div className="dashboard-tag-group__heading">
        <div className="dashboard-tag-group__actions">
          <button type="button" onClick={onSelectAll} className="dashboard-text-button">{t('common.all')}</button>
          <button type="button" onClick={onClearAll} className="dashboard-text-button">{t('common.none')}</button>
        </div>
        <span className="dashboard-tag-group__count">{selected.size} / {items.length}{' ' + t('common.selected')}</span>
      </div>
      <div className="dashboard-tag-list">
        {items.map(item => {
          const key = getKey(item)
          const active = selected.has(key)
          const label = getLabel(item)
          const subLabel = getSubLabel?.(item)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={active}
              aria-label={subLabel ? `${label}, ${subLabel}` : label}
              className={`dashboard-tag ${
                active
                  ? 'dashboard-tag--active'
                  : ''
              }`}
            >
              <span className="dashboard-tag__label">{t(label)}</span>
              {subLabel && (
                <span className="dashboard-tag__sub">
                  {subLabel}
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
function SectionCard({ title, subtitle, downloadData, fileLabel, svgTitle, csvTitle, children }) {
  const { t } = useLanguage()
  const cardRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const { downloadPNG, downloadSVG, downloadCSV } = useChartDownload(cardRef, title, downloadData, fileLabel, svgTitle, '', csvTitle)

  const handlePNG = useCallback(async () => {
    setDownloading(true)
    await downloadPNG()
    setDownloading(false)
  }, [downloadPNG])

  return (
    <div ref={cardRef} className="dashboard-section-card">
      <div className="dashboard-section-card__heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
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
export default function Compare({ onStationSelectionChange } = {}) {
  const { t } = useLanguage()
  const [allStations, setAllStations] = useState([])
  const [latestByStation, setLatestByStation] = useState({})
  const [latestTimestampsReady, setLatestTimestampsReady] = useState(false)

  // ── Sección 1: comparación por localidades ──
  const [localityMetric,     setLocalityMetric]     = useState('leq_hour')
  const [localityRange,      setLocalityRange]      = useState(() => buildPresetRange(DEFAULT_RANGE_HOURS))
  const [localityPreset,     setLocalityPreset]     = useState('24h')
  const [localityRangeState, setLocalityRangeState] = useState({ historical: false, anchorTimestamp: null })
  const [localitySeries,     setLocalitySeries]     = useState([])
  const [loadingLocality,    setLoadingLocality]    = useState(true)
  const [selectedLocalities, setSelectedLocalities] = useState(new Set())
  const [localityAxisMode, setLocalityAxisMode] = useState('auto')

  // ── Sección 2: comparación por estaciones ──
  const [stationMetric,    setStationMetric]    = useState('leq_dbfs')
  const [stationRange,     setStationRange]     = useState(() => buildPresetRange(DEFAULT_RANGE_HOURS))
  const [stationPreset,    setStationPreset]    = useState('24h')
  const [stationRangeState, setStationRangeState] = useState({ historical: false, anchorTimestamp: null })
  const [stationSeries,    setStationSeries]    = useState([])
  const [loadingStation,   setLoadingStation]   = useState(true)
  const [selectedStations, setSelectedStations] = useState(new Set())
  const [stationAxisMode, setStationAxisMode] = useState('auto')
  const [stationComparisonMeta, setStationComparisonMeta] = useState(null)
  const [shouldLoadExactPoints, setShouldLoadExactPoints] = useState(false)
  const [loadingExactPoints, setLoadingExactPoints] = useState(false)
  const [exactPointLimit, setExactPointLimit] = useState(EXACT_PREVIEW_LIMIT)
  const [exactPointsError, setExactPointsError] = useState(false)
  const [exactPointsRequest, setExactPointsRequest] = useState(0)
  const exactScatterRef = useRef(null)

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
    let active = true
    getStations()
      .then(r => {
        if (!active) return
        setAllStations(r.data)
        setSelectedLocalities(new Set(r.data.map(s => s.locality)))
        setSelectedStations(new Set(r.data.map(s => s.station_code)))

        const fallbackLatest = Object.fromEntries(r.data.map(station => [station.station_code, getStationLatestTimestamp(station)]))
        setLatestByStation(fallbackLatest)
        if (!r.data.length) {
          setLatestTimestampsReady(true)
          return
        }

        return Promise.all(r.data.map(async station => {
          try {
            const response = await getStationSummary(station.station_code)
            return [station.station_code, response.data.latest_recorded_at]
          } catch {
            return [station.station_code, fallbackLatest[station.station_code]]
          }
        })).then(entries => {
          if (!active) return
          setLatestByStation(current => ({ ...current, ...Object.fromEntries(entries) }))
          setLatestTimestampsReady(true)
        })
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!latestTimestampsReady || !allStations.length) return

    const nextLocalityLatest = getLatestTimestamp(
      allStations
        .filter(station => selectedLocalities.has(station.locality))
        .map(station => latestByStation[station.station_code] ?? getStationLatestTimestamp(station)),
    )
    const nextStationLatest = getLatestTimestamp(
      allStations
        .filter(station => selectedStations.has(station.station_code))
        .map(station => latestByStation[station.station_code] ?? getStationLatestTimestamp(station)),
    )

    // Los presets siguen el último dato de la selección actual. Un rango
    // personalizado se conserva intacto aunque cambie la selección.
    if (localityPreset) {
      const hours = PRESET_HOURS[localityPreset] ?? DEFAULT_RANGE_HOURS
      const next = getAutomaticRange(hours, nextLocalityLatest)
      setLocalityRange(next.range)
      setLocalityRangeState({ historical: next.historical, anchorTimestamp: next.anchorTimestamp })
    }

    if (stationPreset) {
      const hours = PRESET_HOURS[stationPreset] ?? DEFAULT_RANGE_HOURS
      const next = getAutomaticRange(hours, nextStationLatest)
      setStationRange(next.range)
      setStationRangeState({ historical: next.historical, anchorTimestamp: next.anchorTimestamp })
    }
  }, [latestTimestampsReady, allStations, latestByStation, selectedLocalities, selectedStations, localityPreset, stationPreset])

  useEffect(() => {
    onStationSelectionChange?.([...selectedStations])
  }, [onStationSelectionChange, selectedStations])

  // ── Fetch sección 1: localidades ──
  useEffect(() => {
    if (allStations.length === 0 || !latestTimestampsReady) return
    setLoadingLocality(true)
    const allLocCodes = localities.flatMap(l => l.codes)
    const filtered = selectedLocalities.size === localities.length
      ? allLocCodes
      : localities.filter(l => selectedLocalities.has(l.locality)).flatMap(l => l.codes)
    if (filtered.length === 0) {
      setLocalitySeries([])
      setLoadingLocality(false)
      return
    }
    const stationsParam = selectedLocalities.size === localities.length ? null : filtered.join(',')
    const controller = new AbortController()
    getCompare({ metric: localityMetric, from: localityRange.from, to: localityRange.to, ...(stationsParam ? { stations: stationsParam } : {}) }, { signal: controller.signal })
      .then(r => {
        if (!controller.signal.aborted) setLocalitySeries(r.data.series)
      })
      .catch(error => {
        if (!controller.signal.aborted && error?.code !== 'ERR_CANCELED') setLocalitySeries([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingLocality(false)
      })
    return () => controller.abort()
  }, [localityMetric, localityRange, selectedLocalities, allStations, latestTimestampsReady, localities])

  // ── Fetch sección 2: grid común + detalle exacto para ScatterChart ──
  useEffect(() => {
    if (allStations.length === 0 || !latestTimestampsReady) return
    setLoadingStation(true)
    setShouldLoadExactPoints(false)
    setExactPointLimit(EXACT_PREVIEW_LIMIT)
    setLoadingExactPoints(false)
    setExactPointsError(false)
    const targetStations = allStations.filter(s => selectedStations.has(s.station_code))
    if (targetStations.length === 0) {
      setStationSeries([])
      setStationComparisonMeta(null)
      setLoadingStation(false)
      return
    }
    const params = {
      from: stationRange.from,
      to: stationRange.to,
      metric: stationMetric,
      stations: targetStations.map(station => station.station_code).join(','),
      max_points: 1500,
    }
    const controller = new AbortController()
    getCompareMeasurements(params, { signal: controller.signal })
      .then(r => {
        if (controller.signal.aborted) return
        const body = r.data
        const series = (body.series ?? [])
          .filter(item => (item.data ?? []).some(point => point.value != null))
          .map(item => ({
            station_code: item.station_code,
            locality: item.locality,
            displayName: `${item.locality} (${item.station_code})`,
            data: (item.data ?? []).map(point => ({
              hour_start: point.recorded_at,
              value: point.value,
              value_min: point.value_min,
              value_max: point.value_max,
              source_count: point.source_count,
            })),
            rawData: [],
            meta: {
              is_aggregated: true,
              total_count: item.total_count,
              returned_count: item.data?.length ?? 0,
              count: item.data?.length ?? 0,
              resolution_seconds: body.resolution_seconds,
              raw_returned_count: 0,
              raw_has_more: false,
              raw_sampled: false,
            },
          }))
        setStationSeries(series)
        setStationComparisonMeta({
          is_aggregated: true,
          total_count: body.total_count,
          returned_count: series.reduce((sum, item) => sum + item.data.length, 0),
          resolution_seconds: body.resolution_seconds,
        })
      })
      .catch(error => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return
        setStationSeries([])
        setStationComparisonMeta(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStation(false)
      })
    return () => controller.abort()
  }, [stationMetric, stationRange, selectedStations, allStations, latestTimestampsReady])

  useEffect(() => {
    const element = exactScatterRef.current
    if (!element || !stationSeries.length || loadingStation) return undefined

    if (!('IntersectionObserver' in window)) {
      setShouldLoadExactPoints(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setShouldLoadExactPoints(true)
          observer.disconnect()
        }
      },
      { rootMargin: '480px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [stationSeries.length, loadingStation])

  useEffect(() => {
    if (!shouldLoadExactPoints || allStations.length === 0) return undefined
    const targetStations = allStations.filter(s => selectedStations.has(s.station_code))
    if (targetStations.length === 0) return undefined

    const controller = new AbortController()
    setLoadingExactPoints(true)
    setExactPointsError(false)
    getCompareMeasurementsRaw({
      from: stationRange.from,
      to: stationRange.to,
      metric: stationMetric,
      stations: targetStations.map(station => station.station_code).join(','),
      raw_limit: exactPointLimit,
    }, { signal: controller.signal })
      .then(response => {
        const body = response.data
        const rawByStation = new Map((body.series ?? []).map(item => [item.station_code, item]))
        setStationSeries(current => current.map(item => {
          const raw = rawByStation.get(item.station_code)
          if (!raw) return item
          return {
            ...item,
            rawData: raw.raw_data ?? [],
            meta: {
              ...item.meta,
              raw_limit: body.raw_limit,
              raw_returned_count: raw.raw_returned_count,
              raw_has_more: raw.raw_has_more,
              raw_sampled: raw.raw_sampled,
            },
          }
        }))
      })
      .catch(error => {
        if (error?.code === 'ERR_CANCELED' || controller.signal.aborted) return
        setExactPointsError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingExactPoints(false)
      })

    return () => controller.abort()
  }, [shouldLoadExactPoints, exactPointsRequest, exactPointLimit, stationMetric, stationRange.from, stationRange.to, selectedStations, allStations])

  useEffect(() => {
    setLocalityAxisMode('auto')
  }, [localityRange.from, localityRange.to])

  useEffect(() => {
    setStationAxisMode('auto')
  }, [stationRange.from, stationRange.to])

  // ── Helpers tags ──
  const toggleLocality   = loc  => setSelectedLocalities(prev => { const n = new Set(prev); n.has(loc)  ? n.delete(loc)  : n.add(loc);  return n })
  const selectAllLocalities = () => setSelectedLocalities(new Set(localities.map(l => l.locality)))
  const clearAllLocalities  = () => setSelectedLocalities(new Set())
  const toggleStation    = code => setSelectedStations(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
  const selectAllStations   = () => setSelectedStations(new Set(allStations.map(s => s.station_code)))
  const clearAllStations    = () => setSelectedStations(new Set())

  const localityLatestTimestamp = getLatestTimestamp(
    allStations
      .filter(station => selectedLocalities.has(station.locality))
      .map(station => latestByStation[station.station_code] ?? getStationLatestTimestamp(station)),
  )
  const stationLatestTimestamp = getLatestTimestamp(
    allStations
      .filter(station => selectedStations.has(station.station_code))
      .map(station => latestByStation[station.station_code] ?? getStationLatestTimestamp(station)),
  )

  const handleLocalityRangeChange = (nextRange, metadata) => {
    setLocalityRange(nextRange)
    setLocalityPreset(metadata?.type === 'preset' ? metadata.label : '')
    setLocalityRangeState(current => ({
      historical: metadata?.type === 'preset' && current.historical,
      anchorTimestamp: metadata?.type === 'preset' && current.historical ? current.anchorTimestamp : null,
    }))
  }

  const handleStationRangeChange = (nextRange, metadata) => {
    setStationRange(nextRange)
    setStationPreset(metadata?.type === 'preset' ? metadata.label : '')
    setStationRangeState(current => ({
      historical: metadata?.type === 'preset' && current.historical,
      anchorTimestamp: metadata?.type === 'preset' && current.historical ? current.anchorTimestamp : null,
    }))
  }

  const localityCoverage = getCoverageRatio([
    { data: localitySeries.flatMap(s => s.data), timeKey: 'hour_start', valueKeys: ['value'] },
  ], localityRange)
  const localityAutomaticMode = localityCoverage !== null && localityCoverage < AUTO_FOCUS_THRESHOLD ? 'data' : 'range'
  const activeLocalityAxisMode = localityAxisMode === 'auto' ? localityAutomaticMode : localityAxisMode

  const stationCoverage = getCoverageRatio([
    { data: stationSeries.flatMap(s => s.data), timeKey: 'hour_start', valueKeys: ['value'] },
  ], stationRange)
  const stationAutomaticMode = stationCoverage !== null && stationCoverage < AUTO_FOCUS_THRESHOLD ? 'data' : 'range'
  const activeStationAxisMode = stationAxisMode === 'auto' ? stationAutomaticMode : stationAxisMode
  const hasExactPoints = stationSeries.some(item => item.rawData?.length > 0)
  const hasMoreExactPoints = stationSeries.some(item => item.meta?.raw_has_more)
  const canLoadMoreExactPoints = hasMoreExactPoints && exactPointLimit < EXACT_MAX_LIMIT

  return (
    <div className="dashboard-page dashboard-compare-page">
      <header className="dashboard-page-header">
        <div>
          <h1 tabIndex={-1}>{t('maps.compare_stations')}</h1>
          <p>{t('common.compare_localities_and_individual_stations_to_identify_changes_peaks')}</p>
        </div>
      </header>

      <SectionCard
        title={t('common.comparison_by_locality')}
        csvTitle={defaultT('common.comparison_by_locality')}
        subtitle={t('common.aggregate_the_stations_in_each_locality_and_compare_their')}
        fileLabel={localityMetric}
        svgTitle={t('common.comparison_by_locality_2', { p0: COMPARE_METRICS(t).find(m => m.value === localityMetric)?.label ?? localityMetric })}
        downloadData={localityCSV}
      >
        <div className="dashboard-controls">
          <DateRangePicker
            value={localityRange}
            preset={localityPreset}
            anchorTimestamp={localityRangeState.anchorTimestamp}
            isHistoricalRange={localityRangeState.historical}
            onChange={handleLocalityRangeChange}
          />
          <div className="dashboard-field">
            <label htmlFor="locality-metric">{t('maps.metric')}</label>
            <select value={localityMetric} onChange={e => setLocalityMetric(e.target.value)}
              id="locality-metric" className="dashboard-select">
              {COMPARE_METRICS(t).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {localityRangeState.historical && (
          <HistoricalRangeNotice
            range={localityRange}
            latestTimestamp={localityLatestTimestamp}
            onReturnToCurrent={() => {
              setLocalityRange(buildPresetRange(DEFAULT_RANGE_HOURS))
              setLocalityPreset('24h')
              setLocalityRangeState({ historical: false, anchorTimestamp: null })
            }}
          />
        )}

        {localities.length > 0 && (
          <div className="dashboard-tag-group">
            <div className="dashboard-tag-group__heading"><p>{t('common.localities')}</p></div>
            <TagSelector
              items={localities} selected={selectedLocalities}
              onToggle={toggleLocality} onSelectAll={selectAllLocalities} onClearAll={clearAllLocalities}
              getKey={l => l.locality} getLabel={l => l.locality}
              getSubLabel={l => formatStationCount(l.codes.length, t)}
            />
          </div>
        )}

        <ChartAxisModeControl
          mode={activeLocalityAxisMode}
          automaticMode={localityAutomaticMode}
          isAutomatic={localityAxisMode === 'auto'}
          onChange={setLocalityAxisMode}
          range={localityRange}
          compactGaps
        />

        <div>
          <div className="dashboard-chart-heading">
            <h3>
              {COMPARE_METRICS(t).find(m => m.value === localityMetric)?.label}
            </h3>
            <ChartInfo text={getMetricDescription(localityMetric, t)} />
          </div>
          {loadingLocality
            ? <ChartSkeleton height={280} label={t('common.loading_locality_comparison')} />
            : localitySeries.length === 0
              ? localityLatestTimestamp
                ? <p className="text-sm text-text-muted py-8 text-center">{t('common.no_data_for_the_selected_range_and_localities')}</p>
                : <NoMeasurementsNotice>{t('common.no_measurements_recorded_for_the_selected_localities')}</NoMeasurementsNotice>
              : <CompareChart
                  series={localitySeries}
                  metricLabel={COMPARE_METRICS(t).find(m => m.value === localityMetric)?.label}
                  axisMode={activeLocalityAxisMode}
                />
          }
        </div>

        {!loadingLocality && localitySeries.length > 0 && (
          <div className="dashboard-result-grid">
            {localitySeries.map(s => (
              <div key={s.station_code} className="dashboard-result">
                <p className="dashboard-result__code">{s.station_code}</p>
                <p className="dashboard-result__name">{s.locality}</p>
                <p className="dashboard-result__meta">{s.data.length}{' ' + t('common.points')}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('common.comparison_by_station')}
        csvTitle={defaultT('common.comparison_by_station')}
        subtitle={t('common.select_specific_stations_to_compare_their_behavior_in_detail')}
        fileLabel={stationMetric}
        svgTitle={t('common.comparison_by_station_2', { p0: RAW_METRICS(t).find(m => m.value === stationMetric)?.label ?? stationMetric })}
        downloadData={stationCSV}
      >
        <div className="dashboard-controls">
          <DateRangePicker
            value={stationRange}
            preset={stationPreset}
            anchorTimestamp={stationRangeState.anchorTimestamp}
            isHistoricalRange={stationRangeState.historical}
            onChange={handleStationRangeChange}
          />
          <div className="dashboard-field">
            <label htmlFor="station-metric">{t('maps.metric')}</label>
            <select value={stationMetric} onChange={e => setStationMetric(e.target.value)}
              id="station-metric" className="dashboard-select">
              {RAW_METRICS(t).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {stationRangeState.historical && (
          <HistoricalRangeNotice
            range={stationRange}
            latestTimestamp={stationLatestTimestamp}
            onReturnToCurrent={() => {
              setStationRange(buildPresetRange(DEFAULT_RANGE_HOURS))
              setStationPreset('24h')
              setStationRangeState({ historical: false, anchorTimestamp: null })
            }}
          />
        )}

        {allStations.length > 0 && (
          <div className="dashboard-tag-group">
            <div className="dashboard-tag-group__heading"><p>{t('admin.stations')}</p></div>
            <TagSelector
              items={allStations} selected={selectedStations}
              onToggle={toggleStation} onSelectAll={selectAllStations} onClearAll={clearAllStations}
              getKey={s => s.station_code} getLabel={s => s.name ?? s.station_code}
              getSubLabel={s => s.locality}
            />
          </div>
        )}

        <ChartAxisModeControl
          mode={activeStationAxisMode}
          automaticMode={stationAutomaticMode}
          isAutomatic={stationAxisMode === 'auto'}
          onChange={setStationAxisMode}
          range={stationRange}
          compactGaps
        />

        <div>
          <div className="dashboard-chart-heading">
            <h3>
              {RAW_METRICS(t).find(m => m.value === stationMetric)?.label}
            </h3>
            <ChartInfo text={getMetricDescription(stationMetric, t)} />
          </div>
          {loadingStation
            ? <ChartSkeleton height={280} label={t('common.loading_station_comparison')} />
            : stationSeries.length === 0
              ? stationLatestTimestamp
                ? <p className="text-sm text-text-muted py-8 text-center">{t('common.no_data_for_the_selected_range_and_stations')}</p>
                : <NoMeasurementsNotice>{t('common.no_measurements_recorded_for_the_selected_stations')}</NoMeasurementsNotice>
              : <CompareChart
                  series={stationSeries}
                  metricLabel={RAW_METRICS(t).find(m => m.value === stationMetric)?.label}
                  axisMode={activeStationAxisMode}
                />
          }
        </div>

        <ResolutionNotice meta={stationComparisonMeta} />

        {(loadingStation || stationSeries.length > 0) && (
          <div ref={exactScatterRef} className="dashboard-compare-scatter">
            <div className="dashboard-chart-heading">
              <h3>{t('common.exact_points_by_station')}</h3>
              <ChartInfo text={t('common.exact_points_help')} />
            </div>
            {loadingStation
              ? <ChartSkeleton height={300} label={t('common.loading_exact_points')} />
              : !shouldLoadExactPoints
                ? <ChartSkeleton height={300} label={t('common.exact_points_will_load_as_you_scroll_closer')} />
                : loadingExactPoints
                  ? <ChartSkeleton height={300} label={t('common.loading_exact_points')} />
                  : exactPointsError
                    ? (
                      <div className="dashboard-chart-inline-state" role="alert">
                        <p>{t('common.could_not_load_exact_points')}</p>
                        <button type="button" className="dashboard-load-more-button" onClick={() => setExactPointsRequest(value => value + 1)}>{t('maps.retry')}</button>
                      </div>
                    )
                    : hasExactPoints
                      ? <ScatterCompareChart
                          series={stationSeries}
                          metricLabel={RAW_METRICS(t).find(m => m.value === stationMetric)?.label}
                          axisMode={activeStationAxisMode}
                          range={stationRange}
                        />
                      : <p className="text-center text-sm text-text-muted py-8">{t('charts.no_exact_points_for_this_range')}</p>
            }
            {!loadingStation && !loadingExactPoints && !exactPointsError && hasExactPoints && (
              <>
                {canLoadMoreExactPoints && (
                  <button
                    type="button"
                    className="dashboard-load-more-button"
                    onClick={() => setExactPointLimit(EXACT_MAX_LIMIT)}
                  >{t('common.load_up_to') + ' '}{EXACT_MAX_LIMIT.toLocaleString(t.locale)}{' ' + t('common.exact_points_in_total')}</button>
                )}
                {hasMoreExactPoints
                  ? <p className="dashboard-resolution-note dashboard-resolution-note--aggregated">{t('common.representative_exact_view') + ' '}{formatCount(stationSeries.reduce((sum, item) => sum + (item.meta?.raw_returned_count ?? 0), 0), t('common.point'), t('common.points'), t)}{' ' + t('common.shown_out_of') + ' '}{formatCount(stationSeries.reduce((sum, item) => sum + (item.meta?.total_count ?? 0), 0), t('common.measurement'), t('common.measurements'), t)}. {t('common.original_timestamp')}
                    </p>
                  : <p className="text-xs text-text-light mt-1">{t('common.precision_view_each_point_keeps_its_original_timestamp_the')}</p>
                }
              </>
            )}
          </div>
        )}

        {!loadingStation && stationSeries.length > 0 && (
          <div className="dashboard-result-grid">
            {stationSeries.map(s => (
              <div key={s.station_code} className="dashboard-result">
                <p className="dashboard-result__code">{s.station_code}</p>
                <p className="dashboard-result__name">{s.locality}</p>
                <p className="dashboard-result__meta">
                  {s.meta?.is_aggregated
                    ? `${formatCount(s.data.length, t('common.window'), t('common.windows'), t)} · ${formatCount(s.meta.total_count, t('common.measurement'), t('common.measurements'), t)}`
                    : formatCount(s.data.length, t('common.point'), t('common.points'), t)}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

    </div>
  )
}

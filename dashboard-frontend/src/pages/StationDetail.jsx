import { defaultT } from '../i18n/core.mjs'
import { useLanguage } from '../context/LanguageContext'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate }    from 'react-router-dom'
import { subHours }            from 'date-fns'
import { getStationSummary, getStations }   from '../api/stations'
import { getMeasurements, getBinaural, getSpectral } from '../api/measurements'
import { getHourly, getDailyProfile } from '../api/aggregations'
import DateRangePicker  from '../components/shared/DateRangePicker'
import MetricSelector   from '../components/shared/MetricSelector'
import ChartInfo        from '../components/shared/ChartInfo'
import ChartDownloadMenu from '../components/shared/ChartDownloadMenu'
import ChartAxisModeControl from '../components/shared/ChartAxisModeControl'
import LevelBandChart   from '../components/charts/LevelBandChart'
import TimeSeriesChart  from '../components/charts/TimeSeriesChart'
import DailyBarChart    from '../components/charts/DailyBarChart'
import ILDChart         from '../components/charts/ILDChart'
import ChartSkeleton     from '../components/shared/ChartSkeleton'
import ResolutionNotice from '../components/shared/ResolutionNotice'
import { AUTO_FOCUS_THRESHOLD, getCoverageRatio } from '../components/charts/timeAxis'
import { getMetricDescription } from '../components/shared/metricDescriptions'
import { useChartDownload } from '../hooks/useChartDownload'
import { ROUTES, map2DStationPath } from '../routes'
import { applySeoMetadata, routeSeo, siteUrl } from '../seo.mjs'
import { buildPresetRange, DEFAULT_RANGE_HOURS, formatDateTime, hasRecentData } from '../components/shared/dateRangeUtils'
import { HistoricalRangeNotice, NoMeasurementsNotice } from '../components/shared/RangeAvailabilityNotice'

// ─── SectionCard con soporte de descarga ──────────────────────────────────────
// cardRef    : ref del div raíz (para html2canvas y querySelector svg)
// title      : título visible + nombre base del archivo descargado
// info       : texto para ChartInfo (tooltip)
// downloadData: array de datos crudos para el CSV (opcional)
// Labels legibles por métrica para títulos de SVG/PNG
const METRIC_LABELS = (t = defaultT) => ({
  leq_dbfs:               t('maps.leq_a_weighted'),
  dbfs_level:             t('maps.dbfs_level'),
  rms_energy:             t('maps.rms_energy'),
  ch_left_dbfs:           t('common.left_channel_dbfs'),
  ch_right_dbfs:          t('common.right_channel_dbfs'),
  ild_db:                 t('maps.ild_interaural_difference_2'),
  interaural_correlation: t('maps.interaural_correlation'),
  dominant_frequency:     t('common.dominant_frequency_hz'),
  spectral_centroid:      t('common.spectral_centroid_hz'),
  spectral_rolloff:       t('common.spectral_rolloff_hz'),
  zero_crossing_rate:     t('maps.zero_crossing_rate'),
})

const bogotaDate = (iso) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso))
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return String(iso).slice(0, 10)
  }
}

const SectionCard = ({ title, info, downloadData, fileLabel, svgTitle, csvTitle, stationCode, children }) => {
  const { t } = useLanguage()
  const cardRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const { downloadPNG, downloadSVG, downloadCSV } = useChartDownload(cardRef, title, downloadData, fileLabel, svgTitle, stationCode, csvTitle)

  const handlePNG = useCallback(async () => {
    setDownloading(true)
    await downloadPNG()
    setDownloading(false)
  }, [downloadPNG])

  return (
    <section ref={cardRef} className="dashboard-section-card">
      <div className="dashboard-section-card__heading">
        <h2>
          {title}
          {info && <ChartInfo text={info} />}
        </h2>
        <ChartDownloadMenu
          onPNG={handlePNG}
          onSVG={downloadSVG}
          onCSV={downloadData?.length ? downloadCSV : undefined}
          downloading={downloading}
        />
      </div>
      {children}
    </section>
  )
}

export default function StationDetail() {
  const { t } = useLanguage()
  const { code } = useParams()
  const navigate = useNavigate()

  const [summary,        setSummary]        = useState(null)
  const [stations,       setStations]       = useState([])
  const [hourly,        setHourly]        = useState([])
  const [daily,         setDaily]         = useState([])
  const [timeseries,    setTimeseries]    = useState([])
  const [binaural,      setBinaural]      = useState([])
  const [spectral,      setSpectral]      = useState([])
  const [timeseriesMeta, setTimeseriesMeta] = useState(null)
  const [binauralMeta,   setBinauralMeta]   = useState(null)
  const [spectralMeta,   setSpectralMeta]   = useState(null)
  const [loadingHourly, setLoadingHourly] = useState(true)
  const [loadingBinaural, setLoadingBinaural] = useState(false)
  const [loadingSpectral, setLoadingSpectral] = useState(false)
  const [loadBinaural, setLoadBinaural] = useState(false)
  const [loadSpectral, setLoadSpectral] = useState(false)
  const [loadingDaily,  setLoadingDaily]  = useState(true)
  const [loadingMetric, setLoadingMetric] = useState(false)
  const [metric,        setMetric]        = useState('leq_dbfs')
  const [axisMode,      setAxisMode]      = useState('auto')
  const [range,         setRange]         = useState({
    from: subHours(new Date(), 24).toISOString(),
    to:   new Date().toISOString(),
  })
  const [rangePreset, setRangePreset] = useState('24h')
  const [rangeState, setRangeState] = useState({ initialized: false, historical: false, anchorTimestamp: null })
  const [profileDate, setProfileDate] = useState(() => bogotaDate(new Date().toISOString()))
  const binauralSectionRef = useRef(null)
  const spectralSectionRef = useRef(null)

  // Cargar lista de estaciones una sola vez
  useEffect(() => {
    getStations()
      .then(r => setStations(r.data))
      .catch(err => console.error(t('common.error_loading_stations'), err))
  }, [])

  // Cargar resumen de la estación actual
  useEffect(() => {
    setSummary(null)
    setRange(buildPresetRange(DEFAULT_RANGE_HOURS))
    setRangePreset('24h')
    setRangeState({ initialized: false, historical: false, anchorTimestamp: null })
    getStationSummary(code)
      .then(r => {
        const nextSummary = r.data
        const latestTimestamp = nextSummary.latest_recorded_at
        const historical = latestTimestamp && !hasRecentData(latestTimestamp, DEFAULT_RANGE_HOURS)
        setSummary(nextSummary)
        setRange(historical ? buildPresetRange(DEFAULT_RANGE_HOURS, latestTimestamp) : buildPresetRange(DEFAULT_RANGE_HOURS))
        setRangeState({
          initialized: true,
          historical: Boolean(historical),
          anchorTimestamp: historical ? latestTimestamp : null,
        })
      })
      .catch(() => {
        setRangeState({ initialized: true, historical: false, anchorTimestamp: null })
      })
  }, [code])

  // El perfil diario es una fecha concreta dentro del rango seleccionado.
  useEffect(() => {
    setProfileDate(bogotaDate(range.to))
  }, [range.to])

  useEffect(() => {
    setAxisMode('auto')
  }, [range.from, range.to])

  // Carga prioritaria: la primera gráfica visible. Las secciones inferiores
  // esperan a entrar en el viewport para no bloquear la primera lectura.
  useEffect(() => {
    if (!rangeState.initialized) return undefined
    const controller = new AbortController()
    setLoadingHourly(true)
    const params = { from: range.from, to: range.to }
    getHourly(code, params, { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setHourly(response.data.data)
      })
      .catch(error => {
        if (!controller.signal.aborted && error?.code !== 'ERR_CANCELED') setHourly([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHourly(false)
      })
    return () => controller.abort()
  }, [code, range, rangeState.initialized])

  useEffect(() => {
    setLoadBinaural(false)
    setLoadSpectral(false)
    setBinaural([])
    setSpectral([])
    setBinauralMeta(null)
    setSpectralMeta(null)
  }, [code, range.from, range.to])

  useEffect(() => {
    const observe = (element, onVisible) => {
      if (!element) return () => {}
      if (!('IntersectionObserver' in window)) {
        onVisible(true)
        return () => {}
      }
      const observer = new IntersectionObserver(
        entries => {
          if (entries.some(entry => entry.isIntersecting)) {
            onVisible(true)
            observer.disconnect()
          }
        },
        { rootMargin: '500px 0px' },
      )
      observer.observe(element)
      return () => observer.disconnect()
    }
    const cleanupBinaural = observe(binauralSectionRef.current, setLoadBinaural)
    const cleanupSpectral = observe(spectralSectionRef.current, setLoadSpectral)
    return () => {
      cleanupBinaural()
      cleanupSpectral()
    }
  }, [code, range.from, range.to])

  useEffect(() => {
    if (!loadBinaural || !rangeState.initialized) return undefined
    const controller = new AbortController()
    setLoadingBinaural(true)
    getBinaural(code, { from: range.from, to: range.to }, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        setBinaural(response.data.data)
        setBinauralMeta(response.data)
      })
      .catch(error => {
        if (!controller.signal.aborted && error?.code !== 'ERR_CANCELED') setBinaural([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingBinaural(false)
      })
    return () => controller.abort()
  }, [code, range.from, range.to, loadBinaural, rangeState.initialized])

  useEffect(() => {
    if (!loadSpectral || !rangeState.initialized) return undefined
    const controller = new AbortController()
    setLoadingSpectral(true)
    getSpectral(code, { from: range.from, to: range.to }, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        setSpectral(response.data.data)
        setSpectralMeta(response.data)
      })
      .catch(error => {
        if (!controller.signal.aborted && error?.code !== 'ERR_CANCELED') setSpectral([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSpectral(false)
      })
    return () => controller.abort()
  }, [code, range.from, range.to, loadSpectral, rangeState.initialized])

  useEffect(() => {
    if (!rangeState.initialized) return undefined
    let active = true
    setLoadingDaily(true)
    getDailyProfile(code, { date: profileDate })
      .then(r => { if (active) setDaily(r.data.data) })
      .catch(() => { if (active) setDaily([]) })
      .finally(() => { if (active) setLoadingDaily(false) })
    return () => { active = false }
  }, [code, profileDate, rangeState.initialized])

  // Carga independiente — solo serie temporal
  useEffect(() => {
    if (!rangeState.initialized) return undefined
    const controller = new AbortController()
    setLoadingMetric(true)
    getMeasurements(code, { from: range.from, to: range.to, metric }, { signal: controller.signal })
      .then(r => {
        if (controller.signal.aborted) return
        setTimeseries(r.data.data)
        setTimeseriesMeta(r.data)
      })
      .catch(error => {
        if (!controller.signal.aborted && error?.code !== 'ERR_CANCELED') setTimeseries([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMetric(false)
      })
    return () => controller.abort()
  }, [code, range, metric, rangeState.initialized])

  useEffect(() => {
    if (!summary?.name) return
    applySeoMetadata(routeSeo(`/mapa-2d/stations/${encodeURIComponent(code)}`, {
      siteUrl: siteUrl(import.meta.env.VITE_SITE_URL),
      station: { name: summary.name, locality: summary.locality },
    }, t))
  }, [code, summary?.locality, summary?.name, t])

  const handleStationChange = (newCode) => {
    navigate(map2DStationPath(newCode))
  }

  const stationName = summary?.name
    ?? stations.find(station => station.station_code === code)?.name
    ?? code

  const coverageRatio = getCoverageRatio([
    { data: hourly, timeKey: 'hour_start', valueKeys: ['leq_hour', 'l10', 'l50', 'l90'] },
    { data: timeseries, timeKey: 'recorded_at', valueKeys: ['value'] },
    { data: binaural, timeKey: 'recorded_at', valueKeys: ['ild_db', 'interaural_correlation'] },
    { data: spectral, timeKey: 'recorded_at', valueKeys: ['dominant_frequency', 'spectral_centroid', 'spectral_rolloff', 'zero_crossing_rate'] },
  ], range)
  const automaticAxisMode = coverageRatio !== null && coverageRatio < AUTO_FOCUS_THRESHOLD ? 'data' : 'range'
  const activeAxisMode = axisMode === 'auto' ? automaticAxisMode : axisMode

  return (
    <div className="dashboard-page dashboard-station-page">
      <header className="dashboard-station-header">
        <div>
          <p className="dashboard-breadcrumb">
            <Link to={ROUTES.map2D}>{t('landing.2d_map')}</Link> / <span>{stationName}</span>
          </p>
          <h1 tabIndex={-1}>{stationName}</h1>
          <p className="dashboard-station-header__meta">{summary?.locality} · {summary?.is_active ? t('maps.active_2') : t('common.inactive')}</p>
        </div>

        {summary && (
          <div className="dashboard-station-header__stats">
            <div className="dashboard-inline-stat">
              <p className="dashboard-inline-stat__label">{t('maps.latest_leq')}</p>
              <p className="dashboard-inline-stat__value">
                {t.number(summary.latest_leq_dbfs, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? t('common.no_reading')} <span className="dashboard-inline-stat__unit">dBFS</span>
              </p>
            </div>
            <div className="dashboard-inline-stat">
              <p className="dashboard-inline-stat__label">{t('common.total_measurements')}</p>
              <p className="dashboard-inline-stat__value">{summary.total_measurements?.toLocaleString(t.locale)}</p>
            </div>
            <div className="dashboard-inline-stat">
              <p className="dashboard-inline-stat__label">{t('common.latest_measurement_2')}</p>
              <p className="dashboard-inline-stat__value dashboard-inline-stat__value--date">
                {formatDateTime(summary.latest_recorded_at, t)}
              </p>
            </div>
          </div>
        )}
      </header>

      <div className="dashboard-controls">
        {stations.length > 0 && (
          <div className="dashboard-field">
            <label htmlFor="station-select">{t('common.change_station')}</label>
            <select
              id="station-select"
              value={code}
              onChange={e => handleStationChange(e.target.value)}
              className="dashboard-select"
            >
              {stations.map(s => (
                <option key={s.station_code} value={s.station_code}>
                  {s.name} ({s.locality})
                </option>
              ))}
            </select>
          </div>
        )}
        <DateRangePicker
          value={range}
          preset={rangePreset}
          anchorTimestamp={rangeState.anchorTimestamp}
          isHistoricalRange={rangeState.historical}
          onChange={(nextRange, metadata) => {
            setRange(nextRange)
            setRangePreset(metadata?.type === 'preset' ? metadata.label : '')
            setRangeState(current => ({
              ...current,
              initialized: true,
              historical: metadata?.type === 'preset' && current.historical,
              anchorTimestamp: metadata?.type === 'preset' && current.historical ? current.anchorTimestamp : null,
            }))
          }}
        />
      </div>

      {rangeState.historical && (
        <HistoricalRangeNotice
          range={range}
          latestTimestamp={summary?.latest_recorded_at}
          onReturnToCurrent={() => {
            setRange(buildPresetRange(DEFAULT_RANGE_HOURS))
            setRangePreset('24h')
            setRangeState({ initialized: true, historical: false, anchorTimestamp: null })
          }}
        />
      )}

      {rangeState.initialized && summary?.total_measurements === 0 && (
        <NoMeasurementsNotice>{t('common.this_station_has_no_recorded_measurements_yet_they_will')}</NoMeasurementsNotice>
      )}

      <div className="dashboard-chart-axis-toolbar">
        <ChartAxisModeControl
          mode={activeAxisMode}
          automaticMode={automaticAxisMode}
          isAutomatic={axisMode === 'auto'}
          onChange={setAxisMode}
          range={range}
        />
      </div>

      <div className="dashboard-page dashboard-station-charts">

          {/* Banda L10/L50/L90 */}
          <SectionCard
            title={t('maps.hourly_levels_leq_l10_l90')}
        csvTitle={defaultT('maps.hourly_levels_leq_l10_l90')}
            info={t('common.level_bands_help')}
            stationCode={code}
            downloadData={hourly}
          >
            {loadingHourly
              ? <ChartSkeleton height={220} showLegend={false} label={t('common.loading_hourly_levels')} />
              : <LevelBandChart data={hourly} axisMode={activeAxisMode} />
            }
            <p className="text-xs text-text-light mt-1">{t('common.l90_background_noise_leq_equivalent_level_l10_noise_peaks')}</p>
          </SectionCard>

          {/* Perfil diario */}
          <SectionCard
            title={t('maps.daily_profile', { p0: profileDate })}
        csvTitle={defaultT('maps.daily_profile', { p0: profileDate })}
            info={t('common.daily_bars_help')}
            stationCode={code}
            downloadData={daily}
          >
            <div className="dashboard-field dashboard-profile-date-field">
              <label htmlFor="station-profile-date">{t('maps.profile_day_bogota_time')}</label>
              <input
                id="station-profile-date"
                type="date"
                value={profileDate}
                min={bogotaDate(range.from)}
                max={bogotaDate(range.to)}
                onChange={event => setProfileDate(event.target.value)}
                className="dashboard-input"
              />
            </div>
            {loadingDaily
              ? <ChartSkeleton height={220} showLegend={false} label={t('common.loading_daily_profile')} />
              : <DailyBarChart data={daily} />
            }
            <p className="text-xs text-text-light mt-1">{t('common.leq_by_hour_of_day_color_indicates_level')}</p>
          </SectionCard>

          {/* Serie temporal con selector de métrica */}
          <SectionCard
            title={t('common.time_series_by_metric')}
        csvTitle={defaultT('common.time_series_by_metric')}
            info={getMetricDescription(metric, t)}
            fileLabel={metric}
            svgTitle={METRIC_LABELS(t)[metric] ?? metric}
            stationCode={code}
            downloadData={timeseries.map(d => ({ timestamp: d.recorded_at, [metric]: d.value }))}
          >
            <div className="dashboard-field">
              <label htmlFor="station-metric-selector">{t('common.series_metric')}</label>
              <MetricSelector value={metric} onChange={setMetric} className="dashboard-select" id="station-metric-selector" />
            </div>
            {loadingMetric
              ? <ChartSkeleton height={220} showLegend={false} label={t('common.updating_chart')} />
              : <TimeSeriesChart data={timeseries} metricLabel={metric} unit="dBFS" axisMode={activeAxisMode} />
            }
            <ResolutionNotice meta={timeseriesMeta} />
          </SectionCard>

          {/* ILD + correlación */}
          <div ref={binauralSectionRef}>
          <ResolutionNotice meta={binauralMeta} />
          <div className="dashboard-chart-grid">
            <SectionCard
              title={t('maps.ild_interaural_difference_2')}
        csvTitle={defaultT('maps.ild_interaural_difference_2')}
              info={getMetricDescription('ild_db', t)}
            stationCode={code}
              downloadData={binaural.map(d => ({ timestamp: d.recorded_at, ild_db: d.ild_db }))}
            >
              {!loadBinaural
                ? <ChartSkeleton height={220} showLegend={false} label={t('common.the_binaural_chart_will_load_as_you_scroll_closer')} />
                : loadingBinaural
                  ? <ChartSkeleton height={220} showLegend={false} label={t('common.loading_ild')} />
                  : <ILDChart data={binaural} axisMode={activeAxisMode} />
              }
              <p className="text-xs text-text-light mt-1">{t('common.blue_left_dominance_orange_right')}</p>
            </SectionCard>

            <SectionCard
              title={t('maps.interaural_correlation')}
        csvTitle={defaultT('maps.interaural_correlation')}
              info={getMetricDescription('interaural_correlation', t)}
            stationCode={code}
              downloadData={binaural.map(d => ({ timestamp: d.recorded_at, interaural_correlation: d.interaural_correlation }))}
            >
              {!loadBinaural
                ? <ChartSkeleton height={220} showLegend={false} label={t('common.the_binaural_chart_will_load_as_you_scroll_closer')} />
                : loadingBinaural
                  ? <ChartSkeleton height={220} showLegend={false} label={t('common.loading_interaural_correlation')} />
                  : <TimeSeriesChart
                      data={binaural.map(d => ({
                        recorded_at: d.recorded_at,
                        value: d.interaural_correlation,
                        value_min: d.interaural_correlation_min,
                        value_max: d.interaural_correlation_max,
                        source_count: d.source_count,
                      }))}
                      metricLabel={t('landing.correlation')}
                      unit=""
                      axisMode={activeAxisMode}
                    />
              }
              <p className="text-xs text-text-light mt-1">{t('common.1_diffuse_frontal_field_0_lateral_source')}</p>
            </SectionCard>
          </div>
          </div>

          {/* Espectral */}
          <div ref={spectralSectionRef}>
          <ResolutionNotice meta={spectralMeta} />
          <div className="dashboard-chart-grid">
            <SectionCard
              title={t('common.spectral_centroid_hz')}
        csvTitle={defaultT('common.spectral_centroid_hz')}
              info={getMetricDescription('spectral_centroid', t)}
            stationCode={code}
              downloadData={spectral.map(d => ({ timestamp: d.recorded_at, spectral_centroid_hz: d.spectral_centroid }))}
            >
              {!loadSpectral
                ? <ChartSkeleton height={220} showLegend={false} label={t('common.the_spectral_chart_will_load_as_you_scroll_closer')} />
                : loadingSpectral
                  ? <ChartSkeleton height={220} showLegend={false} label={t('common.loading_spectral_centroid')} />
                  : <TimeSeriesChart
                      data={spectral.map(d => ({
                        recorded_at: d.recorded_at,
                        value: d.spectral_centroid,
                        value_min: d.spectral_centroid_min,
                        value_max: d.spectral_centroid_max,
                        source_count: d.source_count,
                      }))}
                      metricLabel="Centroide"
                      unit="Hz"
                      axisMode={activeAxisMode}
                    />
              }
            </SectionCard>
            <SectionCard
              title={t('common.dominant_frequency_hz')}
        csvTitle={defaultT('common.dominant_frequency_hz')}
              info={getMetricDescription('dominant_frequency', t)}
            stationCode={code}
              downloadData={spectral.map(d => ({ timestamp: d.recorded_at, dominant_frequency_hz: d.dominant_frequency }))}
            >
              {!loadSpectral
                ? <ChartSkeleton height={220} showLegend={false} label={t('common.the_spectral_chart_will_load_as_you_scroll_closer')} />
                : loadingSpectral
                  ? <ChartSkeleton height={220} showLegend={false} label={t('common.loading_dominant_frequency')} />
                  : <TimeSeriesChart
                      data={spectral.map(d => ({
                        recorded_at: d.recorded_at,
                        value: d.dominant_frequency,
                        value_min: d.dominant_frequency_min,
                        value_max: d.dominant_frequency_max,
                        source_count: d.source_count,
                      }))}
                      metricLabel="Frec. dominante"
                      unit="Hz"
                      axisMode={activeAxisMode}
                    />
              }
            </SectionCard>
          </div>
          </div>

      </div>
    </div>
  )
}

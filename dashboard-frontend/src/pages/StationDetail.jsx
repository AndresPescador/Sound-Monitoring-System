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

// ─── SectionCard con soporte de descarga ──────────────────────────────────────
// cardRef    : ref del div raíz (para html2canvas y querySelector svg)
// title      : título visible + nombre base del archivo descargado
// info       : texto para ChartInfo (tooltip)
// downloadData: array de datos crudos para el CSV (opcional)
// Labels legibles por métrica para títulos de SVG/PNG
const METRIC_LABELS = {
  leq_dbfs:               'Leq (ponderación A)',
  dbfs_level:             'Nivel dBFS',
  rms_energy:             'Energía RMS',
  ch_left_dbfs:           'Canal izquierdo (dBFS)',
  ch_right_dbfs:          'Canal derecho (dBFS)',
  ild_db:                 'ILD: diferencia interaural',
  interaural_correlation: 'Correlación interaural',
  dominant_frequency:     'Frecuencia dominante (Hz)',
  spectral_centroid:      'Centroide espectral (Hz)',
  spectral_rolloff:       'Rolloff espectral (Hz)',
  zero_crossing_rate:     'Tasa de cruces por cero',
}

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

const SectionCard = ({ title, info, downloadData, fileLabel, svgTitle, stationCode, children }) => {
  const cardRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const { downloadPNG, downloadSVG, downloadCSV } = useChartDownload(cardRef, title, downloadData, fileLabel, svgTitle, stationCode)

  const handlePNG = useCallback(async () => {
    setDownloading(true)
    await downloadPNG()
    setDownloading(false)
  }, [downloadPNG])

  return (
    <section ref={cardRef} className="dashboard-section-card">
      <div className="dashboard-section-card__heading">
        <h3>
          {title}
          {info && <ChartInfo text={info} />}
        </h3>
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
  const [profileDate, setProfileDate] = useState(() => bogotaDate(new Date().toISOString()))
  const binauralSectionRef = useRef(null)
  const spectralSectionRef = useRef(null)

  // Cargar lista de estaciones una sola vez
  useEffect(() => {
    getStations()
      .then(r => setStations(r.data))
      .catch(err => console.error('Error cargando estaciones:', err))
  }, [])

  // Cargar resumen de la estación actual
  useEffect(() => {
    getStationSummary(code)
      .then(r => setSummary(r.data))
      .catch(() => {})
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
  }, [code, range])

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
    if (!loadBinaural) return undefined
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
  }, [code, range.from, range.to, loadBinaural])

  useEffect(() => {
    if (!loadSpectral) return undefined
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
  }, [code, range.from, range.to, loadSpectral])

  useEffect(() => {
    let active = true
    setLoadingDaily(true)
    getDailyProfile(code, { date: profileDate })
      .then(r => { if (active) setDaily(r.data.data) })
      .catch(() => { if (active) setDaily([]) })
      .finally(() => { if (active) setLoadingDaily(false) })
    return () => { active = false }
  }, [code, profileDate])

  // Carga independiente — solo serie temporal
  useEffect(() => {
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
  }, [code, range, metric])

  const handleStationChange = (newCode) => {
    navigate(map2DStationPath(newCode))
  }

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
            <Link to={ROUTES.map2D}>Mapa 2D</Link> / <span>{code}</span>
          </p>
          <h1>{summary?.name ?? code}</h1>
          <p className="dashboard-station-header__meta">{summary?.locality} · {summary?.is_active ? 'Activa' : 'Inactiva'}</p>
        </div>

        {summary && (
          <div className="dashboard-station-header__stats">
            <div className="dashboard-inline-stat">
              <p className="dashboard-inline-stat__label">Último Leq</p>
              <p className="dashboard-inline-stat__value">
                {summary.latest_leq_dbfs?.toFixed(1) ?? 'Sin dato'} <span className="dashboard-inline-stat__unit">dBFS</span>
              </p>
            </div>
            <div className="dashboard-inline-stat">
              <p className="dashboard-inline-stat__label">Total mediciones</p>
              <p className="dashboard-inline-stat__value">{summary.total_measurements?.toLocaleString('es-CO')}</p>
            </div>
          </div>
        )}
      </header>

      <div className="dashboard-controls">
        {stations.length > 0 && (
          <div className="dashboard-field">
            <label htmlFor="station-select">Cambiar estación</label>
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
        <DateRangePicker onChange={setRange} />
      </div>

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
            title="Niveles horarios: Leq / L10 / L90"
            info="Esta gráfica muestra tres bandas de nivel de ruido por hora. La banda verde (L90) es el ruido de fondo que casi siempre está presente. La línea azul (Leq) es el nivel promedio. La banda roja (L10) son los picos ocasionales, como bocinas o frenadas. Mientras más separadas estén las bandas, más variable es el ambiente sonoro."
            stationCode={code}
            downloadData={hourly}
          >
            {loadingHourly
              ? <ChartSkeleton height={220} showLegend={false} label="Cargando niveles horarios..." />
              : <LevelBandChart data={hourly} axisMode={activeAxisMode} />
            }
            <p className="text-xs text-text-light mt-1">L90 = ruido de fondo · Leq = nivel equivalente · L10 = picos de ruido</p>
          </SectionCard>

          {/* Perfil diario */}
          <SectionCard
            title={`Perfil diario: ${profileDate}`}
            info="Muestra el nivel de ruido promedio para cada hora del día (0 a 23 horas). Las barras verdes indican horas tranquilas, amarillas un nivel moderado, y rojas un nivel alto. Permite identificar las horas pico de ruido, como el tráfico matutino o el silencio nocturno."
            stationCode={code}
            downloadData={daily}
          >
            <div className="dashboard-field dashboard-profile-date-field">
              <label htmlFor="station-profile-date">Día del perfil (hora Bogotá)</label>
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
              ? <ChartSkeleton height={220} showLegend={false} label="Cargando perfil diario..." />
              : <DailyBarChart data={daily} />
            }
            <p className="text-xs text-text-light mt-1">Leq por hora del día · Color indica nivel</p>
          </SectionCard>

          {/* Serie temporal con selector de métrica */}
          <SectionCard
            title="Serie temporal por métrica"
            info={getMetricDescription(metric)}
            fileLabel={metric}
            svgTitle={METRIC_LABELS[metric] ?? metric}
            stationCode={code}
            downloadData={timeseries.map(d => ({ timestamp: d.recorded_at, [metric]: d.value }))}
          >
            <div className="dashboard-field">
              <label htmlFor="station-metric-selector">Métrica de la serie</label>
              <MetricSelector value={metric} onChange={setMetric} className="dashboard-select" id="station-metric-selector" />
            </div>
            {loadingMetric
              ? <ChartSkeleton height={220} showLegend={false} label="Actualizando gráfica..." />
              : <TimeSeriesChart data={timeseries} metricLabel={metric} unit="dBFS" axisMode={activeAxisMode} />
            }
            <ResolutionNotice meta={timeseriesMeta} />
          </SectionCard>

          {/* ILD + correlación */}
          <div ref={binauralSectionRef}>
          <ResolutionNotice meta={binauralMeta} />
          <div className="dashboard-chart-grid">
            <SectionCard
              title="ILD: diferencia interaural"
              info={getMetricDescription('ild_db')}
            stationCode={code}
              downloadData={binaural.map(d => ({ timestamp: d.recorded_at, ild_db: d.ild_db }))}
            >
              {!loadBinaural
                ? <ChartSkeleton height={220} showLegend={false} label="La gráfica binaural se cargará al acercarte..." />
                : loadingBinaural
                  ? <ChartSkeleton height={220} showLegend={false} label="Cargando ILD..." />
                  : <ILDChart data={binaural} axisMode={activeAxisMode} />
              }
              <p className="text-xs text-text-light mt-1">Azul = predominio izquierdo · Naranja = derecho</p>
            </SectionCard>

            <SectionCard
              title="Correlación interaural"
              info={getMetricDescription('interaural_correlation')}
            stationCode={code}
              downloadData={binaural.map(d => ({ timestamp: d.recorded_at, interaural_correlation: d.interaural_correlation }))}
            >
              {!loadBinaural
                ? <ChartSkeleton height={220} showLegend={false} label="La gráfica binaural se cargará al acercarte..." />
                : loadingBinaural
                  ? <ChartSkeleton height={220} showLegend={false} label="Cargando correlación interaural..." />
                  : <TimeSeriesChart
                      data={binaural.map(d => ({
                        recorded_at: d.recorded_at,
                        value: d.interaural_correlation,
                        value_min: d.interaural_correlation_min,
                        value_max: d.interaural_correlation_max,
                        source_count: d.source_count,
                      }))}
                      metricLabel="Correlación"
                      unit=""
                      axisMode={activeAxisMode}
                    />
              }
              <p className="text-xs text-text-light mt-1">+1 = campo difuso/frontal · 0 = fuente lateral</p>
            </SectionCard>
          </div>
          </div>

          {/* Espectral */}
          <div ref={spectralSectionRef}>
          <ResolutionNotice meta={spectralMeta} />
          <div className="dashboard-chart-grid">
            <SectionCard
              title="Centroide espectral (Hz)"
              info={getMetricDescription('spectral_centroid')}
            stationCode={code}
              downloadData={spectral.map(d => ({ timestamp: d.recorded_at, spectral_centroid_hz: d.spectral_centroid }))}
            >
              {!loadSpectral
                ? <ChartSkeleton height={220} showLegend={false} label="La gráfica espectral se cargará al acercarte..." />
                : loadingSpectral
                  ? <ChartSkeleton height={220} showLegend={false} label="Cargando centroide espectral..." />
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
              title="Frecuencia dominante (Hz)"
              info={getMetricDescription('dominant_frequency')}
            stationCode={code}
              downloadData={spectral.map(d => ({ timestamp: d.recorded_at, dominant_frequency_hz: d.dominant_frequency }))}
            >
              {!loadSpectral
                ? <ChartSkeleton height={220} showLegend={false} label="La gráfica espectral se cargará al acercarte..." />
                : loadingSpectral
                  ? <ChartSkeleton height={220} showLegend={false} label="Cargando frecuencia dominante..." />
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

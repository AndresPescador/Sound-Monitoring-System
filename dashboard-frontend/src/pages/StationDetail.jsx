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
import LevelBandChart   from '../components/charts/LevelBandChart'
import TimeSeriesChart  from '../components/charts/TimeSeriesChart'
import DailyBarChart    from '../components/charts/DailyBarChart'
import ILDChart         from '../components/charts/ILDChart'
import LoadingSpinner   from '../components/shared/LoadingSpinner'
import { getMetricDescription } from '../components/shared/metricDescriptions'
import { useChartDownload } from '../hooks/useChartDownload'

// ─── SectionCard con soporte de descarga ──────────────────────────────────────
// cardRef    : ref del div raíz (para html2canvas y querySelector svg)
// title      : título visible + nombre base del archivo descargado
// info       : texto para ChartInfo (tooltip)
// downloadData: array de datos crudos para el CSV (opcional)
// Labels legibles por métrica para títulos de SVG/PNG
const METRIC_LABELS = {
  leq_dbfs:               'Leq (dBFS)',
  dbfs_level:             'Nivel dBFS',
  rms_energy:             'Energía RMS',
  ch_left_dbfs:           'Canal izquierdo (dBFS)',
  ch_right_dbfs:          'Canal derecho (dBFS)',
  ild_db:                 'ILD — Diferencia interaural',
  interaural_correlation: 'Correlación interaural',
  dominant_frequency:     'Frecuencia dominante (Hz)',
  spectral_centroid:      'Centroide espectral (Hz)',
  spectral_rolloff:       'Rolloff espectral (Hz)',
  zero_crossing_rate:     'Tasa de cruces por cero',
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
    <div ref={cardRef} className="bg-bg border border-border rounded-lg p-4">
      <h3 className="text-sm font-display font-semibold text-text mb-3 flex items-center justify-between">
        <span className="flex items-center">
          {title}
          {info && <ChartInfo text={info} />}
        </span>
        <ChartDownloadMenu
          onPNG={handlePNG}
          onSVG={downloadSVG}
          onCSV={downloadData?.length ? downloadCSV : undefined}
          downloading={downloading}
        />
      </h3>
      {children}
    </div>
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
  const [loadingMain,   setLoadingMain]   = useState(true)
  const [loadingMetric, setLoadingMetric] = useState(false)
  const [metric,        setMetric]        = useState('leq_dbfs')
  const [range,         setRange]         = useState({
    from: subHours(new Date(), 24).toISOString(),
    to:   new Date().toISOString(),
  })

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

  // Carga principal — todo excepto serie temporal
  useEffect(() => {
    setLoadingMain(true)
    const params = { from: range.from, to: range.to }
    const today  = range.to.slice(0, 10)
    Promise.all([
      getHourly(code, params),
      getDailyProfile(code, { date: today }),
      getBinaural(code, params),
      getSpectral(code, params),
    ])
      .then(([h, d, b, s]) => {
        setHourly(h.data.data)
        setDaily(d.data.data)
        setBinaural(b.data.data)
        setSpectral(s.data.data)
      })
      .catch(() => {})
      .finally(() => setLoadingMain(false))
  }, [code, range])

  // Carga independiente — solo serie temporal
  useEffect(() => {
    setLoadingMetric(true)
    getMeasurements(code, { from: range.from, to: range.to, metric })
      .then(r => setTimeseries(r.data.data))
      .catch(() => {})
      .finally(() => setLoadingMetric(false))
  }, [code, range, metric])

  const handleStationChange = (newCode) => {
    navigate(`/stations/${newCode}`)
  }

  return (
    <div className="space-y-5">

      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1">
          <p className="text-xs text-text-muted font-mono mb-1">
            <Link to="/" className="hover:text-primary">Panel</Link>
            {' / '}
            <span className="text-text">{code}</span>
          </p>
          <h1 className="text-xl font-display font-bold text-text">
            {summary?.name ?? code}
          </h1>
          <p className="text-sm text-text-muted">{summary?.locality} · {summary?.is_active ? 'Activa' : 'Inactiva'}</p>
        </div>

        {summary && (
          <div className="flex gap-4 text-sm">
            <div className="text-right">
              <p className="text-text-muted text-xs">Último Leq</p>
              <p className="font-display font-bold text-lg text-text">
                {summary.latest_leq_dbfs?.toFixed(1) ?? '—'} <span className="text-xs font-normal text-text-muted">dBFS</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-text-muted text-xs">Total mediciones</p>
              <p className="font-display font-bold text-lg text-text">{summary.total_measurements?.toLocaleString('es-CO')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Selector de estaciones + Rango de fechas */}
      <div className="flex flex-wrap items-end gap-4">
        {stations.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-display font-medium text-text-muted">Cambiar estación</label>
            <select
              value={code}
              onChange={e => handleStationChange(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg
                         focus:outline-none focus:ring-2 focus:ring-primary min-w-[240px]"
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

      {loadingMain ? <LoadingSpinner label="Cargando gráficas..." /> : (
        <div className="space-y-4">

          {/* Banda L10/L50/L90 */}
          <SectionCard
            title="Niveles horarios — Leq / L10 / L90"
            info="Esta gráfica muestra tres bandas de nivel de ruido por hora. La banda verde (L90) es el ruido de fondo que casi siempre está presente. La línea azul (Leq) es el nivel promedio. La banda roja (L10) son los picos ocasionales, como bocinas o frenadas. Mientras más separadas estén las bandas, más variable es el ambiente sonoro."
            stationCode={code}
            downloadData={hourly}
          >
            <LevelBandChart data={hourly} />
            <p className="text-xs text-text-light mt-1">L90 = ruido de fondo · Leq = nivel equivalente · L10 = picos de ruido</p>
          </SectionCard>

          {/* Perfil diario */}
          <SectionCard
            title={`Perfil diario — ${range.to.slice(0, 10)}`}
            info="Muestra el nivel de ruido promedio para cada hora del día (0 a 23 horas). Las barras verdes indican horas tranquilas, amarillas un nivel moderado, y rojas un nivel alto. Permite identificar las horas pico de ruido, como el tráfico matutino o el silencio nocturno."
            stationCode={code}
            downloadData={daily}
          >
            <DailyBarChart data={daily} />
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
            <div className="mb-3">
              <MetricSelector value={metric} onChange={setMetric} />
            </div>
            {loadingMetric
              ? <LoadingSpinner label="Actualizando gráfica..." />
              : <TimeSeriesChart data={timeseries} metricLabel={metric} unit="dBFS" />
            }
          </SectionCard>

          {/* ILD + correlación */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard
              title="ILD — Diferencia interaural"
              info={getMetricDescription('ild_db')}
            stationCode={code}
              downloadData={binaural.map(d => ({ timestamp: d.recorded_at, ild_db: d.ild_db }))}
            >
              <ILDChart data={binaural} />
              <p className="text-xs text-text-light mt-1">Azul = predominio izquierdo · Naranja = derecho</p>
            </SectionCard>

            <SectionCard
              title="Correlación interaural"
              info={getMetricDescription('interaural_correlation')}
            stationCode={code}
              downloadData={binaural.map(d => ({ timestamp: d.recorded_at, interaural_correlation: d.interaural_correlation }))}
            >
              <TimeSeriesChart
                data={binaural.map(d => ({ recorded_at: d.recorded_at, value: d.interaural_correlation }))}
                metricLabel="Correlación"
                unit=""
              />
              <p className="text-xs text-text-light mt-1">+1 = campo difuso/frontal · 0 = fuente lateral</p>
            </SectionCard>
          </div>

          {/* Espectral */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard
              title="Centroide espectral (Hz)"
              info={getMetricDescription('spectral_centroid')}
            stationCode={code}
              downloadData={spectral.map(d => ({ timestamp: d.recorded_at, spectral_centroid_hz: d.spectral_centroid }))}
            >
              <TimeSeriesChart
                data={spectral.map(d => ({ recorded_at: d.recorded_at, value: d.spectral_centroid }))}
                metricLabel="Centroide"
                unit="Hz"
              />
            </SectionCard>
            <SectionCard
              title="Frecuencia dominante (Hz)"
              info={getMetricDescription('dominant_frequency')}
            stationCode={code}
              downloadData={spectral.map(d => ({ timestamp: d.recorded_at, dominant_frequency_hz: d.dominant_frequency }))}
            >
              <TimeSeriesChart
                data={spectral.map(d => ({ recorded_at: d.recorded_at, value: d.dominant_frequency }))}
                metricLabel="Frec. dominante"
                unit="Hz"
              />
            </SectionCard>
          </div>

        </div>
      )}
    </div>
  )
}
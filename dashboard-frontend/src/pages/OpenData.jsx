import { useState, useEffect } from 'react'
import { subHours, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getStations }    from '../api/stations'
import { getMeasurements, getRawMeasurements } from '../api/measurements'
import { getHourly }       from '../api/aggregations'
import DateRangePicker     from '../components/shared/DateRangePicker'
import LoadingSpinner      from '../components/shared/LoadingSpinner'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  try { return format(parseISO(iso), "d MMM yyyy HH:mm", { locale: es }) }
  catch { return iso }
}

const toCSV = (rows, columns) => {
  const header = columns.map(c => c.label).join(',')
  const body   = rows.map(row =>
    columns.map(c => {
      const v = row[c.key]
      if (v == null) return ''
      if (typeof v === 'string' && v.includes(',')) return `"${v}"`
      return v
    }).join(',')
  )
  return [header, ...body].join('\n')
}

const downloadCSV = (content, filename) => {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Columnas de cada tabla ────────────────────────────────────────────────────
const RAW_COLS = [
  { key: 'recorded_at',           label: 'Fecha y hora (UTC)' },
  { key: 'dbfs_level',            label: 'dBFS nivel (dBFS)' },
  { key: 'leq_dbfs',              label: 'Leq ponderado A (dBFS)' },
  { key: 'rms_energy',            label: 'Energía RMS' },
  { key: 'ch_left_dbfs',          label: 'Canal izquierdo (dBFS)' },
  { key: 'ch_right_dbfs',         label: 'Canal derecho (dBFS)' },
  { key: 'ild_db',                label: 'ILD (dB)' },
  { key: 'interaural_correlation',label: 'Correlación interaural' },
  { key: 'dominant_frequency',    label: 'Frec. dominante (Hz)' },
  { key: 'spectral_centroid',     label: 'Centroide espectral (Hz)' },
  { key: 'spectral_rolloff',      label: 'Rolloff espectral (Hz)' },
  { key: 'zero_crossing_rate',    label: 'Tasa cruces por cero' },
]

const AGG_COLS = [
  { key: 'hour_start',        label: 'Hora inicio (UTC)' },
  { key: 'leq_hour',          label: 'Leq hora (dBFS)' },
  { key: 'l10',               label: 'L10 (dBFS)' },
  { key: 'l50',               label: 'L50 (dBFS)' },
  { key: 'l90',               label: 'L90 (dBFS)' },
  { key: 'dbfs_min',          label: 'dBFS mín' },
  { key: 'dbfs_max',          label: 'dBFS máx' },
  { key: 'dbfs_avg',          label: 'dBFS prom' },
  { key: 'measurement_count', label: 'Mediciones' },
]

// ── Componente de tabla ───────────────────────────────────────────────────────
function DataTable({ columns, rows, loading }) {
  if (loading) return <LoadingSpinner />
  if (!rows.length) return (
    <p className="dashboard-empty-state">
      Sin datos en el rango seleccionado.
    </p>
  )

  return (
    <div className="dashboard-data-table-wrap">
      <table className="dashboard-data-table">
        <thead>
          <tr className="bg-surface border-b border-border">
            {columns.map(c => (
              <th key={c.key}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key}>
                  {c.key.endsWith('_at') || c.key === 'hour_start'
                    ? fmtDate(row[c.key])
                    : typeof row[c.key] === 'number'
                      ? row[c.key].toFixed(4)
                      : row[c.key] ?? 'Sin dato'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dashboard-data-table__count">
        {rows.length} registros
      </p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function OpenData() {
  const [stations,   setStations]   = useState([])
  const [station,    setStation]    = useState('')
  const [tab,        setTab]        = useState('raw')   // 'raw' | 'hourly'
  const [rawData,    setRawData]    = useState([])
  const [hourlyData, setHourlyData] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [range,      setRange]      = useState({
    from: subHours(new Date(), 24).toISOString(),
    to:   new Date().toISOString(),
  })

  useEffect(() => {
    getStations().then(r => {
      setStations(r.data)
      if (r.data.length) setStation(r.data[0].station_code)
    })
  }, [])

  useEffect(() => {
    if (!station) return
    setLoading(true)
    const params = { from: range.from, to: range.to, limit: 5000 }
    Promise.all([
      getRawMeasurements(station, params),  // ← CAMBIAR aquí
      getHourly(station, { from: range.from, to: range.to }),
    ])
      .then(([m, h]) => {
        setRawData(m.data.data)
        setHourlyData(h.data.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [station, range])

  const handleDownload = () => {
    if (!station) return
    const isRaw     = tab === 'raw'
    const cols      = isRaw ? RAW_COLS : AGG_COLS
    const rows      = isRaw ? rawData  : hourlyData
    const fromLabel = range.from.slice(0, 10)
    const toLabel   = range.to.slice(0, 10)
    const filename  = `${station}_${isRaw ? 'mediciones' : 'agregaciones'}_${fromLabel}_${toLabel}.csv`
    downloadCSV(toCSV(rows, cols), filename)
  }

  const activeRows = tab === 'raw' ? rawData : hourlyData
  const activeCols = tab === 'raw' ? RAW_COLS : AGG_COLS

  return (
    <div className="dashboard-page dashboard-open-data-page">
      <header className="dashboard-open-data-intro">
        <div>
          <h1>Portal de datos abiertos</h1>
          <p>
            Datos acústicos del Sistema de Monitoreo Binaural de Bogotá D.C.
            Consulta y descarga mediciones en formato CSV para análisis externos.
          </p>
        </div>
        <span className="dashboard-open-data-badge">Datos abiertos. Libre uso.</span>
      </header>

      {/* Controles */}
      <div className="dashboard-controls">

        {/* Selector de estación */}
        <div className="dashboard-field">
          <label htmlFor="open-data-station">Estación</label>
          <select
            id="open-data-station"
            value={station}
            onChange={e => setStation(e.target.value)}
            className="dashboard-select"
          >
            {stations.map(s => (
              <option key={s.station_code} value={s.station_code}>
                {s.name} ({s.locality})
              </option>
            ))}
          </select>
        </div>

        <div className="dashboard-field">
          <label>Rango de tiempo</label>
          <DateRangePicker onChange={setRange} />
        </div>
      </div>

      {/* Tabs + botón descarga */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="dashboard-tabs" role="tablist" aria-label="Tipo de datos">
          {[
            { key: 'raw',    label: `Mediciones crudas (${rawData.length})` },
            { key: 'hourly', label: `Agregaciones horarias (${hourlyData.length})` },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`dashboard-tab ${tab === t.key ? 'dashboard-tab--active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={!activeRows.length}
          className="dashboard-download-button"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Descargar CSV ({activeRows.length} filas)
        </button>
      </div>

      <div className="dashboard-open-data-note">
        <strong>Sobre estos datos.</strong> El rango seleccionado se descarga en UTC y los niveles acústicos están expresados en dBFS. El Leq usa ponderación A según IEC 61672.
      </div>

      <DataTable columns={activeCols} rows={activeRows} loading={loading} />

    </div>
  )
}

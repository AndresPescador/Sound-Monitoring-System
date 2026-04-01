import { useState, useEffect } from 'react'
import { subHours, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getStations }    from '../api/stations'
import { getMeasurements } from '../api/measurements'
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
    <p className="text-center text-sm text-text-muted py-10">
      Sin datos en el rango seleccionado.
    </p>
  )

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="bg-surface border-b border-border">
            {columns.map(c => (
              <th key={c.key} className="px-3 py-2 text-left font-display font-semibold text-text-muted whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-bg' : 'bg-surface'} hover:bg-blue-50 transition-colors`}>
              {columns.map(c => (
                <td key={c.key} className="px-3 py-1.5 text-text whitespace-nowrap">
                  {c.key.endsWith('_at') || c.key === 'hour_start'
                    ? fmtDate(row[c.key])
                    : typeof row[c.key] === 'number'
                      ? row[c.key].toFixed(4)
                      : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right text-xs text-text-light font-mono px-3 py-2">
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
      getMeasurements(station, params),
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
    <div className="space-y-6">

      {/* Header tipo portal */}
      <div className="border-b border-border pb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-display font-bold text-text">Portal de datos abiertos</h1>
            <p className="text-sm text-text-muted mt-0.5 max-w-xl">
              Datos acústicos del Sistema de Monitoreo Binaural de Bogotá D.C.
              Consulta y descarga mediciones en formato CSV para análisis externos.
            </p>
          </div>
          <span className="px-3 py-1 text-xs rounded-full border border-primary text-primary font-display font-medium">
            Datos abiertos · Libre uso
          </span>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-4">

        {/* Selector de estación */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-display font-medium text-text-muted">Estación</label>
          <select
            value={station}
            onChange={e => setStation(e.target.value)}
            className="border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg
                       focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
          >
            {stations.map(s => (
              <option key={s.station_code} value={s.station_code}>
                {s.name} ({s.locality})
              </option>
            ))}
          </select>
        </div>

        {/* Rango de fechas */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-display font-medium text-text-muted">Rango de tiempo</label>
          <DateRangePicker onChange={setRange} />
        </div>
      </div>

      {/* Tabs + botón descarga */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 border border-border rounded-lg p-1 bg-surface">
          {[
            { key: 'raw',    label: `Mediciones crudas (${rawData.length})` },
            { key: 'hourly', label: `Agregaciones horarias (${hourlyData.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-display font-medium transition-colors ${
                tab === t.key ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleDownload}
          disabled={!activeRows.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm
                     font-display font-medium hover:bg-primary-dark transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Descargar CSV ({activeRows.length} filas)
        </button>
      </div>

      {/* Nota sobre los datos */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-primary font-sans">
        <strong className="font-display">Nota:</strong> Los datos descargados corresponden al rango de tiempo y estación seleccionados.
        Las marcas de tiempo están en UTC. Los valores de nivel acústico están en dBFS (Full Scale).
        El Leq usa ponderación A según la norma IEC 61672.
      </div>

      {/* Tabla */}
      <DataTable columns={activeCols} rows={activeRows} loading={loading} />

    </div>
  )
}

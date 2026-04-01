import { useEffect, useState } from 'react'
import { subHours }       from 'date-fns'
import { getCompare }     from '../api/compare'
import CompareChart       from '../components/charts/CompareChart'
import DateRangePicker    from '../components/shared/DateRangePicker'
import LoadingSpinner     from '../components/shared/LoadingSpinner'

const COMPARE_METRICS = [
  { value: 'leq_hour',            label: 'Leq horario' },
  { value: 'l10',                 label: 'L10 (picos)' },
  { value: 'l50',                 label: 'L50 (típico)' },
  { value: 'l90',                 label: 'L90 (fondo)' },
  { value: 'dbfs_avg',            label: 'dBFS promedio' },
  { value: 'avg_spectral_centroid', label: 'Centroide espectral' },
  { value: 'avg_ild_db',          label: 'ILD promedio' },
]

export default function Compare() {
  const [series,  setSeries]  = useState([])
  const [metric,  setMetric]  = useState('leq_hour')
  const [loading, setLoading] = useState(true)
  const [range,   setRange]   = useState({
    from: subHours(new Date(), 24).toISOString(),
    to:   new Date().toISOString(),
  })

  useEffect(() => {
    setLoading(true)
    getCompare({ metric, from: range.from, to: range.to })
      .then(r => setSeries(r.data.series))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [metric, range])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-bold text-text">Comparación entre estaciones</h1>
        <p className="text-sm text-text-muted mt-0.5">Todas las estaciones activas en el rango seleccionado</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <DateRangePicker onChange={setRange} />
        <select
          value={metric}
          onChange={e => setMetric(e.target.value)}
          className="border border-border rounded px-3 py-1.5 text-sm font-sans text-text bg-bg
                     focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {COMPARE_METRICS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-bg border border-border rounded-lg p-4">
        {loading
          ? <LoadingSpinner />
          : <CompareChart series={series} metricLabel={COMPARE_METRICS.find(m => m.value === metric)?.label} />
        }
      </div>

      {!loading && series.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {series.map(s => (
            <div key={s.station_code} className="bg-bg border border-border rounded-lg p-3">
              <p className="text-xs font-mono text-text-muted">{s.station_code}</p>
              <p className="text-sm font-display font-semibold text-text">{s.locality}</p>
              <p className="text-xs text-text-light">{s.data.length} puntos</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { getSystemStats } from '../api/system'
import { getStations }    from '../api/stations'
import StatCard            from '../components/cards/StatCard'
import StationCard         from '../components/cards/StationCard'
import StationMap          from '../components/map/StationMap'
import LoadingSpinner      from '../components/shared/LoadingSpinner'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Home() {
  const [stats,    setStats]    = useState(null)
  const [stations, setStations] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    Promise.all([getSystemStats(), getStations()])
      .then(([sr, st]) => {
        setStats(sr.data)
        setStations(st.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Cargando panel principal..." />
  if (error)   return <p className="text-noise-high text-sm p-4">Error: {error}</p>

  const lastSeen = stats?.last_measurement_received_at
    ? format(parseISO(stats.last_measurement_received_at), "d MMM yyyy HH:mm", { locale: es })
    : null

  return (
    <div className="space-y-6">

      {/* Título */}
      <div>
        <h1 className="text-xl font-display font-bold text-text">Panel de monitoreo acústico</h1>
        <p className="text-sm text-text-muted mt-0.5">Localidades de Bogotá D.C. — datos en tiempo real</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Estaciones activas" value={stats?.active_stations}   accent />
        <StatCard label="Total estaciones"   value={stats?.total_stations} />
        <StatCard label="Mediciones totales" value={stats?.total_measurements?.toLocaleString('es-CO')} />
        <StatCard label="Última medición"    value={lastSeen ?? '—'} sub="fecha y hora" />
      </div>

      {/* Mapa + tarjetas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Mapa */}
        <div className="lg:col-span-2 bg-bg border border-border rounded-lg overflow-hidden" style={{ height: 420 }}>
          <StationMap stations={stations} />
        </div>

        {/* Lista de estaciones */}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[420px] pr-1">
          <p className="text-xs font-display font-semibold text-text-muted uppercase tracking-wide px-1">
            Estaciones ({stations.length})
          </p>
          {stations.map(s => <StationCard key={s.station_code} station={s} />)}
          {!stations.length && <p className="text-sm text-text-muted">No hay estaciones registradas.</p>}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-text-muted font-sans">
        <span className="font-display font-medium">Nivel de ruido:</span>
        {[['noise-low','Bajo (< −30 dBFS)'],['noise-medium','Moderado (−30 a −20)'],['noise-high','Alto (> −20 dBFS)']].map(([cls, lbl]) => (
          <span key={cls} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full bg-${cls}`} />
            {lbl}
          </span>
        ))}
      </div>
    </div>
  )
}

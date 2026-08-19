import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

  if (loading) return <LoadingSpinner label="Cargando mapa 2D..." />
  if (error)   return <p className="dashboard-error" role="alert">No fue posible cargar el mapa 2D: {error}</p>

  const lastSeen = stats?.last_measurement_received_at
    ? format(parseISO(stats.last_measurement_received_at), "d MMM yyyy HH:mm", { locale: es })
    : null

  return (
    <div className="dashboard-page dashboard-home">
      <header className="dashboard-page-header">
        <div>
          <h1>Mapa 2D</h1>
          <p>Estado actual de la red de estaciones y lectura rápida del ruido ambiental en Bogotá D.C.</p>
        </div>
        <div className="dashboard-page-header__actions">
          <a href="#estaciones" className="dashboard-button dashboard-button--secondary">Ver estaciones</a>
          <Link to="/compare" className="dashboard-button dashboard-button--primary">Comparar datos</Link>
        </div>
      </header>

      <div className="dashboard-stat-grid">
        <StatCard label="Estaciones activas" value={stats?.active_stations}   accent />
        <StatCard label="Total estaciones"   value={stats?.total_stations} />
        <StatCard label="Mediciones totales" value={stats?.total_measurements?.toLocaleString('es-CO')} />
        <StatCard label="Última medición"    value={lastSeen ?? 'Sin registro'} sub="fecha y hora" />
      </div>

      <section className="dashboard-map-layout" aria-labelledby="map-heading">
        <div className="dashboard-map-panel">
          <div className="dashboard-panel-heading">
            <div>
              <h2 id="map-heading">Lecturas por estación</h2>
              <p>Selecciona un punto para consultar el detalle acústico.</p>
            </div>
            <span className="dashboard-panel-status">Actualización reciente</span>
          </div>
          <div className="dashboard-map-canvas">
            <StationMap stations={stations} />
          </div>
          <div className="dashboard-map-legend" aria-label="Niveles de ruido">
            <span className="dashboard-map-legend__title">Nivel de ruido</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--low" aria-hidden="true" />Bajo</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--medium" aria-hidden="true" />Moderado</span>
            <span className="dashboard-map-legend__item"><i className="dashboard-map-legend__dot dashboard-map-legend__dot--high" aria-hidden="true" />Alto</span>
          </div>
        </div>

        <aside className="dashboard-station-panel" id="estaciones" aria-labelledby="stations-heading">
          <div className="dashboard-station-panel__heading">
            <h2 id="stations-heading">Estaciones</h2>
            <span>{stations.length} registradas</span>
          </div>
          <div className="dashboard-station-list">
          {stations.map(s => <StationCard key={s.station_code} station={s} />)}
          {!stations.length && <p className="dashboard-empty-state">No hay estaciones registradas.</p>}
          </div>
        </aside>
      </section>
    </div>
  )
}
